-- ==============================================================================
-- SQL PATCH: Ghost Chat Cleanup & 7-Day Auto Delete
-- ==============================================================================
-- Run this script in your Supabase SQL Editor to apply these robust features!
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. GHOST CHAT CLEANUP TRIGGER (Fix for deleted users leaving ghost chats)
-- ------------------------------------------------------------------------------
-- Function to clean up Direct Message chats when a user is deleted
CREATE OR REPLACE FUNCTION public.cleanup_ghost_chats()
RETURNS TRIGGER AS $$
BEGIN
  -- Find and delete any Direct Message (is_group = false) chats
  -- that the deleted user was a member of.
  -- Because chats has ON DELETE CASCADE on chat_members and messages,
  -- deleting the chat will cleanly remove everything related to it.
  DELETE FROM public.chats
  WHERE is_group = false
  AND id IN (
    SELECT chat_id 
    FROM public.chat_members 
    WHERE user_id = OLD.id
  );
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the users table
DROP TRIGGER IF EXISTS trigger_cleanup_ghost_chats ON public.users;
CREATE TRIGGER trigger_cleanup_ghost_chats
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_ghost_chats();


-- ------------------------------------------------------------------------------
-- 2. 7-DAY AUTO-DELETE (Retention Policy)
-- ------------------------------------------------------------------------------
-- Creates a function to delete messages older than 7 days
CREATE OR REPLACE FUNCTION public.delete_old_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.messages
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: To make this run automatically, we use Supabase's pg_cron extension.
-- Enable the extension if it is not already enabled:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the job to run every day at midnight (UTC)
SELECT cron.schedule(
  'delete-old-messages-job',  -- name of the cron job
  '0 0 * * *',                -- cron schedule (midnight every day)
  $$SELECT public.delete_old_messages()$$
);

-- ==============================================================================
-- END OF SCRIPT
-- ==============================================================================
