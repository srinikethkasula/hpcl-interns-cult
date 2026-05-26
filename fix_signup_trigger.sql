-- =========================================================================
-- HPCL Cult - Fix Signup 500 Error
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- =========================================================================

-- STEP 1: Drop any existing broken trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- STEP 2: Check and fix the users table columns to allow NULLs 
-- (so the trigger can insert a minimal row on signup, populated later from metadata)
ALTER TABLE public.users ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN office DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN department DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN floor DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN avatar_url DROP NOT NULL;

-- STEP 3: Create a robust trigger function that reads from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, phone, full_name, office, department, floor, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'office', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    COALESCE(NEW.raw_user_meta_data->>'floor', ''),
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    phone       = COALESCE(EXCLUDED.phone, public.users.phone),
    full_name   = COALESCE(EXCLUDED.full_name, public.users.full_name),
    office      = COALESCE(EXCLUDED.office, public.users.office),
    department  = COALESCE(EXCLUDED.department, public.users.department),
    floor       = COALESCE(EXCLUDED.floor, public.users.floor);
  RETURN NEW;
END;
$$;

-- STEP 4: Attach the trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- STEP 5: Verify the trigger was created
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
