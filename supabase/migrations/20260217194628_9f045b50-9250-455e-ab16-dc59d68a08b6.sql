
-- Drop the overly permissive insert policy
DROP POLICY "Anyone can insert optimizations" ON public.optimizations;

-- Create a tighter insert policy: user_id must match auth.uid() or be null (guest)
CREATE POLICY "Users or guests can insert optimizations"
  ON public.optimizations FOR INSERT
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND auth.uid() IS NULL));
