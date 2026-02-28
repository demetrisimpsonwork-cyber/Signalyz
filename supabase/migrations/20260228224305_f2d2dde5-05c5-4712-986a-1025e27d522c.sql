
-- Drop existing restrictive policies on optimizations
DROP POLICY IF EXISTS "Users can view their own optimizations" ON public.optimizations;
DROP POLICY IF EXISTS "Users or guests can insert optimizations" ON public.optimizations;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Users can view their own optimizations"
  ON public.optimizations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users or guests can insert optimizations"
  ON public.optimizations
  FOR INSERT
  TO authenticated, anon
  WITH CHECK ((user_id = auth.uid()) OR (user_id IS NULL AND auth.uid() IS NULL));
