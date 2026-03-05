-- Fix search_path on new functions
ALTER FUNCTION validate_subscription_tier() SET search_path = public;
ALTER FUNCTION increment_run_count(uuid) SET search_path = public;