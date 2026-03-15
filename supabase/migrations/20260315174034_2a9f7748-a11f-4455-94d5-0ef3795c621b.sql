
CREATE OR REPLACE FUNCTION public.consume_one_time_credit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  credit_id uuid;
BEGIN
  -- Find the oldest unused credit for this user
  SELECT id INTO credit_id
  FROM one_time_purchases
  WHERE user_id = p_user_id AND used = false
  ORDER BY created_at ASC
  LIMIT 1;

  IF credit_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE one_time_purchases
  SET used = true, used_at = now()
  WHERE id = credit_id;

  RETURN true;
END;
$$;
