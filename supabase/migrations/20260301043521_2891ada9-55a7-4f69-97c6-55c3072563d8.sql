
-- Rate limiting table for free tier enforcement
CREATE TABLE public.usage_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  ip_address text NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  alignment_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ip_address, usage_date)
);

-- Enable RLS
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (edge functions use service role)
CREATE POLICY "Service role full access" ON public.usage_tracking
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can read their own usage
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
