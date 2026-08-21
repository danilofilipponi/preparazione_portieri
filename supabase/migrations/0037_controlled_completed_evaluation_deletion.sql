-- Cancellazione esplicita e controllata di una seduta di valutazione.
-- Mantiene l'immutabilita delle valutazioni completate per tutte le scritture
-- ordinarie e consente la rimozione solo al proprietario autenticato tramite RPC.

begin;

create or replace function public.guard_completed_evaluation_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'Completed'
     and coalesce(current_setting('keeperlab.controlled_evaluation_delete', true), '') <> 'on' then
    raise exception 'Una seduta di valutazione completata e immutabile';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_completed_evaluation_session()
  from public, anon, authenticated;

create or replace function public.delete_owned_evaluation_training(
  requested_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  target_session public.evaluation_sessions%rowtype;
begin
  if current_owner is null then
    raise exception 'Autenticazione richiesta';
  end if;

  select * into target_session
  from public.evaluation_sessions
  where id = requested_session_id
    and owner_id = current_owner
  for update;

  if target_session.id is null then
    raise exception 'Valutazione non disponibile o non autorizzata';
  end if;

  if exists (
    select 1
    from public.evaluation_sessions reassessment
    where reassessment.previous_evaluation_session_id = target_session.id
      and reassessment.owner_id = current_owner
  ) then
    raise exception 'Questa valutazione e usata come baseline da una rivalutazione e non puo essere eliminata';
  end if;

  perform set_config('keeperlab.controlled_evaluation_delete', 'on', true);

  delete from public.trainings
  where id = target_session.training_id
    and owner_id = current_owner;

  if not found then
    raise exception 'Seduta collegata non trovata o non autorizzata';
  end if;

  return jsonb_build_object(
    'deleted', true,
    'evaluation_session_id', target_session.id,
    'training_id', target_session.training_id
  );
end;
$$;

revoke all on function public.delete_owned_evaluation_training(uuid)
  from public, anon;
grant execute on function public.delete_owned_evaluation_training(uuid)
  to authenticated;

comment on function public.delete_owned_evaluation_training(uuid) is
  'Elimina atomicamente una valutazione e la relativa seduta solo per il proprietario autenticato; rifiuta baseline gia usate.';

commit;

select 'MIGRATION 0037 PREPARATA: CONTROLLED COMPLETED EVALUATION DELETION' as risultato;
