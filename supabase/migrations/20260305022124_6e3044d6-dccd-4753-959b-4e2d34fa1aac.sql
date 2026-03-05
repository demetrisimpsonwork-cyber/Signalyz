
-- Additional security hardening: close remaining gaps

-- 1. Guest runs data: tighten anon SELECT to prevent reading ALL guest data
-- Remove broad anon read policy on runs, replace with no anon SELECT
-- (guest results are returned directly from the edge function response)
DROP POLICY IF EXISTS "Anon can read guest runs" ON public.runs;
DROP POLICY IF EXISTS "Anon can update guest runs" ON public.runs;

-- 2. Same for run_artifacts: remove anon SELECT
DROP POLICY IF EXISTS "Anon can read guest run artifacts" ON public.run_artifacts;

-- 3. Add explicit no-delete policies where missing
-- subscription_events: no one can delete
CREATE POLICY "No delete on subscription_events"
ON public.subscription_events FOR DELETE TO authenticated
USING (false);

-- usage_tracking: no delete by regular users
CREATE POLICY "No delete on usage_tracking"
ON public.usage_tracking FOR DELETE TO authenticated
USING (false);

-- alignment_history: users can only delete their own
CREATE POLICY "Users can delete own history"
ON public.alignment_history FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- optimizations: no update/delete
CREATE POLICY "No update on optimizations"
ON public.optimizations FOR UPDATE TO authenticated
USING (false);

CREATE POLICY "No delete on optimizations"
ON public.optimizations FOR DELETE TO authenticated
USING (false);
