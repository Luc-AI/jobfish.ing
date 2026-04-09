-- Allow users to insert their own profile row
-- (needed when handle_new_user trigger didn't fire, e.g. pre-trigger signups)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
