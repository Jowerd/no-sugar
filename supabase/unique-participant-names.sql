-- Run after resolving the duplicates listed by find-duplicate-names.sql.
-- Preserves participants, check-ins, and challenge dates. No rows are deleted.
begin;
lock table public.participants in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.participants
    group by lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')))
    having count(*) > 1
  ) then
    raise exception 'Duplicate names exist. Run find-duplicate-names.sql, then rename or delete the unwanted rows before retrying.';
  end if;
end; $$;

-- Enforce case-insensitive uniqueness, ignoring leading/trailing/repeated whitespace.
-- Existing duplicates must be renamed or removed by the owner before this succeeds.
create unique index if not exists participants_name_unique
on public.participants (lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))));

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

revoke all on function public.challenge_join(text,text) from public;
grant execute on function public.challenge_join(text,text) to anon;
commit;

