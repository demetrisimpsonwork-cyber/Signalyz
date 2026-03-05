
-- ═══════════════════════════════════════════════════════════
-- SECURITY HARDENING MIGRATION
-- ═══════════════════════════════════════════════════════════

-- 1. FIX RUNS TABLE: Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert runs" ON public.runs;
DROP POLICY IF EXISTS "Anyone can read completed runs" ON public.runs;
DROP POLICY IF EXISTS "Anyone can update runs" ON public.runs;

-- Authenticated users can only access their own runs
CREATE POLICY "Users can insert own runs"
ON public.runs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own runs"
ON public.runs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own runs"
ON public.runs FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- Guest inserts (user_id NULL) - service role handles this in edge functions
CREATE POLICY "Anon can insert guest runs"
ON public.runs FOR INSERT TO anon
WITH CHECK (user_id IS NULL);

-- Anon can read only guest runs they just created (scoped by input_hash in app logic)
CREATE POLICY "Anon can read guest runs"
ON public.runs FOR SELECT TO anon
USING (user_id IS NULL);

CREATE POLICY "Anon can update guest runs"
ON public.runs FOR UPDATE TO anon
USING (user_id IS NULL);

-- 2. FIX RUN_ARTIFACTS TABLE: Remove overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert run artifacts" ON public.run_artifacts;
DROP POLICY IF EXISTS "Anyone can read run artifacts" ON public.run_artifacts;

-- Authenticated: can read artifacts for their own runs only
CREATE POLICY "Users can read own run artifacts"
ON public.run_artifacts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.runs
    WHERE runs.id = run_artifacts.run_id
    AND runs.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert own run artifacts"
ON public.run_artifacts FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.runs
    WHERE runs.id = run_artifacts.run_id
    AND runs.user_id = auth.uid()
  )
);

-- Anon: can access artifacts for guest runs only
CREATE POLICY "Anon can read guest run artifacts"
ON public.run_artifacts FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.runs
    WHERE runs.id = run_artifacts.run_id
    AND runs.user_id IS NULL
  )
);

CREATE POLICY "Anon can insert guest run artifacts"
ON public.run_artifacts FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.runs
    WHERE runs.id = run_artifacts.run_id
    AND runs.user_id IS NULL
  )
);

-- 3. FIX SUBSCRIPTION_EVENTS: Remove overly permissive INSERT
DROP POLICY IF EXISTS "Service role can insert subscription events" ON public.subscription_events;

-- Only service role can insert (webhooks) - no policy needed for anon/authenticated insert
-- The service role bypasses RLS, so we just remove the permissive policy

-- 4. PROTECT SUBSCRIPTION COLUMNS ON PROFILES
-- Replace the update policy to prevent users from modifying subscription fields
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

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
);

-- 5. FIX USAGE_TRACKING: Remove overly permissive service role policy
DROP POLICY IF EXISTS "Service role full access" ON public.usage_tracking;
-- Service role bypasses RLS anyway, so this policy was unnecessary

-- 6. Ensure optimizations guest data is isolated
DROP POLICY IF EXISTS "Users or guests can insert optimizations" ON public.optimizations;

CREATE POLICY "Authenticated users can insert own optimizations"
ON public.optimizations FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anon guests can insert guest optimizations"
ON public.optimizations FOR INSERT TO anon
WITH CHECK (user_id IS NULL);
