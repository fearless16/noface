create extension if not exists pgcrypto;

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (char_length(trim(user_id)) > 0),
  text text not null check (char_length(trim(text)) between 1 and 500),
  mood text check (mood in ('sad', 'angry', 'regret', 'happy', 'anxious', 'hopeful')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists confessions_created_at_idx on public.confessions (created_at desc);
create index if not exists confessions_user_id_idx on public.confessions (user_id);

alter table public.confessions enable row level security;

create policy "Public read confessions"
on public.confessions
for select
using (true);

create policy "Anonymous insert confessions"
on public.confessions
for insert
with check (char_length(trim(user_id)) > 0);

-- Hold delete support until you introduce either trusted auth or a secret-key restore flow.
-- Basic moderation can start at the edge by rejecting blocked keywords before insert.
-- Rate limiting is best enforced outside Postgres with an edge function or API gateway.