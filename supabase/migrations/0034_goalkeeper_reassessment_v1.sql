-- Goalkeeper Reassessment V1.
-- Riutilizza evaluation_sessions.previous_evaluation_session_id e la creazione production esistente.
-- Nessuna modifica ai dati o alle sessioni già presenti.

begin;

create index if not exists evaluation_sessions_previous_idx
  on public.evaluation_sessions(previous_evaluation_session_id)
  where previous_evaluation_session_id is not null;

create or replace function public.validate_reassessment_baseline()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  baseline public.evaluation_sessions%rowtype;
begin
  if new.evaluation_type = 'Reassessment' and new.previous_evaluation_session_id is null then
    raise exception 'Una Rivalutazione richiede una baseline';
  end if;
  if new.evaluation_type <> 'Reassessment' and new.previous_evaluation_session_id is not null then
    raise exception 'Il riferimento baseline è consentito solo per una Rivalutazione';
  end if;
  if new.previous_evaluation_session_id is null then return new; end if;
  if new.id = new.previous_evaluation_session_id then raise exception 'Una seduta non può essere baseline di se stessa'; end if;

  select * into baseline
  from public.evaluation_sessions
  where id = new.previous_evaluation_session_id and owner_id = new.owner_id;

  if baseline.id is null then raise exception 'Baseline non disponibile per il proprietario corrente'; end if;
  if baseline.status <> 'Completed' then raise exception 'La baseline deve essere Completed'; end if;
  if baseline.goalkeeper_id <> new.goalkeeper_id then raise exception 'Baseline e Rivalutazione devono appartenere allo stesso portiere'; end if;
  return new;
end;
$$;

drop trigger if exists evaluation_sessions_reassessment_baseline_check on public.evaluation_sessions;
create trigger evaluation_sessions_reassessment_baseline_check
before insert or update of evaluation_type, previous_evaluation_session_id, goalkeeper_id, owner_id
on public.evaluation_sessions
for each row execute function public.validate_reassessment_baseline();

create or replace function public.create_reassessment_training(
  requested_baseline_session_id uuid,
  requested_training_date date,
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
  baseline public.evaluation_sessions%rowtype;
  created jsonb;
  new_training_id uuid;
  new_session_id uuid;
  exercise_count integer := jsonb_array_length(coalesce(requested_exercises, '[]'::jsonb));
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;

  select * into baseline
  from public.evaluation_sessions
  where id = requested_baseline_session_id and owner_id = current_owner;

  if baseline.id is null then raise exception 'Baseline non autorizzata o inesistente'; end if;
  if baseline.status <> 'Completed' then raise exception 'La baseline deve essere Completed'; end if;
  if requested_duration < 20 or requested_duration > 45 then raise exception 'La Rivalutazione richiede 20-45 minuti'; end if;
  if exercise_count < 1 or exercise_count > 5 then raise exception 'La Rivalutazione richiede 1-5 esercizi'; end if;

  if exists (
    select 1
    from jsonb_to_recordset(coalesce(requested_targets, '[]'::jsonb)) as requested(
      target_type text, technical_subcategory_id integer, physical_objective_id uuid,
      physical_dimension_id uuid, priority integer, required_observations integer,
      required_distinct_exercises integer, source text, parameter_name_snapshot text,
      coverage_status text, coverage_explanation text
    )
    where not exists (
      select 1 from public.evaluation_session_targets original
      where original.evaluation_session_id = baseline.id
        and original.owner_id = current_owner
        and original.target_type = requested.target_type
        and original.technical_subcategory_id is not distinct from requested.technical_subcategory_id
        and original.physical_objective_id is not distinct from requested.physical_objective_id
    )
  ) then raise exception 'I target della Rivalutazione devono essere un sottoinsieme della baseline'; end if;

  -- La RPC production esistente crea atomicamente training, target ed exercise links.
  -- GREATEST(...,30) soddisfa il range Targeted interno; il valore reale viene ripristinato sotto.
  created := public.create_evaluation_training(
    baseline.goalkeeper_id,
    requested_training_date,
    'Targeted',
    greatest(requested_duration, 30),
    requested_minimum_observations,
    requested_context_preference,
    requested_notes,
    requested_targets,
    requested_exercises,
    requested_coverage
  );

  new_training_id := (created->>'training_id')::uuid;
  new_session_id := (created->>'evaluation_session_id')::uuid;

  update public.trainings
  set planned_duration_minutes = requested_duration,
      session_type = 'Rivalutazione',
      session_profile_code = 'EVALUATION_REASSESSMENT',
      session_profile_snapshot = coalesce(session_profile_snapshot, '{}'::jsonb)
        || jsonb_build_object('evaluation_type','Reassessment','baseline_session_id',baseline.id)
  where id = new_training_id and owner_id = current_owner;

  update public.evaluation_sessions
  set evaluation_type = 'Reassessment',
      previous_evaluation_session_id = baseline.id,
      configuration_snapshot = coalesce(configuration_snapshot, '{}'::jsonb)
        || jsonb_build_object('duration',requested_duration,'baseline_session_id',baseline.id)
  where id = new_session_id and owner_id = current_owner;

  return created || jsonb_build_object(
    'evaluation_type', 'Reassessment',
    'baseline_session_id', baseline.id
  );
end;
$$;

revoke all on function public.validate_reassessment_baseline() from public, anon, authenticated;
revoke all on function public.create_reassessment_training(uuid,date,integer,integer,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_reassessment_training(uuid,date,integer,integer,text,text,jsonb,jsonb,jsonb) to authenticated;

commit;

select 'MIGRATION 0034 PREPARATA: GOALKEEPER REASSESSMENT V1' as risultato;
