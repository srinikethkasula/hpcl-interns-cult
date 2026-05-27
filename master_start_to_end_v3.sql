-- =========================================================================
-- HPCL INTERN CONNECT — COMPLETE START-TO-END MASTER V3 SQL MIGRATION
-- =========================================================================
-- This script sets up your ENTIRE Supabase database from scratch or safely 
-- updates an existing one. 
-- It is completely re-runnable (safe to run multiple times).
-- It will NOT overwrite any settings or keys you have already pasted!
-- Run this script in your Supabase SQL Editor (SQL Editor > New Query > Run)
-- =========================================================================

-- -------------------------------------------------------------
-- 1. CREATE CORE TABLES (IF NOT EXISTING) & ADD NEW COLUMNS
-- -------------------------------------------------------------

-- A. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  office text,
  department text,
  floor text,
  avatar_url text,
  fcm_token text,
  college_name text,
  study_year text,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure all columns exist on users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS college_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS study_year text;

-- Make fields nullable (for flexibility)
ALTER TABLE public.users ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN office DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN department DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN floor DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN avatar_url DROP NOT NULL;

-- B. Chats Table
CREATE TABLE IF NOT EXISTS public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group boolean DEFAULT false,
  name text,
  created_at timestamp with time zone DEFAULT now()
);

-- C. Chat Members Table
CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone DEFAULT now(),
  is_muted boolean DEFAULT false,
  PRIMARY KEY (chat_id, user_id)
);

-- Ensure members columns exist
ALTER TABLE public.chat_members ADD COLUMN IF NOT EXISTS last_read_at timestamp with time zone DEFAULT now();
ALTER TABLE public.chat_members ADD COLUMN IF NOT EXISTS is_muted boolean DEFAULT false;

-- D. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  content text,
  image_url text,
  file_name text,
  file_type text,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

-- Ensure messages columns exist
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS file_type text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- E. Message Reactions Table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_message_user_emoji UNIQUE (message_id, user_id, emoji)
);

-- F. App Configuration Table (Secure Server Keys & Service Account storage)
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);


-- -------------------------------------------------------------
-- 2. DISABLE ROW LEVEL SECURITY (RLS) FOR REALTIME ALIGNMENT
-- -------------------------------------------------------------
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config DISABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------------
-- 3. SETUP PUBLIC STORAGE BUCKETS & AUTH POLICIES
-- -------------------------------------------------------------
-- Profile Avatars Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Chat Media & Shared Files Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat_media', 'chat_media', true)
ON CONFLICT (id) DO NOTHING;

-- Avatars Bucket security policies
DROP POLICY IF EXISTS "Public Read Avatars" ON storage.objects;
CREATE POLICY "Public Read Avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Upload Avatars" ON storage.objects;
CREATE POLICY "Authenticated Upload Avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Update Avatars" ON storage.objects;
CREATE POLICY "Authenticated Update Avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Authenticated Delete Avatars" ON storage.objects;
CREATE POLICY "Authenticated Delete Avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars');

-- Chat Media Bucket security policies
DROP POLICY IF EXISTS "Public Read Chat Media" ON storage.objects;
CREATE POLICY "Public Read Chat Media" ON storage.objects FOR SELECT USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Upload Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Upload Chat Media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Update Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Update Chat Media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'chat_media');

DROP POLICY IF EXISTS "Authenticated Delete Chat Media" ON storage.objects;
CREATE POLICY "Authenticated Delete Chat Media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat_media');


-- -------------------------------------------------------------
-- 4. CLEAN UP DUPLICATE DM CHATS (Keeping oldest DM per pair)
-- -------------------------------------------------------------
WITH ranked_dms AS (
  SELECT
    c.id AS chat_id,
    LEAST(cm1.user_id, cm2.user_id) AS user_a,
    GREATEST(cm1.user_id, cm2.user_id) AS user_b,
    c.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(cm1.user_id, cm2.user_id), GREATEST(cm1.user_id, cm2.user_id)
      ORDER BY c.created_at ASC
    ) AS rn
  FROM chats c
  JOIN chat_members cm1 ON cm1.chat_id = c.id
  JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id != cm1.user_id
  WHERE c.is_group = false
)
DELETE FROM chats
WHERE id IN (
  SELECT chat_id FROM ranked_dms WHERE rn > 1
);


-- -------------------------------------------------------------
-- 5. INITIALIZE THE ALL INTERNS MASTER CHAT (Pinned Group)
-- -------------------------------------------------------------
INSERT INTO public.chats (id, is_group, name)
VALUES ('00000000-0000-0000-0000-000000000001', true, 'All Interns 🏢')
ON CONFLICT (id) DO NOTHING;

-- Bulk add all existing registered users to the All Interns master chat
INSERT INTO public.chat_members (chat_id, user_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM users
ON CONFLICT DO NOTHING;


-- -------------------------------------------------------------
-- 6. SETUP THE ROBUST AUTO-REGISTRATION USER SIGNUP TRIGGER
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
  -- 1. Insert/Sync user profile from Auth Metadata securely
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

  -- 2. Bulletproof check: Ensure All Interns chat exists (avoids FK violation on fresh DB)
  INSERT INTO public.chats (id, is_group, name)
  VALUES ('00000000-0000-0000-0000-000000000001', true, 'All Interns 🏢')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Auto-add the newly signed up user to the All Interns master chat
  INSERT INTO public.chat_members (chat_id, user_id)
  VALUES ('00000000-0000-0000-0000-000000000001', NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach the upgraded trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- -------------------------------------------------------------
-- 7. REGISTER TABLES FOR REAL-TIME SYNC
-- -------------------------------------------------------------
DO $$
BEGIN
  -- Add messages to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  -- Add message_reactions to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;

  -- Add chat_members to realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
  END IF;
END $$;


-- -------------------------------------------------------------
-- 8. SCHEDULER: 7-DAY MESSAGE CLEANUP CRON WORKER
-- -------------------------------------------------------------
-- Enable pg_cron (standard on all modern Supabase projects)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily hard delete cron at 2:00 AM UTC
SELECT cron.schedule(
  'delete-old-messages',
  '0 2 * * *',
  $$
    DELETE FROM messages 
    WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);


-- -------------------------------------------------------------
-- 9. CONFIGURATION SEEDS (SAFE: WILL NOT OVERWRITE ALREADY PASTED VALUE)
-- -------------------------------------------------------------
INSERT INTO public.app_config (key, value)
VALUES 
  ('fcm_server_key', 'DEPRECATED_NOT_NEEDED_FOR_V1'),
  ('fcm_service_account', 'PASTE_YOUR_FIREBASE_SERVICE_ACCOUNT_JSON_HERE')
ON CONFLICT (key) DO NOTHING;
