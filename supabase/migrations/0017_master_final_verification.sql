-- FASE F — Verifica finale del catalogo MASTER.
-- Solo lettura: non modifica alcun dato.

begin;

do $phase_f$
declare
  master_exercises integer;
  official_categories integer;
  physical_objectives integer;
  physical_mappings integer;
  master_primary_objectives integer;
  match_simulation integer;
  complete_match_simulation integer;
begin
  select count(*) into master_exercises
  from public.exercises
  where codice like 'GK-%';

  select count(*) into official_categories
  from public.exercise_categories
  where nome = any (array[
    'Tecnica presa alta e rasoterra', 'Tuffi laterali e reattività',
    'Uscite basse e 1vs1', 'Uscite alte e palle aeree',
    'Reattività con ostacoli e tuffi', 'Tecnica di piede',
    'Parate ravvicinate', 'Match Simulation',
    'Tecnica 1v1 - copertura angoli', 'Posizionamento porta', 'Tema libero'
  ]::text[]);

  select count(*) into physical_objectives from public.physical_objectives;
  select count(*) into physical_mappings from public.exercise_physical_objectives;

  select count(*) into master_primary_objectives
  from (
    select exercise.id
    from public.exercises as exercise
    join public.exercise_physical_objectives as mapping on mapping.exercise_id = exercise.id
    where exercise.codice like 'GK-%' and mapping.ruolo = 'Principale'
    group by exercise.id
    having count(*) = 1
  ) as valid_primary;

  select
    count(*),
    count(*) filter (where scenario_gara is not null and numero_azioni is not null)
  into match_simulation, complete_match_simulation
  from public.exercises
  where categoria = 'Match Simulation';

  if master_exercises <> 460
     or official_categories <> 11
     or physical_objectives <> 52
     or physical_mappings <> 1985
     or master_primary_objectives <> 460
     or match_simulation <> 60
     or complete_match_simulation <> 60 then
    raise exception 'FASE F non superata: esercizi %, categorie %, FIS %, mappature %, principali %, Match %/%',
      master_exercises, official_categories, physical_objectives, physical_mappings,
      master_primary_objectives, complete_match_simulation, match_simulation;
  end if;

  if exists (select codice from public.exercises group by codice having count(*) > 1)
     or exists (select codice from public.physical_objectives group by codice having count(*) > 1)
     or exists (
       select exercise_id, physical_objective_id
       from public.exercise_physical_objectives
       group by exercise_id, physical_objective_id
       having count(*) > 1
     ) then
    raise exception 'FASE F non superata: rilevati codici o collegamenti duplicati.';
  end if;
end
$phase_f$;

commit;

select
  'FASE F COMPLETATA' as risultato,
  count(*) filter (where codice like 'GK-%') as esercizi_master,
  count(*) as esercizi_totali_database,
  count(*) filter (where schema_url is not null) as schemi_preservati,
  count(*) filter (where foto_url is not null) as foto_preservate
from public.exercises;
