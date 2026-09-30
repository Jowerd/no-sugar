-- Run in Supabase SQL Editor. Installs the feature; does not delete any data.
begin;
create or replace function public.challenge_delete_me(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid device token';
  end if;
  -- FK ON DELETE CASCADE removes this participant's check-ins.
  -- Retrying a completed deletion is safe and never affects another participant.
  delete from public.participants
  where device_token = encode(extensions.digest(p_token, 'sha256'), 'hex');
end; $$;
revoke all on function public.challenge_delete_me(text) from public, authenticated;
grant execute on function public.challenge_delete_me(text) to anon;
commit;
