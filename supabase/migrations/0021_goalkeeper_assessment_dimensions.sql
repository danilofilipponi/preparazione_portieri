-- Macro-voci fisiche, collegamenti FIS e salvataggio atomico delle valutazioni.

begin;

insert into public.physical_assessment_dimensions (codice, nome, descrizione, ordine) values
  ('PHY-FORZA', 'Forza', 'Capacità generale e specifica di produrre forza.', 1),
  ('PHY-ESP', 'Esplosività', 'Produzione rapida della forza nelle spinte del portiere.', 2),
  ('PHY-ACC', 'Accelerazione breve', 'Capacità di accelerare rapidamente in spazi ridotti.', 3),
  ('PHY-RAP', 'Rapidità piedi', 'Velocità e precisione dei piccoli appoggi.', 4),
  ('PHY-AGI', 'Agilità / cambio direzione', 'Arresti, ripartenze e cambi di direzione.', 5),
  ('PHY-REA', 'Reattività', 'Risposta rapida a stimoli e situazioni impreviste.', 6),
  ('PHY-COO', 'Coordinazione', 'Controllo coordinato degli arti e del gesto.', 7),
  ('PHY-ORI', 'Orientamento spazio-temporale', 'Lettura di spazio, tempo e traiettorie.', 8),
  ('PHY-STA', 'Stabilità / controllo dinamico', 'Controllo del corpo, degli appoggi e degli atterraggi.', 9),
  ('PHY-MOB', 'Mobilità', 'Mobilità articolare funzionale ai gesti del portiere.', 10),
  ('PHY-REA-EXP', 'Repeated Explosive Ability', 'Ripetizione di azioni esplosive mantenendo qualità.', 11),
  ('PHY-REC', 'Recupero tra azioni intense', 'Capacità di recuperare tra sequenze ad alta intensità.', 12)
on conflict (codice) do update set
  nome = excluded.nome, descrizione = excluded.descrizione,
  ordine = excluded.ordine, attivo = true, updated_at = now();

with mapping(dimension_code, fis_codes) as (values
  ('PHY-FORZA', array['FIS-001','FIS-002','FIS-003','FIS-004','FIS-005','FIS-006','FIS-007','FIS-041','FIS-042','FIS-043','FIS-045','FIS-046']),
  ('PHY-ESP', array['FIS-008','FIS-009','FIS-010','FIS-011','FIS-012','FIS-013','FIS-014','FIS-025','FIS-026','FIS-027','FIS-028']),
  ('PHY-ACC', array['FIS-015','FIS-024']),
  ('PHY-RAP', array['FIS-016','FIS-017']),
  ('PHY-AGI', array['FIS-018','FIS-019','FIS-020']),
  ('PHY-REA', array['FIS-021','FIS-022','FIS-023','FIS-024']),
  ('PHY-COO', array['FIS-029','FIS-030','FIS-031']),
  ('PHY-ORI', array['FIS-032']),
  ('PHY-STA', array['FIS-033','FIS-034','FIS-035','FIS-036','FIS-041','FIS-043','FIS-044','FIS-046']),
  ('PHY-MOB', array['FIS-037','FIS-038','FIS-039','FIS-040','FIS-041','FIS-042','FIS-044','FIS-045']),
  ('PHY-REA-EXP', array['FIS-049','FIS-050','FIS-052']),
  ('PHY-REC', array['FIS-047','FIS-048','FIS-049','FIS-050','FIS-051','FIS-052'])
)
insert into public.physical_assessment_dimension_objectives (physical_dimension_id, physical_objective_id, peso)
select dimension.id, objective.id, 1
from mapping
cross join lateral unnest(mapping.fis_codes) as fis_code
join public.physical_assessment_dimensions dimension on dimension.codice = mapping.dimension_code
join public.physical_objectives objective on objective.codice = fis_code
on conflict (physical_dimension_id, physical_objective_id) do update set peso = excluded.peso;

create or replace function public.create_goalkeeper_assessment(
  requested_goalkeeper_id uuid,
  requested_assessment_date date,
  requested_general_notes text,
  requested_items jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_assessment_id uuid;
  item jsonb;
begin
  if not exists (select 1 from goalkeepers where id = requested_goalkeeper_id and attivo) then
    raise exception 'Portiere non trovato o non attivo';
  end if;
  if requested_items is null or jsonb_typeof(requested_items) <> 'array' or jsonb_array_length(requested_items) = 0 then
    raise exception 'Inserire almeno una voce di valutazione';
  end if;

  insert into goalkeeper_assessments (goalkeeper_id, data_valutazione, note_generali)
  values (requested_goalkeeper_id, requested_assessment_date, nullif(trim(requested_general_notes), ''))
  returning id into saved_assessment_id;

  for item in select value from jsonb_array_elements(requested_items) loop
    if item->>'tipo' = 'Tecnica' and exists (
      select 1 from exercise_categories
      where id = nullif(item->>'exercise_category_id', '')::integer
        and nome = 'Tema libero'
    ) then
      raise exception 'Tema libero non è una capacità tecnica valutabile';
    end if;
    insert into goalkeeper_assessment_items (
      assessment_id, tipo, exercise_category_id, physical_dimension_id, score, nota
    ) values (
      saved_assessment_id,
      item->>'tipo',
      nullif(item->>'exercise_category_id', '')::integer,
      nullif(item->>'physical_dimension_id', '')::uuid,
      (item->>'score')::numeric(3,1),
      nullif(trim(item->>'nota'), '')
    );
  end loop;

  return saved_assessment_id;
end;
$$;

grant execute on function public.create_goalkeeper_assessment(uuid, date, text, jsonb) to anon, authenticated;

commit;

select 'MIGRATION 0021 COMPLETATA' as risultato;
