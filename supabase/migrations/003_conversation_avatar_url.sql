alter table public.conversations
  add column if not exists avatar_url text;
