begin;

alter table public.evaluation_sessions
  drop constraint if exists evaluation_sessions_evaluation_type_check;

alter table public.evaluation_sessions
  add constraint evaluation_sessions_evaluation_type_check
  check (evaluation_type in ('Complete','Targeted','Custom','Reassessment'));

create or replace function public.create_custom_evaluation_training(
  requested_goalkeeper_id uuid,
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
set search_path = public
as $$
declare
  current_owner uuid := auth.uid();
  result jsonb;
  new_training_id uuid;
  new_session_id uuid;
begin
  if current_owner is null then raise exception 'Autenticazione richiesta'; end if;
  result := public.create_evaluation_training(requested_goalkeeper_id, requested_training_date, 'Targeted', requested_duration, requested_minimum_observations, requested_context_preference, requested_notes, requested_targets, requested_exercises, requested_coverage);
  new_training_id := (result ->> 'training_id')::uuid;
  new_session_id := (result ->> 'evaluation_session_id')::uuid;
  update public.evaluation_sessions set evaluation_type = 'Custom' where id = new_session_id and owner_id = current_owner;
  update public.trainings
    set session_type = 'Valutazione Personalizzata', session_profile_code = 'EVALUATION_CUSTOM',
        session_profile_snapshot = coalesce(session_profile_snapshot, '{}'::jsonb) || jsonb_build_object('evaluation_type', 'Custom')
    where id = new_training_id and owner_id = current_owner;
  return result || jsonb_build_object('evaluation_type', 'Custom');
end;
$$;

revoke all on function public.create_custom_evaluation_training(uuid,date,integer,integer,text,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_custom_evaluation_training(uuid,date,integer,integer,text,text,jsonb,jsonb,jsonb) to authenticated;

commit;

select 'MIGRATION 0036 COMPLETATA: VALUTAZIONE PERSONALIZZATA' as risultato;
