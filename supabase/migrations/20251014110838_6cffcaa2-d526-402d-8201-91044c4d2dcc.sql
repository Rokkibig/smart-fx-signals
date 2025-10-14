-- Add DELETE policy for profiles table (prevent profile deletion)
CREATE POLICY "Prevent profile deletion"
ON public.profiles
FOR DELETE
TO authenticated
USING (false);

-- Add restrictive policies for user_credits table
CREATE POLICY "Only service role can insert credits"
ON public.user_credits
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Only service role can update credits"
ON public.user_credits
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Users cannot delete credits"
ON public.user_credits
FOR DELETE
TO authenticated
USING (false);