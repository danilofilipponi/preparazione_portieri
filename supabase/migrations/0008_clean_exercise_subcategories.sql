-- Pulizia delle sottocategorie tecniche.
-- La fase metodologica rimane nel campo "fase" e non viene più ripetuta nel nome.
-- I record con suffisso "2" sono duplicati non utilizzati e vengono rimossi.

begin;

do $$
begin
  if exists (
    select 1
    from public.exercises e
    join public.exercise_subcategories s on s.id = e.subcategory_id
    where s.nome ~* '\s+2$'
  ) then
    raise exception 'Pulizia annullata: una sottocategoria con suffisso 2 è ancora utilizzata.';
  end if;

  if not exists (select 1 from public.exercise_subcategories where id = 1 and category_id = 1 and fase = 'Analitico')
     or not exists (select 1 from public.exercise_subcategories where id = 7 and category_id = 1 and fase = 'Disturbo')
     or not exists (select 1 from public.exercise_subcategories where id = 9 and category_id = 1 and fase = 'Disturbo') then
    raise exception 'Pulizia annullata: mancano le sottocategorie canoniche della presa.';
  end if;
end $$;

-- Riporta gli esercizi importati sulle sottocategorie tecniche canoniche.
update public.exercises
set subcategory_id = case subcategory_id
  when 142 then 1
  when 143 then 7
  when 144 then 9
  else subcategory_id
end
where category_id = 1
  and subcategory_id in (142, 143, 144);

delete from public.exercise_subcategories where id in (142, 143, 144);
delete from public.exercise_subcategories where nome ~* '\s+2$';

with cleaned as (
  select
    id,
    case
      when nome = 'Deviazione con intervento attivo' then 'Deviazione'
      else trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(nome, '\s+analitic[oa]$', '', 'i'),
            '\s+con disturbo$', '', 'i'
          ),
          '\s+disturbo$|\s+situazionale$', '', 'i'
        )
      )
    end as clean_nome
  from public.exercise_subcategories
)
update public.exercise_subcategories s
set nome = case when c.clean_nome = 'Presa rimbalzo' then 'Presa con rimbalzo' else c.clean_nome end
from cleaned c
where s.id = c.id
  and s.nome is distinct from case when c.clean_nome = 'Presa rimbalzo' then 'Presa con rimbalzo' else c.clean_nome end;

-- Allinea anche il campo testuale presente negli esercizi.
update public.exercises e
set sottocategoria = s.nome,
    fase = s.fase
from public.exercise_subcategories s
where s.id = e.subcategory_id
  and (e.sottocategoria is distinct from s.nome or e.fase is distinct from s.fase);

commit;
