-- =====================================================================
-- TMT OFFICIAL — Admin CMS — Supabase Postgres Schema
-- Run this whole file once in the Supabase SQL editor.
-- =====================================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- subscribers
-- ---------------------------------------------------------------------
create table if not exists public.subscribers (
  id            uuid primary key default uuid_generate_v4(),
  email         text not null unique,
  name          text,
  subscribed_at timestamptz not null default now(),
  is_active     boolean not null default true,
  source        text default 'website'
);
create index if not exists idx_subscribers_subscribed_at on public.subscribers (subscribed_at desc);
create index if not exists idx_subscribers_email on public.subscribers (email);

-- ---------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------
create table if not exists public.feedback (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  email         text,
  message       text not null,
  is_read       boolean not null default false,
  reply_message text,
  replied_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_feedback_created_at on public.feedback (created_at desc);
create index if not exists idx_feedback_is_read on public.feedback (is_read);

-- ---------------------------------------------------------------------
-- videos
-- ---------------------------------------------------------------------
create table if not exists public.videos (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  description     text,
  youtube_url     text not null,
  thumbnail_url   text,
  published       boolean not null default false,
  published_at    timestamptz,
  is_featured     boolean not null default false,
  click_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_videos_published_at on public.videos (published_at desc);
create index if not exists idx_videos_is_featured on public.videos (is_featured);

-- ---------------------------------------------------------------------
-- downloads
-- ---------------------------------------------------------------------
create table if not exists public.downloads (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  description     text,
  category        text default 'general',
  file_url        text not null,
  file_path       text not null,       -- path inside the storage bucket, for delete
  file_size       bigint,
  download_count  integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_downloads_category on public.downloads (category);
create index if not exists idx_downloads_created_at on public.downloads (created_at desc);

-- ---------------------------------------------------------------------
-- settings (single-row key/value style table; one row per site)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                uuid primary key default uuid_generate_v4(),
  website_name      text not null default 'TMT OFFICIAL',
  logo_url          text,
  favicon_url       text,
  footer_text       text default '© TMT OFFICIAL. All rights reserved.',
  hero_banner_url   text,
  youtube_url       text,
  instagram_url     text,
  discord_url       text,
  contact_email     text,
  seo_title         text,
  seo_description   text,
  theme             text default 'dark',
  updated_at        timestamptz not null default now()
);
-- ensure only one settings row can ever exist
create unique index if not exists idx_settings_singleton on public.settings ((true));
insert into public.settings (website_name)
  select 'TMT OFFICIAL'
  where not exists (select 1 from public.settings);

-- ---------------------------------------------------------------------
-- analytics (daily rollup rows written by your public site / edge middleware)
-- ---------------------------------------------------------------------
create table if not exists public.analytics (
  id            uuid primary key default uuid_generate_v4(),
  date          date not null default current_date,
  visitors      integer not null default 0,
  page_views    integer not null default 0,
  video_clicks  integer not null default 0,
  downloads     integer not null default 0,
  country       text,
  device        text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_analytics_date on public.analytics (date desc);
create index if not exists idx_analytics_country on public.analytics (country);
create index if not exists idx_analytics_device on public.analytics (device);

-- ---------------------------------------------------------------------
-- sent_videos (log of publish→email broadcast events)
-- ---------------------------------------------------------------------
create table if not exists public.sent_videos (
  id                  uuid primary key default uuid_generate_v4(),
  video_id            uuid references public.videos (id) on delete cascade,
  recipients_count    integer not null default 0,
  sent_at             timestamptz not null default now(),
  status              text not null default 'sent', -- sent | failed | partial
  error_message        text
);
create index if not exists idx_sent_videos_video_id on public.sent_videos (video_id);

-- =====================================================================
-- ROW LEVEL SECURITY
-- All tables: RLS enabled. Writes are only ever performed by the
-- server-side service role key (which bypasses RLS by design), so the
-- policies below only need to describe what the ANON/public key may do,
-- which for an admin-only CMS is: nothing, except the narrow public
-- reads the marketing site itself needs (published videos, download
-- counts incrementing via RPC, subscribe/feedback inserts from the
-- public site's own forms).
-- =====================================================================

alter table public.subscribers enable row level security;
alter table public.feedback    enable row level security;
alter table public.videos      enable row level security;
alter table public.downloads   enable row level security;
alter table public.settings    enable row level security;
alter table public.analytics   enable row level security;
alter table public.sent_videos enable row level security;

-- Public site: allow anonymous visitors to subscribe / send feedback
drop policy if exists "public can subscribe" on public.subscribers;
create policy "public can subscribe"
  on public.subscribers for insert
  to anon
  with check (true);

drop policy if exists "public can send feedback" on public.feedback;
create policy "public can send feedback"
  on public.feedback for insert
  to anon
  with check (true);

-- Public site: allow anonymous read of published videos only
drop policy if exists "public can read published videos" on public.videos;
create policy "public can read published videos"
  on public.videos for select
  to anon
  using (published = true);

-- Public site: allow anonymous read of settings (site chrome/branding)
drop policy if exists "public can read settings" on public.settings;
create policy "public can read settings"
  on public.settings for select
  to anon
  using (true);

-- Public site: allow anonymous read of downloads (file listing)
drop policy if exists "public can read downloads" on public.downloads;
create policy "public can read downloads"
  on public.downloads for select
  to anon
  using (true);

-- Note: no anon UPDATE/DELETE policies exist anywhere — every mutation in
-- the admin panel goes through /api functions authenticated with the
-- service role key, which bypasses RLS entirely and is never exposed to
-- the browser.

-- =====================================================================
-- STORAGE BUCKETS
-- Run once, or create via Dashboard → Storage → New bucket:
--   - "downloads" (public)
--   - "media"     (public)  → logo / favicon / hero banner / thumbnails
-- =====================================================================

insert into storage.buckets (id, name, public)
  values ('downloads', 'downloads', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists "public read downloads bucket" on storage.objects;
create policy "public read downloads bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'downloads');

drop policy if exists "public read media bucket" on storage.objects;
create policy "public read media bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'media');

-- Writes to storage are performed by the server (service role) only,
-- via the Supabase Storage REST API inside /api/downloads.js and
-- /api/settings.js — no client-side storage write policy is needed.
