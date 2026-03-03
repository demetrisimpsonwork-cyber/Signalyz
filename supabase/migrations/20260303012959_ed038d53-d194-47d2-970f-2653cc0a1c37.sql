
-- Add session_token column for guest rate limiting (replaces IP-based tracking)
ALTER TABLE public.usage_tracking ADD COLUMN session_token text;
ALTER TABLE public.usage_tracking ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE public.usage_tracking ALTER COLUMN ip_address SET DEFAULT NULL;
