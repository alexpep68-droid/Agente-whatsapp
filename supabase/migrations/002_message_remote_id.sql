alter table public.messages
  add column if not exists remote_id text;

create index if not exists idx_messages_remote_id
  on public.messages(remote_id);
