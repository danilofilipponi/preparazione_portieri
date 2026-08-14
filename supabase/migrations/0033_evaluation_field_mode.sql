-- Field Evaluation Mode e Results Summary.
-- Incrementale: non modifica motore, mapping, catalogo o Tactical Board.

begin;

alter table public.evaluation_observations
  alter column score drop not null,
  add column if not exists observation_status text not null default 'OBSERVED',
  add column if not exists idempotency_key uuid not null default gen_random_uuid();

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'evaluation_observations_status_check') then
    alter table public.evaluation_observations
      add constraint evaluation_observations_status_check
      check (
        (observation_status = 'OBSERVED' and score is not null)
        or (observation_status = 'NOT_OBSERVED' and score is null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'evaluation_observations_owner_idempotency_unique') then
    alter table public.evaluation_observations
      add constraint evaluation_observations_owner_idempotency_unique
      unique(owner_id, idempotency_key);
  end if;
end
$constraints$;

create or replace function public.validate_evaluation_observation_score()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_scale_id uuid;
  requested_status text;
begin
  select session.scale_id, session.status
    into requested_scale_id, requested_status
  from public.evaluation_exercise_targets exercise_target
  join public.evaluation_sessions session
    on session.id = exercise_target.evaluation_session_id
   and session.owner_id = exercise_target.owner_id
  where exercise_target.id = new.evaluation_exercise_target_id
    and exercise_target.owner_id = new.owner_id;

  if requested_scale_id is null then
    raise exception 'Target valutativo non valido per il proprietario';
  end if;
  if requested_status <> 'InProgress' then
    raise exception 'La sessione non accetta nuove osservazioni nello stato %', requested_status;
  end if;
  if new.observation_status = 'NOT_OBSERVED' then
    if new.score is not null then raise exception 'NOT_OBSERVED richiede score NULL'; end if;
  elsif new.observation_status = 'OBSERVED' then
    if new.score is null or not exists (
      select 1 from public.evaluation_scale_levels
      where scale_id = requested_scale_id and score = new.score
    ) then
      raise exception 'Score % non previsto dalla scala della seduta', new.score;
    end if;
  else
    raise exception 'Stato osservazione non valido';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_evaluation_observation_score() from public, anon, authenticated;

create or replace function public.start_evaluation_session(requested_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_owner uuid := auth.uid();
  current_status text;
  started_value timestamptz;
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  select status, started_at into current_status, started_value
  from public.evaluation_sessions
  where id = requested_session_id and owner_id = current_owner
  for update;
  if not found then raise exception 'Sessione non autorizzata'; end if;
  if current_status = 'Completed' then raise exception 'La valutazione e gia completata'; end if;
  if current_status not in ('Ready','InProgress') then raise exception 'Stato sessione non avviabile: %', current_status; end if;
  if current_status = 'Ready' then
    update public.evaluation_sessions
    set status = 'InProgress', started_at = coalesce(started_at, now())
    where id = requested_session_id and owner_id = current_owner
    returning started_at into started_value;
  end if;
  return jsonb_build_object('session_id', requested_session_id, 'status', 'InProgress', 'started_at', started_value);
end;
$$;

create or replace function public.record_evaluation_observation(
  requested_exercise_target_id uuid,
  requested_score integer,
  requested_observation_status text,
  requested_notes text,
  requested_confidence numeric,
  requested_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_owner uuid := auth.uid();
  requested_session_id uuid;
  current_status text;
  next_number integer;
  observation_row public.evaluation_observations%rowtype;
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  if requested_idempotency_key is null then raise exception 'Idempotency key richiesta'; end if;
  if requested_observation_status not in ('OBSERVED','NOT_OBSERVED') then raise exception 'Stato osservazione non valido'; end if;
  if requested_observation_status = 'OBSERVED' and requested_score is null then raise exception 'Seleziona uno score'; end if;
  if requested_observation_status = 'NOT_OBSERVED' and requested_score is not null then raise exception 'NOT_OBSERVED non accetta score'; end if;
  if requested_confidence is not null and (requested_confidence < 0 or requested_confidence > 1) then raise exception 'Confidence non valida'; end if;

  select evaluation_session_id into requested_session_id
  from public.evaluation_exercise_targets
  where id = requested_exercise_target_id and owner_id = current_owner;
  if requested_session_id is null then raise exception 'Target non autorizzato'; end if;

  select status into current_status
  from public.evaluation_sessions
  where id = requested_session_id and owner_id = current_owner
  for update;
  if current_status <> 'InProgress' then raise exception 'La sessione non accetta osservazioni nello stato %', current_status; end if;

  select * into observation_row
  from public.evaluation_observations
  where owner_id = current_owner and idempotency_key = requested_idempotency_key;
  if found then return to_jsonb(observation_row) || jsonb_build_object('duplicate', true); end if;

  select coalesce(max(observation_number),0) + 1 into next_number
  from public.evaluation_observations
  where evaluation_exercise_target_id = requested_exercise_target_id;

  insert into public.evaluation_observations(
    evaluation_exercise_target_id, observation_number, score, notes, confidence,
    owner_id, observation_status, idempotency_key
  ) values (
    requested_exercise_target_id, next_number,
    case when requested_observation_status = 'OBSERVED' then requested_score else null end,
    nullif(trim(requested_notes),''), coalesce(requested_confidence,1),
    current_owner, requested_observation_status, requested_idempotency_key
  ) returning * into observation_row;
  return to_jsonb(observation_row) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.complete_evaluation_session(requested_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_owner uuid := auth.uid();
  current_status text;
  completed_value timestamptz;
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  select status, completed_at into current_status, completed_value
  from public.evaluation_sessions
  where id = requested_session_id and owner_id = current_owner
  for update;
  if not found then raise exception 'Sessione non autorizzata'; end if;
  if current_status = 'Completed' then
    return jsonb_build_object('session_id', requested_session_id, 'status', current_status, 'completed_at', completed_value, 'duplicate', true);
  end if;
  if current_status <> 'InProgress' then raise exception 'La sessione non puo essere completata dallo stato %', current_status; end if;
  update public.evaluation_sessions
  set status = 'Completed', completed_at = now()
  where id = requested_session_id and owner_id = current_owner
  returning completed_at into completed_value;
  return jsonb_build_object('session_id', requested_session_id, 'status', 'Completed', 'completed_at', completed_value, 'duplicate', false);
end;
$$;

create or replace function public.get_evaluation_field_session(requested_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  current_owner uuid := auth.uid();
  result jsonb;
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  if not exists (select 1 from public.evaluation_sessions where id = requested_session_id and owner_id = current_owner) then
    raise exception 'Sessione non autorizzata';
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id, 'training_id', session.training_id, 'status', session.status,
      'evaluation_type', session.evaluation_type, 'started_at', session.started_at,
      'completed_at', session.completed_at, 'minimum_observations', session.minimum_observations,
      'date', training.training_date, 'goalkeeper_id', session.goalkeeper_id,
      'goalkeeper_name', trim(goalkeeper.nome || ' ' || goalkeeper.cognome)
    ),
    'scale_levels', coalesce((
      select jsonb_agg(jsonb_build_object('score', level.score, 'label', level.label, 'description', level.description) order by level.display_order)
      from public.evaluation_scale_levels level where level.scale_id = session.scale_id
    ), '[]'::jsonb),
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'training_exercise_id', training_exercise.id,
        'position', training_exercise.position,
        'planned_duration_minutes', training_exercise.planned_duration_minutes,
        'exercise', to_jsonb(exercise),
        'targets', coalesce((
          select jsonb_agg(jsonb_build_object(
            'exercise_target_id', exercise_target.id,
            'session_target_id', target.id,
            'target_type', target.target_type,
            'parameter_name', target.parameter_name_snapshot,
            'technical_name', subcategory.nome,
            'physical_dimension_id', target.physical_dimension_id,
            'physical_dimension_name', dimension.nome,
            'physical_objective_id', target.physical_objective_id,
            'fis_code', physical.codice,
            'fis_name', physical.obiettivo_fisico,
            'observability_weight', exercise_target.observability_weight,
            'suitability_weight', exercise_target.selection_weight,
            'evidence_notes', coalesce(mapping.evidence_notes,''),
            'coverage_status', target.coverage_status
          ) order by target.priority desc, target.parameter_name_snapshot)
          from public.evaluation_exercise_targets exercise_target
          join public.evaluation_session_targets target on target.id = exercise_target.session_target_id
          left join public.exercise_subcategories subcategory on subcategory.id = target.technical_subcategory_id
          left join public.physical_assessment_dimensions dimension on dimension.id = target.physical_dimension_id
          left join public.physical_objectives physical on physical.id = target.physical_objective_id
          left join public.exercise_evaluation_targets mapping
            on mapping.exercise_id = exercise.id and mapping.attivo
           and ((target.target_type = 'Technical' and mapping.target_type = 'Technical' and mapping.technical_subcategory_id = target.technical_subcategory_id)
             or (target.target_type = 'Physical' and mapping.target_type = 'Physical' and mapping.physical_objective_id = target.physical_objective_id))
          where exercise_target.evaluation_session_id = session.id
            and exercise_target.training_exercise_id = training_exercise.id
        ), '[]'::jsonb)
      ) order by training_exercise.position)
      from public.training_exercises training_exercise
      join public.exercises exercise on exercise.id = training_exercise.exercise_id
      where training_exercise.training_id = session.training_id
    ), '[]'::jsonb),
    'observations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', observation.id, 'exercise_target_id', observation.evaluation_exercise_target_id,
        'observation_number', observation.observation_number, 'score', observation.score,
        'observation_status', observation.observation_status, 'notes', observation.notes,
        'confidence', observation.confidence, 'observed_at', observation.observed_at
      ) order by observation.observed_at)
      from public.evaluation_observations observation
      join public.evaluation_exercise_targets exercise_target on exercise_target.id = observation.evaluation_exercise_target_id
      where exercise_target.evaluation_session_id = session.id
    ), '[]'::jsonb)
  ) into result
  from public.evaluation_sessions session
  join public.trainings training on training.id = session.training_id
  join public.goalkeepers goalkeeper on goalkeeper.id = session.goalkeeper_id
  where session.id = requested_session_id and session.owner_id = current_owner;
  return result;
end;
$$;

revoke insert, update on public.evaluation_sessions from authenticated;
revoke update, delete on public.evaluation_observations from authenticated;
revoke all on function public.start_evaluation_session(uuid) from public, anon;
revoke all on function public.record_evaluation_observation(uuid,integer,text,text,numeric,uuid) from public, anon;
revoke all on function public.complete_evaluation_session(uuid) from public, anon;
revoke all on function public.get_evaluation_field_session(uuid) from public, anon;
grant execute on function public.start_evaluation_session(uuid) to authenticated;
grant execute on function public.record_evaluation_observation(uuid,integer,text,text,numeric,uuid) to authenticated;
grant execute on function public.complete_evaluation_session(uuid) to authenticated;
grant execute on function public.get_evaluation_field_session(uuid) to authenticated;

commit;

select 'MIGRATION 0033 COMPLETATA: FIELD EVALUATION MODE' as risultato;
