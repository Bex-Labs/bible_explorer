-- =========================================================
-- Bible Explorer: Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor
-- (or via `supabase db push` if you adopt the CLI later).
--
-- Safe to re-run: every statement uses `if not exists` / `on conflict`
-- / `drop policy if exists` so running this again after adding new
-- sections below won't error on things that already exist.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Subscribers: worldwide e-copy signup list
-- ---------------------------------------------------------
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  country text,
  age_group text,
  requested_volume_number int,
  requested_volume_label text,
  created_at timestamptz not null default now()
);

-- One row per request, not one row per email: the signup form now lets
-- someone request a specific volume and get an instant download link,
-- so the same person may legitimately sign up again later for a
-- different volume. Drop the old uniqueness constraint if it's still
-- there from an earlier version of this schema (no-op on a fresh
-- install where it was never created).
alter table public.subscribers drop constraint if exists subscribers_email_key;

-- Add the new columns if this table already existed from before the
-- volume-request feature (no-op on a fresh install).
alter table public.subscribers add column if not exists requested_volume_number int;
alter table public.subscribers add column if not exists requested_volume_label text;

alter table public.subscribers enable row level security;

drop policy if exists "Public can insert subscribers" on public.subscribers;
create policy "Public can insert subscribers"
  on public.subscribers
  for insert
  to anon
  with check (true);

-- Nobody can read the subscriber list from the client (keeps emails
-- private). The admin page does not expose this list either: use the
-- Supabase Dashboard, a service-role key, or an Edge Function to
-- export/email subscribers. `requested_volume_label` is stored as a
-- snapshot at signup time so the request stays readable even if that
-- volume is later renamed or removed.

-- ---------------------------------------------------------
-- 2. Admins
-- ---------------------------------------------------------
-- A simple allowlist of emails that get admin rights on the site
-- (managing volumes and moderating the forum). Add more rows here to
-- add more admins later.
create table if not exists public.admins (
  email text primary key
);

alter table public.admins enable row level security;
-- Intentionally no select/insert/update/delete policies for anon or
-- authenticated: nobody can read or edit this table directly from the
-- client. It's only ever read (bypassing RLS) by the is_admin()
-- function below via `security definer`. Manage it from the SQL
-- Editor or Table Editor in the Supabase Dashboard.

insert into public.admins (email) values
  ('bexinnovation@outlook.com')
on conflict (email) do nothing;

-- Returns true if the currently signed-in user's email is on the
-- admins allowlist above. `security definer` lets this function read
-- the admins table even though clients can't query it directly.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------
-- 3. Volumes: the print/e-copy catalog shown on buy.html
-- ---------------------------------------------------------
create table if not exists public.volumes (
  id uuid primary key default gen_random_uuid(),
  volume_number int not null unique,
  days_label text not null,
  amazon_url text,
  thumbnail_url text,
  download_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.volumes enable row level security;

-- Anyone can see the volume catalog (that's the whole point of buy.html)
drop policy if exists "Public can read volumes" on public.volumes;
create policy "Public can read volumes"
  on public.volumes
  for select
  to anon, authenticated
  using (true);

-- Only admins can add, edit, or remove volumes
drop policy if exists "Admins can insert volumes" on public.volumes;
create policy "Admins can insert volumes"
  on public.volumes
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins can update volumes" on public.volumes;
create policy "Admins can update volumes"
  on public.volumes
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can delete volumes" on public.volumes;
create policy "Admins can delete volumes"
  on public.volumes
  for delete
  to authenticated
  using (public.is_admin());

create index if not exists volumes_sort_idx on public.volumes (sort_order, volume_number);

-- Seed the 7 volumes that were previously hardcoded in js/config.js.
-- Safe to re-run: `on conflict` skips volumes that already exist.
insert into public.volumes (volume_number, days_label, amazon_url, sort_order) values
  (1, 'Days 1–90',   'https://www.amazon.ca/dp/B0F84KSSTN', 1),
  (2, 'Days 91–180', 'https://www.amazon.ca/dp/B0F4RGPRQ5', 2),
  (3, 'Days 181–270','https://www.amazon.ca/dp/B0F89DN85G', 3),
  (4, 'Days 271–360','https://www.amazon.ca/dp/B0FVVM42PN', 4),
  (5, 'Days 361–450','https://www.amazon.ca/dp/B0GHXYLLNY', 5),
  (6, 'Days 451–540','https://www.amazon.ca/dp/B0GXW6VL8P', 6),
  (7, 'Days 541–630','https://www.amazon.ca/dp/B0H99L8DBW', 7)
on conflict (volume_number) do nothing;

-- ---------------------------------------------------------
-- 4. Posts: the micro-blogging forum
-- ---------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default 'A reader',
  content text not null check (char_length(content) between 1 and 500),
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now()
);

-- If this table already existed from before the admin feature, add
-- the new column (no-op if it's already there).
alter table public.posts add column if not exists status text not null default 'visible';
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check (status in ('visible', 'hidden'));

alter table public.posts enable row level security;

-- Regular readers only ever see visible posts...
drop policy if exists "Public can read posts" on public.posts;
drop policy if exists "Public can read visible posts" on public.posts;
create policy "Public can read visible posts"
  on public.posts
  for select
  to anon, authenticated
  using (status = 'visible');

-- ...but admins (viewing the moderation page) see everything, hidden included
drop policy if exists "Admins can read all posts" on public.posts;
create policy "Admins can read all posts"
  on public.posts
  for select
  to authenticated
  using (public.is_admin());

-- Only signed-in users can create posts, and only as themselves
drop policy if exists "Authenticated users can insert their own posts" on public.posts;
create policy "Authenticated users can insert their own posts"
  on public.posts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Authors can delete their own posts
drop policy if exists "Authors can delete their own posts" on public.posts;
create policy "Authors can delete their own posts"
  on public.posts
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Admins can hide/unhide any post (moderation) ...
drop policy if exists "Admins can update posts" on public.posts;
create policy "Admins can update posts"
  on public.posts
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ...and delete any post outright
drop policy if exists "Admins can delete any post" on public.posts;
create policy "Admins can delete any post"
  on public.posts
  for delete
  to authenticated
  using (public.is_admin());

-- Helpful index for the feed query (newest first)
create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

-- ---------------------------------------------------------
-- 5. Storage: volume thumbnails + e-copy download files
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('volume-thumbnails', 'volume-thumbnails', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('volume-downloads', 'volume-downloads', true)
on conflict (id) do nothing;

-- Anyone can view thumbnails/downloads (they're public marketing +
-- free e-copy assets); only admins can upload/replace/remove them.
drop policy if exists "Public can read volume assets" on storage.objects;
create policy "Public can read volume assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id in ('volume-thumbnails', 'volume-downloads'));

drop policy if exists "Admins can upload volume assets" on storage.objects;
create policy "Admins can upload volume assets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id in ('volume-thumbnails', 'volume-downloads') and public.is_admin());

drop policy if exists "Admins can update volume assets" on storage.objects;
create policy "Admins can update volume assets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id in ('volume-thumbnails', 'volume-downloads') and public.is_admin())
  with check (bucket_id in ('volume-thumbnails', 'volume-downloads') and public.is_admin());

drop policy if exists "Admins can delete volume assets" on storage.objects;
create policy "Admins can delete volume assets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id in ('volume-thumbnails', 'volume-downloads') and public.is_admin());

-- ---------------------------------------------------------
-- Notes
-- ---------------------------------------------------------
-- * Enable Email auth under Authentication → Providers, and turn on
--   "Email OTP / magic link" (it's on by default).
-- * Under Authentication → URL Configuration, add your deployed site
--   URL (and http://localhost:xxxx while developing) to the allowed
--   redirect URLs so magic links work. This covers both the forum
--   and the admin page's sign-in.
-- * If the `insert into storage.buckets` statements above fail with a
--   permissions error in your Supabase plan, create the two buckets
--   ('volume-thumbnails' and 'volume-downloads', both Public) manually
--   from Storage in the dashboard instead, then re-run just the
--   `storage.objects` policies above.
-- * admin.html is only as private as its URL. It's not linked from
--   the site nav, but it isn't secret. Real access control comes from
--   is_admin() + Row Level Security, so someone finding the URL still
--   can't do anything without being on the `admins` allowlist.
-- * To send the actual e-copy PDFs/emails on signup, the simplest
--   path is a Supabase Edge Function triggered by a Database Webhook
--   on `subscribers` insert, calling an email provider (Resend,
--   Postmark, SendGrid, etc.). That's a natural next step once the
--   site is live and collecting signups.
