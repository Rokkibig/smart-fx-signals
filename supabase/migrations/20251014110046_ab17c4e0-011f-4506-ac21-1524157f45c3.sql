-- Add RLS policies for ai_requests_log to prevent user manipulation

-- Prevent users from inserting records directly (only service role can insert)
CREATE POLICY "Only service role can insert AI requests"
ON public.ai_requests_log
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Prevent users from deleting their request history
CREATE POLICY "Users cannot delete AI requests"
ON public.ai_requests_log
FOR DELETE
TO authenticated
USING (false);