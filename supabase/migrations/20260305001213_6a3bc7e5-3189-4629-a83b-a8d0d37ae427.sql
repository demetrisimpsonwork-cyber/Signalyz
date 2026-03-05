-- 1. Add subscription fields to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS daily_run_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_run_reset_at timestamptz DEFAULT now();

-- Validation trigger for subscription_tier (instead of CHECK constraint)
CREATE OR REPLACE FUNCTION validate_subscription_tier()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('free', 'pinnacle') THEN
    RAISE EXCEPTION 'Invalid subscription_tier: %', NEW.subscription_tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_subscription_tier
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION validate_subscription_tier();

-- 2. Create subscription_events log table
CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text,
  stripe_event_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- 3. RLS on subscription_events
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription events"
  ON subscription_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert subscription events"
  ON subscription_events FOR INSERT
  WITH CHECK (true);

-- 4. Create increment_run_count function
CREATE OR REPLACE FUNCTION increment_run_count(p_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET daily_run_count = daily_run_count + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;