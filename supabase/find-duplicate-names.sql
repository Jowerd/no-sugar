-- Read-only: lists every participant whose normalized name is shared.
with duplicates as (
  select lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) as name_key
  from public.participants
  group by 1 having count(*) > 1
)
select p.id, p.name, p.created_at,
  (select count(*) from public.check_ins c where c.participant_id = p.id) as successful_days
from public.participants p join duplicates d
on lower(btrim(regexp_replace(p.name, '[[:space:]]+', ' ', 'g'))) = d.name_key
order by d.name_key, p.created_at;
