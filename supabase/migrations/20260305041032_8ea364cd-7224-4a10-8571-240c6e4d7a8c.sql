
CREATE OR REPLACE FUNCTION public.validate_subscription_tier()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.subscription_tier NOT IN ('free', 'pro', 'pinnacle') THEN
    RAISE EXCEPTION 'Invalid subscription_tier: %', NEW.subscription_tier;
  END IF;
  RETURN NEW;
END;
$$;
