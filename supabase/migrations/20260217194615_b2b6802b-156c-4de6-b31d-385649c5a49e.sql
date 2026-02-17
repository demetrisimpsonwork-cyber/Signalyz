
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create optimizations table
CREATE TABLE public.optimizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  input_bullet TEXT NOT NULL,
  input_jd TEXT NOT NULL,
  optimized_bullet TEXT NOT NULL,
  match_score INTEGER NOT NULL DEFAULT 0,
  missing_keywords TEXT[] NOT NULL DEFAULT '{}',
  suggested_verbs TEXT[] NOT NULL DEFAULT '{}',
  alt_a TEXT NOT NULL DEFAULT '',
  alt_b TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.optimizations ENABLE ROW LEVEL SECURITY;

-- Guests (no user_id) can insert
CREATE POLICY "Anyone can insert optimizations"
  ON public.optimizations FOR INSERT
  WITH CHECK (true);

-- Users can view their own optimizations
CREATE POLICY "Users can view their own optimizations"
  ON public.optimizations FOR SELECT
  USING (auth.uid() = user_id);
