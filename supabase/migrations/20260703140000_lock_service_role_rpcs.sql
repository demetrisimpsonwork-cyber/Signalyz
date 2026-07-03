-- Phase 10.5C — Lock service-role-only RPCs (grant hardening + in-function role guard)
-- Supabase default grants can leave EXECUTE on anon/authenticated after GRANT TO service_role.
-- Do not edit 20260703130000_p1_security_hardening.sql (already applied).

-- ── Internal: service-role caller assertion ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_service_role_caller()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_service_role_caller() FROM PUBLIC;

-- ── Internal credit helper (not directly callable by clients) ───────────────────
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
REVOKE EXECUTE ON FUNCTION public._consume_one_time_purchase_credit(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._consume_one_time_purchase_credit(uuid) FROM authenticated;

-- ── Service-role: redeem one credit for a report run fingerprint ──────────────
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
  PERFORM public._assert_service_role_caller();

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
REVOKE EXECUTE ON FUNCTION public.redeem_one_time_credit_for_run(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.redeem_one_time_credit_for_run(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_one_time_credit_for_run(uuid, text) TO service_role;

-- ── Service-role: deprecated per-user credit consume ──────────────────────────
CREATE OR REPLACE FUNCTION public.consume_one_time_credit_for_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_id uuid;
BEGIN
  PERFORM public._assert_service_role_caller();

  credit_id := public._consume_one_time_purchase_credit(p_user_id);
  RETURN credit_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_one_time_credit_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_one_time_credit_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.consume_one_time_credit_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit_for_user(uuid) TO service_role;

-- ── Internal: daily run counter (callable from definer wrappers) ──────────────
CREATE OR REPLACE FUNCTION public._increment_run_count_for_user(p_user_id uuid)
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

REVOKE ALL ON FUNCTION public._increment_run_count_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._increment_run_count_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._increment_run_count_for_user(uuid) FROM authenticated;

-- ── Service-role: daily run counter ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_run_count_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_service_role_caller();
  PERFORM public._increment_run_count_for_user(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_run_count_for_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_run_count_for_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_run_count_for_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_run_count_for_user(uuid) TO service_role;

-- ── User-callable wrappers: authenticated only, auth.uid() enforced ───────────
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
REVOKE EXECUTE ON FUNCTION public.consume_one_time_credit() FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit() TO authenticated;

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
REVOKE EXECUTE ON FUNCTION public.consume_one_time_credit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_one_time_credit(uuid) TO authenticated;

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
  PERFORM public._increment_run_count_for_user(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.increment_run_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_run_count(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_run_count(uuid) TO authenticated;
