-- Phase 10.5 / 10.5A — P1 security hardening + one-time full-report redemption
-- One credit = one full report/run (same resume+JD fingerprint), not one Pro API call.

-- ── Report redemption ledger ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.one_time_report_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.one_time_purchases(id) ON DELETE CASCADE,
  run_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_time_report_redemptions_user_fingerprint_unique UNIQUE (user_id, run_fingerprint)
);

CREATE INDEX IF NOT EXISTS one_time_report_redemptions_user_id_idx
  ON public.one_time_report_redemptions (user_id);

ALTER TABLE public.one_time_report_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own report redemptions"
  ON public.one_time_report_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── Internal: consume oldest unused credit (service role / definer helpers) ───
CREATE OR REPLACE FUNCTION public._consume_one_time_purchase_credit(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO credit_id
  FROM public.one_time_purchases
  WHERE user_id = p_user_id AND used = false
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF credit_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.one_time_purchases
  SET used = true, used_at = now()
  WHERE id = credit_id AND used = false;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN credit_id;
END;
$$;

REVOKE ALL ON FUNCTION public._consume_one_time_purchase_credit(uuid) FROM PUBLIC;

-- ── Client-facing credit consumption (auth.uid() only, legacy no-arg) ─────────
CREATE OR REPLACE FUNCTION public.consume_one_time_credit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  credit_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  credit_id := public._consume_one_time_purchase_credit(v_user_id);
  RETURN credit_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_one_time_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit() TO authenticated;

-- ── Backward-compatible wrapper (cached frontend bundles) ───────────────────
CREATE OR REPLACE FUNCTION public.consume_one_time_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN public.consume_one_time_credit();
END;
$$;

REVOKE ALL ON FUNCTION public.consume_one_time_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit(uuid) TO authenticated;

-- ── Edge: redeem one credit for a specific report run fingerprint ─────────────
CREATE OR REPLACE FUNCTION public.redeem_one_time_credit_for_run(
  p_user_id uuid,
  p_run_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_id uuid;
  fp text := trim(coalesce(p_run_fingerprint, ''));
BEGIN
  IF p_user_id IS NULL OR fp = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_input');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.one_time_report_redemptions
    WHERE user_id = p_user_id AND run_fingerprint = fp
  ) THEN
    RETURN jsonb_build_object('allowed', true, 'already_redeemed', true);
  END IF;

  credit_id := public._consume_one_time_purchase_credit(p_user_id);
  IF credit_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_credit');
  END IF;

  BEGIN
    INSERT INTO public.one_time_report_redemptions (user_id, purchase_id, run_fingerprint)
    VALUES (p_user_id, credit_id, fp);
  EXCEPTION
    WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM public.one_time_report_redemptions
        WHERE user_id = p_user_id AND run_fingerprint = fp
      ) THEN
        RETURN jsonb_build_object('allowed', true, 'already_redeemed', true);
      END IF;
      RETURN jsonb_build_object('allowed', false, 'reason', 'race_lost');
  END;

  RETURN jsonb_build_object('allowed', true, 'already_redeemed', false, 'purchase_id', credit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_one_time_credit_for_run(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_one_time_credit_for_run(uuid, text) TO service_role;

-- ── Deprecated edge helper — prefer redeem_one_time_credit_for_run ────────────
CREATE OR REPLACE FUNCTION public.consume_one_time_credit_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_id uuid;
BEGIN
  credit_id := public._consume_one_time_purchase_credit(p_user_id);
  RETURN credit_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_one_time_credit_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit_for_user(uuid) TO service_role;

-- ── Service-role-only daily run counter ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_run_count_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET daily_run_count = COALESCE(daily_run_count, 0) + 1
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_run_count_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_run_count_for_user(uuid) TO service_role;

-- ── Backward-compatible wrapper for increment_run_count(p_user_id) ───────────
CREATE OR REPLACE FUNCTION public.increment_run_count(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM public.increment_run_count_for_user(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.increment_run_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_run_count(uuid) TO authenticated;

-- ── Prevent users from manipulating daily_run_count ──────────────────────────
DROP POLICY IF EXISTS "Users can update own non-subscription profile fields" ON public.profiles;

CREATE POLICY "Users can update own non-subscription profile fields"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND subscription_tier IS NOT DISTINCT FROM (SELECT subscription_tier FROM public.profiles WHERE user_id = auth.uid())
  AND subscription_id IS NOT DISTINCT FROM (SELECT subscription_id FROM public.profiles WHERE user_id = auth.uid())
  AND subscription_status IS NOT DISTINCT FROM (SELECT subscription_status FROM public.profiles WHERE user_id = auth.uid())
  AND stripe_customer_id IS NOT DISTINCT FROM (SELECT stripe_customer_id FROM public.profiles WHERE user_id = auth.uid())
  AND subscription_period_end IS NOT DISTINCT FROM (SELECT subscription_period_end FROM public.profiles WHERE user_id = auth.uid())
  AND daily_run_count IS NOT DISTINCT FROM (SELECT daily_run_count FROM public.profiles WHERE user_id = auth.uid())
  AND daily_run_reset_at IS NOT DISTINCT FROM (SELECT daily_run_reset_at FROM public.profiles WHERE user_id = auth.uid())
);

-- ── Embedding rate limit counter ─────────────────────────────────────────────
ALTER TABLE public.usage_tracking
  ADD COLUMN IF NOT EXISTS embedding_count integer NOT NULL DEFAULT 0;
