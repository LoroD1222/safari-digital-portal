-- Run after creating your own user in Supabase → Authentication → Users.
-- Replace the email with the one you signed up with.
update public.profiles set role = 'admin' where email = 'you@example.com';
