-- =========================================================================
-- HPCL INTERN CONNECT — V3 DATABASE SCHEMA UPGRADES
-- =========================================================================
-- Run this script in your Supabase SQL Editor (SQL Editor > New Query)
-- =========================================================================

-- 1. ADD NEW PROFILE COLUMNS TO USERS
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fcm_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS college_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS study_year text;

-- 2. CREATE CONFIGURATION TABLE TO SECURELY STORE YOUR FCM SERVER KEY
CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Disable Row Level Security (RLS) for app_config so client can read it
ALTER TABLE public.app_config DISABLE ROW LEVEL SECURITY;

-- Insert placeholders for FCM Configs
INSERT INTO public.app_config (key, value)
VALUES 
  ('fcm_server_key', 'DEPRECATED_NOT_NEEDED_FOR_V1'),
  ('fcm_service_account', 'PASTE_YOUR_FIREBASE_SERVICE_ACCOUNT_JSON_HERE')
ON CONFLICT (key) DO NOTHING;
