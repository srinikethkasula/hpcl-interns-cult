-- ==============================================================================
-- AUDIT FIXES: Storage Limits & N+1 Query Optimization
-- ==============================================================================

-- 1. Enforce 25MB file size limit on the 'chat_media' storage bucket
-- The Supabase storage API supports configuration of file size limit via the storage.buckets table.
UPDATE storage.buckets
SET file_size_limit = 26214400 -- 25MB in bytes
WHERE id = 'chat_media';

-- 2. Create RPC function to fetch unread message counts for ALL chats in one query
-- This prevents the N+1 query issue in the frontend where it iterates over every chat
DROP FUNCTION IF EXISTS get_all_unread_counts(uuid);
CREATE OR REPLACE FUNCTION get_all_unread_counts(p_user_id uuid)
RETURNS TABLE(chat_id uuid, unread_count bigint)
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.chat_id, 
    COUNT(*) as unread_count
  FROM public.messages m
  JOIN public.chat_members cm ON m.chat_id = cm.chat_id
  WHERE 
    cm.user_id = p_user_id
    AND m.sender_id != p_user_id
    AND m.created_at > cm.last_read_at
    AND cm.is_muted = false
  GROUP BY m.chat_id;
END;
$$ LANGUAGE plpgsql;
