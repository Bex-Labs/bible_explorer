-- =========================================================
-- Bible Explorer — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor
-- (or via `supabase db push` if you adopt the CLI later).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Subscribers — worldwide e-copy signup list
-- ---------------------------------------------------------
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  country text,
  age_group text,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

-- Anyone (anonymous visitors) can sign up...
create policy "Public can insert subscribers"
  on public.subscribers
  for insert
  to anon
  with check (true);

-- ...but nobody can read the list from the client. Use the
-- Supabase Dashboard, a service-role key, or an Edge Function
-- to export/email subscribers.

-- ---------------------------------------------------------
-- 2. Posts — the micro-blogging forum
-- ---------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'A reader',
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Anyone can read posts (public forum feed)
create policy "Public can read posts"
  on public.posts
  for select
  to anon, authenticated
  using (true);

-- Only signed-in users can create posts, and only as themselves
create policy "Authenticated users can insert their own posts"
  on public.posts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Authors can delete their own posts
create policy "Authors can delete their own posts"
  on public.posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Helpful index for the feed query (newest first)
create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

-- ---------------------------------------------------------
-- Notes
-- ---------------------------------------------------------
-- * Enable Email auth under Authentication → Providers, and turn on
--   "Email OTP / magic link" (it's on by default).
-- * Under Authentication → URL Configuration, add your deployed site
--   URL (and http://localhost:xxxx while developing) to the allowed
--   redirect URLs so magic links work.
-- * To send the actual e-copy PDFs/emails on signup, the simplest
--   path is a Supabase Edge Function triggered by a Database Webhook
--   on `subscribers` insert, calling an email provider (Resend,
--   Postmark, SendGrid, etc.). That's a natural next step once the
--   site is live and collecting signups.
