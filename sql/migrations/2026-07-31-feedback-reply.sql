-- migration: add reply tracking to feedback
-- Run this once in the Supabase SQL Editor if your `feedback` table
-- already exists (i.e. you ran the original schema.sql before this
-- feature was added). Safe to re-run — uses IF NOT EXISTS.

alter table public.feedback
  add column if not exists reply_message text,
  add column if not exists replied_at timestamptz;
