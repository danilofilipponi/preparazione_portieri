-- Prima implementazione production della Seduta di Valutazione.
-- Additiva: bootstrap mapping protetto e creazione atomica delle sedute.

begin;

alter table public.exercise_evaluation_targets
  add column if not exists target_role text,
  add column if not exists physical_feasibility text,
  add column if not exists tactical_family text,
  add column if not exists complexity text,
  add column if not exists decision_source text not null default 'bootstrap',
  add column if not exists bootstrap_version integer not null default 1;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercise_evaluation_targets_decision_source_check') then
    alter table public.exercise_evaluation_targets add constraint exercise_evaluation_targets_decision_source_check
      check (decision_source in ('bootstrap','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exercise_evaluation_targets_physical_feasibility_check') then
    alter table public.exercise_evaluation_targets add constraint exercise_evaluation_targets_physical_feasibility_check
      check (physical_feasibility is null or physical_feasibility in ('CATALOG_EVALUABLE','REQUIRES_DEDICATED_PROTOCOL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exercise_evaluation_targets_complexity_check') then
    alter table public.exercise_evaluation_targets add constraint exercise_evaluation_targets_complexity_check
      check (complexity is null or complexity in ('LOW','MEDIUM','HIGH'));
  end if;
end
$constraints$;

alter table public.evaluation_sessions
  add column if not exists context_preference text not null default 'Bilanciata',
  add column if not exists configuration_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists coverage_snapshot jsonb not null default '[]'::jsonb;

alter table public.evaluation_session_targets
  add column if not exists physical_dimension_id uuid references public.physical_assessment_dimensions(id) on delete restrict,
  add column if not exists coverage_status text not null default 'NOT_COVERED',
  add column if not exists coverage_explanation text not null default '';

do $session_target_constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'evaluation_session_targets_dimension_type_check') then
    alter table public.evaluation_session_targets add constraint evaluation_session_targets_dimension_type_check
      check (physical_dimension_id is null or target_type = 'Physical');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluation_session_targets_coverage_status_check') then
    alter table public.evaluation_session_targets add constraint evaluation_session_targets_coverage_status_check
      check (coverage_status in ('COVERED','PARTIALLY_COVERED','NOT_COVERED','REQUIRES_PROTOCOL'));
  end if;
end
$session_target_constraints$;

create index if not exists evaluation_session_targets_dimension_idx
  on public.evaluation_session_targets(physical_dimension_id)
  where physical_dimension_id is not null;

create or replace function public.bootstrap_evaluation_targets(requested_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  expected_count integer := jsonb_array_length(coalesce(requested_rows, '[]'::jsonb));
  resolved_count integer;
begin
  if not public.is_catalog_admin() then
    raise exception 'Bootstrap mapping non autorizzato';
  end if;
  if expected_count = 0 then
    raise exception 'Bootstrap mapping vuoto';
  end if;

  with rows as (
    select * from jsonb_to_recordset(requested_rows) as item(
      exercise_code text, target_type text, technical_subcategory_id integer,
      physical_objective_code text, evaluation_suitability numeric,
      observability_weight numeric, specificity_weight numeric,
      evidence_notes text, confidence text, mapping_status text, attivo boolean,
      target_role text, physical_feasibility text, tactical_family text,
      complexity text, decision_source text, bootstrap_version integer
    )
  ), resolved as (
    select rows.*, exercise.id as exercise_id, objective.id as physical_objective_id
    from rows
    join public.exercises exercise on exercise.codice = rows.exercise_code
    left join public.physical_objectives objective on objective.codice = rows.physical_objective_code
    where (rows.target_type = 'Technical' and rows.technical_subcategory_id is not null and rows.physical_objective_code is null)
       or (rows.target_type = 'Physical' and rows.technical_subcategory_id is null and objective.id is not null)
  )
  select count(*) into resolved_count from resolved;

  if resolved_count <> expected_count then
    raise exception 'Bootstrap non applicato: % righe su % non risolte', expected_count - resolved_count, expected_count;
  end if;

  with rows as (
    select * from jsonb_to_recordset(requested_rows) as item(
      exercise_code text, target_type text, technical_subcategory_id integer,
      physical_objective_code text, evaluation_suitability numeric,
      observability_weight numeric, specificity_weight numeric,
      evidence_notes text, confidence text, mapping_status text, attivo boolean,
      target_role text, physical_feasibility text, tactical_family text,
      complexity text, decision_source text, bootstrap_version integer
    )
  )
  insert into public.exercise_evaluation_targets(
    exercise_id, target_type, technical_subcategory_id, physical_objective_id,
    evaluation_suitability, observability_weight, specificity_weight,
    evidence_notes, confidence, mapping_status, attivo, target_role,
    physical_feasibility, tactical_family, complexity, decision_source, bootstrap_version
  )
  select exercise.id, 'Technical', rows.technical_subcategory_id, null,
    rows.evaluation_suitability, rows.observability_weight, rows.specificity_weight,
    coalesce(rows.evidence_notes,''), rows.confidence, rows.mapping_status, rows.attivo,
    rows.target_role, null, rows.tactical_family, rows.complexity,
    coalesce(rows.decision_source,'bootstrap'), coalesce(rows.bootstrap_version,1)
  from rows join public.exercises exercise on exercise.codice = rows.exercise_code
  where rows.target_type = 'Technical'
  on conflict (exercise_id, technical_subcategory_id) where target_type = 'Technical'
  do update set
    evaluation_suitability = excluded.evaluation_suitability,
    observability_weight = excluded.observability_weight,
    specificity_weight = excluded.specificity_weight,
    evidence_notes = excluded.evidence_notes,
    confidence = excluded.confidence,
    mapping_status = excluded.mapping_status,
    attivo = excluded.attivo,
    target_role = excluded.target_role,
    tactical_family = excluded.tactical_family,
    complexity = excluded.complexity,
    decision_source = excluded.decision_source,
    bootstrap_version = excluded.bootstrap_version,
    updated_at = now()
  where public.exercise_evaluation_targets.decision_source = 'bootstrap';

  with rows as (
    select * from jsonb_to_recordset(requested_rows) as item(
      exercise_code text, target_type text, technical_subcategory_id integer,
      physical_objective_code text, evaluation_suitability numeric,
      observability_weight numeric, specificity_weight numeric,
      evidence_notes text, confidence text, mapping_status text, attivo boolean,
      target_role text, physical_feasibility text, tactical_family text,
      complexity text, decision_source text, bootstrap_version integer
    )
  )
  insert into public.exercise_evaluation_targets(
    exercise_id, target_type, technical_subcategory_id, physical_objective_id,
    evaluation_suitability, observability_weight, specificity_weight,
    evidence_notes, confidence, mapping_status, attivo, target_role,
    physical_feasibility, tactical_family, complexity, decision_source, bootstrap_version
  )
  select exercise.id, 'Physical', null, objective.id,
    rows.evaluation_suitability, rows.observability_weight, rows.specificity_weight,
    coalesce(rows.evidence_notes,''), rows.confidence, rows.mapping_status, rows.attivo,
    rows.target_role, rows.physical_feasibility, rows.tactical_family, rows.complexity,
    coalesce(rows.decision_source,'bootstrap'), coalesce(rows.bootstrap_version,1)
  from rows
  join public.exercises exercise on exercise.codice = rows.exercise_code
  join public.physical_objectives objective on objective.codice = rows.physical_objective_code
  where rows.target_type = 'Physical'
  on conflict (exercise_id, physical_objective_id) where target_type = 'Physical'
  do update set
    evaluation_suitability = excluded.evaluation_suitability,
    observability_weight = excluded.observability_weight,
    specificity_weight = excluded.specificity_weight,
    evidence_notes = excluded.evidence_notes,
    confidence = excluded.confidence,
    mapping_status = excluded.mapping_status,
    attivo = excluded.attivo,
    target_role = excluded.target_role,
    physical_feasibility = excluded.physical_feasibility,
    tactical_family = excluded.tactical_family,
    complexity = excluded.complexity,
    decision_source = excluded.decision_source,
    bootstrap_version = excluded.bootstrap_version,
    updated_at = now()
  where public.exercise_evaluation_targets.decision_source = 'bootstrap';

  return jsonb_build_object(
    'total', (select count(*) from public.exercise_evaluation_targets),
    'active', (select count(*) from public.exercise_evaluation_targets where attivo),
    'inactive', (select count(*) from public.exercise_evaluation_targets where not attivo),
    'auto_approved', (select count(*) from public.exercise_evaluation_targets where mapping_status = 'auto_approved'),
    'needs_review', (select count(*) from public.exercise_evaluation_targets where mapping_status = 'needs_review'),
    'rejected', (select count(*) from public.exercise_evaluation_targets where mapping_status = 'rejected'),
    'technical', (select count(*) from public.exercise_evaluation_targets where target_type = 'Technical'),
    'physical', (select count(*) from public.exercise_evaluation_targets where target_type = 'Physical'),
    'manual', (select count(*) from public.exercise_evaluation_targets where decision_source = 'manual')
  );
end;
$$;

revoke all on function public.bootstrap_evaluation_targets(jsonb) from public, anon;
grant execute on function public.bootstrap_evaluation_targets(jsonb) to authenticated;

create or replace function public.create_evaluation_training(
  requested_goalkeeper_id uuid,
  requested_training_date date,
  requested_evaluation_type text,
  requested_duration integer,
  requested_minimum_observations integer,
  requested_context_preference text,
  requested_notes text,
  requested_targets jsonb,
  requested_exercises jsonb,
  requested_coverage jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_owner uuid := auth.uid();
  new_training_id uuid;
  new_session_id uuid;
  scale_id_value uuid;
  exercise_count integer := jsonb_array_length(coalesce(requested_exercises, '[]'::jsonb));
  target_count integer := jsonb_array_length(coalesce(requested_targets, '[]'::jsonb));
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  if not exists (select 1 from public.goalkeepers where id = requested_goalkeeper_id and owner_id = current_owner and attivo) then
    raise exception 'Portiere non autorizzato o non attivo';
  end if;
  if requested_evaluation_type not in ('Complete','Targeted') then raise exception 'Tipo valutazione non disponibile'; end if;
  if requested_evaluation_type = 'Complete' and (exercise_count < 6 or exercise_count > 8 or requested_duration < 60 or requested_duration > 80) then
    raise exception 'La valutazione Completa richiede 6-8 esercizi e 60-80 minuti';
  end if;
  if requested_evaluation_type = 'Targeted' and (exercise_count < 1 or exercise_count > 6 or requested_duration < 30 or requested_duration > 60) then
    raise exception 'La valutazione Mirata richiede 1-6 esercizi e 30-60 minuti';
  end if;
  if target_count = 0 then raise exception 'Seleziona almeno un parametro valutativo'; end if;
  if requested_minimum_observations < 1 then raise exception 'Numero minimo osservazioni non valido'; end if;
  if exists (
    select 1 from jsonb_to_recordset(requested_exercises) as item(exercise_id uuid, position integer, planned_duration_minutes integer, selection_weight numeric)
    left join public.exercises exercise on exercise.id = item.exercise_id and exercise.attivo
    where exercise.id is null or item.planned_duration_minutes < 1
  ) then raise exception 'Uno o piu esercizi non sono validi'; end if;

  select id into scale_id_value from public.evaluation_scales
  where code = 'GOALKEEPER_LEVEL' and active order by version desc limit 1;
  if scale_id_value is null then raise exception 'Scala valutativa attiva non disponibile'; end if;

  insert into public.trainings(
    training_date, planned_duration_minutes, goalkeeper_count, notes, status,
    session_type, content_status, generation_mode, focus_source,
    session_profile_code, session_profile_snapshot, session_generation_snapshot,
    owner_id, confirmed_at
  ) values (
    requested_training_date, requested_duration, 1, nullif(trim(requested_notes),''), 'confirmed',
    case when requested_evaluation_type = 'Complete' then 'Valutazione Completa' else 'Valutazione Mirata' end,
    'compiled', 'Automatico', 'Valutazione',
    case when requested_evaluation_type = 'Complete' then 'EVALUATION_COMPLETE' else 'EVALUATION_TARGETED' end,
    jsonb_build_object('evaluation_type', requested_evaluation_type, 'context_preference', requested_context_preference),
    jsonb_build_object('targets', requested_targets, 'coverage', requested_coverage),
    current_owner, now()
  ) returning id into new_training_id;

  insert into public.evaluation_sessions(
    training_id, goalkeeper_id, evaluation_type, status, scale_id,
    minimum_observations, minimum_distinct_exercises, notes, owner_id,
    context_preference, configuration_snapshot, coverage_snapshot
  ) values (
    new_training_id, requested_goalkeeper_id, requested_evaluation_type, 'Draft', scale_id_value,
    requested_minimum_observations, least(2, requested_minimum_observations), nullif(trim(requested_notes),''), current_owner,
    coalesce(nullif(trim(requested_context_preference),''),'Bilanciata'),
    jsonb_build_object('duration', requested_duration, 'minimum_observations', requested_minimum_observations),
    coalesce(requested_coverage,'[]'::jsonb)
  ) returning id into new_session_id;

  insert into public.training_goalkeepers(training_id, goalkeeper_id, owner_id)
  values (new_training_id, requested_goalkeeper_id, current_owner);

  insert into public.evaluation_session_targets(
    evaluation_session_id, target_type, technical_subcategory_id, physical_objective_id,
    physical_dimension_id, priority, required_observations, required_distinct_exercises,
    source, parameter_name_snapshot, owner_id, coverage_status, coverage_explanation
  )
  select new_session_id, item.target_type, item.technical_subcategory_id,
    item.physical_objective_id, item.physical_dimension_id,
    coalesce(item.priority,3), coalesce(item.required_observations,requested_minimum_observations),
    coalesce(item.required_distinct_exercises,least(2,requested_minimum_observations)),
    item.source, item.parameter_name_snapshot, current_owner,
    coalesce(item.coverage_status,'NOT_COVERED'), coalesce(item.coverage_explanation,'')
  from jsonb_to_recordset(requested_targets) as item(
    target_type text, technical_subcategory_id integer, physical_objective_id uuid,
    physical_dimension_id uuid, priority integer, required_observations integer,
    required_distinct_exercises integer, source text, parameter_name_snapshot text,
    coverage_status text, coverage_explanation text
  );

  insert into public.training_exercises(
    training_id, exercise_id, position, planned_duration_minutes, notes,
    selection_snapshot, locked, source, owner_id
  )
  select new_training_id, item.exercise_id, item.position, item.planned_duration_minutes, null,
    jsonb_build_object('evaluation_utility', item.selection_weight, 'evaluation_session_id', new_session_id),
    true, 'generated', current_owner
  from jsonb_to_recordset(requested_exercises) as item(
    exercise_id uuid, position integer, planned_duration_minutes integer, selection_weight numeric
  ) order by item.position;

  insert into public.evaluation_exercise_targets(
    evaluation_session_id, training_id, training_exercise_id, session_target_id,
    observability_weight, selection_weight, planned_observations, owner_id
  )
  select new_session_id, new_training_id, training_exercise.id, session_target.id,
    mapping.observability_weight, mapping.evaluation_suitability, 1, current_owner
  from public.training_exercises training_exercise
  join public.exercise_evaluation_targets mapping
    on mapping.exercise_id = training_exercise.exercise_id and mapping.attivo and mapping.mapping_status = 'auto_approved'
  join public.evaluation_session_targets session_target
    on session_target.evaluation_session_id = new_session_id
   and ((mapping.target_type = 'Technical' and session_target.target_type = 'Technical' and mapping.technical_subcategory_id = session_target.technical_subcategory_id)
     or (mapping.target_type = 'Physical' and session_target.target_type = 'Physical' and mapping.physical_objective_id = session_target.physical_objective_id))
  where training_exercise.training_id = new_training_id;

  update public.evaluation_sessions set status = 'Ready' where id = new_session_id;

  return jsonb_build_object(
    'training_id', new_training_id,
    'evaluation_session_id', new_session_id,
    'training_exercises', exercise_count,
    'targets', target_count,
    'exercise_target_links', (select count(*) from public.evaluation_exercise_targets where evaluation_session_id = new_session_id)
  );
end;
$$;

revoke all on function public.create_evaluation_training(uuid,date,text,integer,integer,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_evaluation_training(uuid,date,text,integer,integer,text,text,jsonb,jsonb,jsonb) to authenticated;

commit;

select 'MIGRATION 0032 COMPLETATA: BOOTSTRAP E SEDUTA DI VALUTAZIONE PRODUCTION' as risultato;
