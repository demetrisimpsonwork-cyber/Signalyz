
CREATE TABLE public.one_time_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stripe_session_id text,
  stripe_payment_intent text,
  used boolean NOT NULL DEFAULT false,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.one_time_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON public.one_time_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block anon reads on one_time_purchases"
  ON public.one_time_purchases FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "Block anon inserts on one_time_purchases"
  ON public.one_time_purchases FOR INSERT
  TO anon
  WITH CHECK (false);
