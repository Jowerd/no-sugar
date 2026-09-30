-- Run this entire file once in the Supabase SQL Editor.
-- To change the challenge, edit the values in the INSERT near the bottom.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.challenge_config (
  id integer primary key default 1 check (id = 1),
  name text not null,
  app_title text not null,
  start_date date not null,
  duration_days integer not null check (duration_days between 1 and 365),
  goal_days integer not null default 90 check (goal_days between 1 and 365)
);
alter table public.challenge_config add column if not exists goal_days integer not null default 90;

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  device_token text not null unique,
  created_at timestamptz not null default now()
);

-- Enforce case-insensitive uniqueness, ignoring leading/trailing/repeated whitespace.
-- Existing duplicates must be renamed or removed by the owner before this succeeds.
create unique index if not exists participants_name_unique
on public.participants (lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))));

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  check_in_date date not null,
  created_at timestamptz not null default now(),
  constraint check_ins_participant_day_unique unique (participant_id, check_in_date)
);
create index if not exists check_ins_date_idx on public.check_ins(check_in_date);

alter table public.challenge_config enable row level security;
alter table public.participants enable row level security;
alter table public.check_ins enable row level security;
revoke all on public.challenge_config, public.participants, public.check_ins from anon, authenticated;

-- Only these functions can access the tables. The token is hashed before storage.
create or replace function public.challenge_join(p_name text, p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text; v_constraint text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid device token';
  end if;
  -- A retry with the same device token returns its own participant, never another person's.
  select id into v_id from public.participants
  where device_token = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_id is not null then return v_id; end if;
  v_name := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'Name must be 1 to 40 characters';
  end if;
  insert into public.participants(name, device_token)
  values (v_name, encode(extensions.digest(p_token, 'sha256'), 'hex'))
  on conflict (device_token) do update set device_token = excluded.device_token
  returning id into v_id;
  return v_id;
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'participants_name_unique' then
    raise exception 'NAME_TAKEN' using errcode = '23505';
  end if;
  raise;
end; $$;

create or replace function public.challenge_state(p_token text, p_today date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_config public.challenge_config%rowtype; v_crew jsonb; v_dates jsonb;
begin
  select * into v_config from public.challenge_config where id = 1;
  if v_config.id is null then raise exception 'Challenge is not configured'; end if;
  if p_token is not null and p_token ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select id into v_me from public.participants
    where device_token = encode(extensions.digest(p_token, 'sha256'), 'hex');
  end if;
  with dated as (
    select c.participant_id, c.check_in_date,
      row_number() over (partition by c.participant_id order by c.check_in_date desc) as rn
    from public.check_ins c where c.check_in_date <= p_today
  ), streaks as (
    select participant_id, count(*)::integer as streak from dated
    where check_in_date = p_today - (rn - 1)::integer
       or check_in_date = (p_today - 1) - (rn - 1)::integer
    group by participant_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'current_streak', coalesce(s.streak, 0),
    'checked_in_today', exists(select 1 from public.check_ins c where c.participant_id = p.id and c.check_in_date = p_today),
    'is_me', p.id = v_me
  ) order by coalesce(s.streak, 0) desc, p.created_at asc), '[]'::jsonb)
  into v_crew from public.participants p left join streaks s on s.participant_id = p.id;
  select coalesce(jsonb_agg(check_in_date order by check_in_date), '[]'::jsonb)
    into v_dates from public.check_ins where participant_id = v_me;
  return jsonb_build_object(
    'challenge', jsonb_build_object('name', v_config.name, 'app_title', v_config.app_title,
      'start_date', v_config.start_date, 'duration_days', v_config.duration_days, 'goal_days', v_config.goal_days),
    'me', (select jsonb_build_object('id', id, 'name', name) from public.participants where id = v_me),
    'crew', v_crew, 'my_dates', v_dates
  );
end; $$;

create or replace function public.challenge_check_in(p_token text, p_today date)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_config public.challenge_config%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid device token';
  end if;
  select id into v_id from public.participants where device_token = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_id is null then raise exception 'Device not found'; end if;
  select * into v_config from public.challenge_config where id = 1;
  if p_today < v_config.start_date or p_today >= v_config.start_date + v_config.duration_days then
    raise exception 'Check-in is outside the challenge dates';
  end if;
  -- A calendar date is supplied by the browser. Limit clock/date manipulation to one day.
  if abs(p_today - current_date) > 1 then raise exception 'Invalid check-in date'; end if;
  insert into public.check_ins(participant_id, check_in_date) values (v_id, p_today)
  on conflict (participant_id, check_in_date) do nothing;
  return 'ok';
end; $$;

revoke all on function public.challenge_join(text,text) from public;
revoke all on function public.challenge_state(text,date) from public;
revoke all on function public.challenge_check_in(text,date) from public;
grant execute on function public.challenge_join(text,text) to anon;
grant execute on function public.challenge_state(text,date) to anon;
grant execute on function public.challenge_check_in(text,date) to anon;

insert into public.challenge_config(id, name, app_title, start_date, duration_days, goal_days)
values (1, '90-დღიანი გამოწვევა', 'უშაქროდ', '2026-10-01', 92, 90)
on conflict (id) do update set name = excluded.name, app_title = excluded.app_title,
  start_date = excluded.start_date, duration_days = excluded.duration_days, goal_days = excluded.goal_days;
