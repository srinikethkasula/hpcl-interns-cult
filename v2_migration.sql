-- =========================================================================
-- HPCL Intern Connect — v2 Master SQL Migration
-- Run this ENTIRE script in Supabase SQL Editor
-- =========================================================================

-- -------------------------------------------------------------
-- 1. ADD MUTE COLUMN TO CHAT_MEMBERS
-- -------------------------------------------------------------
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;

-- -------------------------------------------------------------
-- 2. ADD FILE COLUMNS TO MESSAGES
-- -------------------------------------------------------------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type text;

-- -------------------------------------------------------------
-- 3. CREATE THE ALL INTERNS MASTER CHAT
-- -------------------------------------------------------------
INSERT INTO chats (id, is_group, name)
VALUES ('00000000-0000-0000-0000-000000000001', true, 'All Interns 🏢')
ON CONFLICT (id) DO NOTHING;

-- Add ALL existing users to the All Interns chat
INSERT INTO chat_members (chat_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM users
ON CONFLICT DO NOTHING;

-- Register All Interns chat for realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
  END IF;
END $$;

-- -------------------------------------------------------------
-- 4. UPDATE SIGNUP TRIGGER TO AUTO-ADD NEW USERS TO ALL INTERNS
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert user profile
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

  -- Auto-add to the All Interns master chat
  INSERT INTO public.chat_members (chat_id, user_id)
  VALUES ('00000000-0000-0000-0000-000000000001', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------------
-- 5. ENABLE PG_CRON & AUTO-DELETE MESSAGES OLDER THAN 7 DAYS
-- -------------------------------------------------------------
-- First enable the extension (may already be enabled):
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 2:00 AM UTC
SELECT cron.schedule(
  'delete-old-messages',
  '0 2 * * *',
  $$
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

-- Verify schedule was created
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'delete-old-messages';
