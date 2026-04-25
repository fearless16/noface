create extension if not exists pgcrypto;

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (char_length(trim(user_id)) > 0),
  text text not null check (char_length(trim(text)) between 1 and 500),
  mood text check (mood in ('sad', 'angry', 'regret', 'happy', 'anxious', 'hopeful')),
  is_private boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.confessions
add column if not exists is_private boolean not null default false;

create index if not exists confessions_created_at_idx on public.confessions (created_at desc);
create index if not exists confessions_user_id_idx on public.confessions (user_id);
create index if not exists confessions_user_created_at_idx on public.confessions (user_id, created_at desc);

create or replace function public.normalize_confession_text(input_text text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(input_text, ''), '\s+', ' ', 'g')))
$$;

create or replace function public.is_blocked_confession(input_text text)
returns boolean
language sql
immutable
as $$
  with normalized as (
    select public.normalize_confession_text(input_text) as value
  )
  select
    value ~ '(https?://|www\.)'
    or exists (
      select 1
      from unnest(array[
        'discord.gg',
        'telegram',
        'whatsapp',
        'cashapp',
        'onlyfans',
        'crypto giveaway',
        'buy now'
      ]) as blocked_term
      where position(blocked_term in value) > 0
    )
  from normalized
$$;

create or replace function public.enforce_confession_guardrails()
returns trigger
language plpgsql
as $$
declare
  recent_confession_count integer;
begin
  new.text := trim(new.text);
  new.user_id := trim(new.user_id);
  new.created_at := coalesce(new.created_at, timezone('utc', now()));

  if public.is_blocked_confession(new.text) then
    raise exception 'Confession blocked by moderation filter.' using errcode = 'P0001';
  end if;

  select count(*)
  into recent_confession_count
  from public.confessions
  where user_id = new.user_id
    and created_at >= timezone('utc', now()) - interval '10 minutes';

  if recent_confession_count >= 5 then
    raise exception 'Too many confessions. Try again in a few minutes.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists confessions_guardrails_trigger on public.confessions;

create trigger confessions_guardrails_trigger
before insert on public.confessions
for each row
execute function public.enforce_confession_guardrails();

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
-- Server-side guardrails now block obvious links and common spam terms at insert time.
-- Server-side rate limiting currently allows up to 5 confessions per user_id in 10 minutes.