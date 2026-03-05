
-- Block ALL anonymous reads on every user data table
CREATE POLICY "Block anon reads on profiles"
ON public.profiles FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on alignment_history"
ON public.alignment_history FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on runs"
ON public.runs FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on run_artifacts"
ON public.run_artifacts FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on optimizations"
ON public.optimizations FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on subscription_events"
ON public.subscription_events FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on usage_tracking"
ON public.usage_tracking FOR SELECT TO anon USING (false);

CREATE POLICY "Block anon reads on user_roles"
ON public.user_roles FOR SELECT TO anon USING (false);

-- Block anon inserts on alignment_history
CREATE POLICY "Block anon inserts on alignment_history"
ON public.alignment_history FOR INSERT TO anon WITH CHECK (false);

-- Block anon inserts on subscription_events
CREATE POLICY "Block anon inserts on subscription_events"
ON public.subscription_events FOR INSERT TO anon WITH CHECK (false);

-- Block anon inserts on usage_tracking
CREATE POLICY "Block anon inserts on usage_tracking"
ON public.usage_tracking FOR INSERT TO anon WITH CHECK (false);
