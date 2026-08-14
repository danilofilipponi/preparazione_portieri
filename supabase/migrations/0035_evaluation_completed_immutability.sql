-- Hardening finale Evaluation V1.
-- Nessun dato viene modificato: restringe soltanto le scritture dirette sulle
-- sessioni completate e sulle relative righe figlie.

begin;

create or replace function public.guard_completed_evaluation_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'Completed' then
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

drop trigger if exists evaluation_sessions_completed_immutability
  on public.evaluation_sessions;
create trigger evaluation_sessions_completed_immutability
before update or delete on public.evaluation_sessions
for each row execute function public.guard_completed_evaluation_session();

drop policy if exists evaluation_sessions_owner_access
  on public.evaluation_sessions;
create policy evaluation_sessions_owner_read
  on public.evaluation_sessions for select to authenticated
  using (owner_id = auth.uid());
create policy evaluation_sessions_owner_insert
  on public.evaluation_sessions for insert to authenticated
  with check (owner_id = auth.uid() and status <> 'Completed');
create policy evaluation_sessions_owner_update_open
  on public.evaluation_sessions for update to authenticated
  using (owner_id = auth.uid() and status <> 'Completed')
  with check (owner_id = auth.uid() and status <> 'Completed');
create policy evaluation_sessions_owner_delete_open
  on public.evaluation_sessions for delete to authenticated
  using (owner_id = auth.uid() and status <> 'Completed');

drop policy if exists evaluation_session_targets_owner_access
  on public.evaluation_session_targets;
create policy evaluation_session_targets_owner_read
  on public.evaluation_session_targets for select to authenticated
  using (owner_id = auth.uid());
create policy evaluation_session_targets_owner_insert_open
  on public.evaluation_session_targets for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );
create policy evaluation_session_targets_owner_update_open
  on public.evaluation_session_targets for update to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );
create policy evaluation_session_targets_owner_delete_open
  on public.evaluation_session_targets for delete to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );

drop policy if exists evaluation_exercise_targets_owner_access
  on public.evaluation_exercise_targets;
create policy evaluation_exercise_targets_owner_read
  on public.evaluation_exercise_targets for select to authenticated
  using (owner_id = auth.uid());
create policy evaluation_exercise_targets_owner_insert_open
  on public.evaluation_exercise_targets for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );
create policy evaluation_exercise_targets_owner_update_open
  on public.evaluation_exercise_targets for update to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );
create policy evaluation_exercise_targets_owner_delete_open
  on public.evaluation_exercise_targets for delete to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.evaluation_sessions session
      where session.id = evaluation_session_id
        and session.owner_id = auth.uid()
        and session.status <> 'Completed'
    )
  );

drop policy if exists evaluation_observations_owner_insert
  on public.evaluation_observations;
create policy evaluation_observations_owner_insert_in_progress
  on public.evaluation_observations for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1
      from public.evaluation_exercise_targets exercise_target
      join public.evaluation_sessions session
        on session.id = exercise_target.evaluation_session_id
       and session.owner_id = exercise_target.owner_id
      where exercise_target.id = evaluation_exercise_target_id
        and exercise_target.owner_id = auth.uid()
        and session.status = 'InProgress'
    )
  );

commit;

select 'MIGRATION 0035 PREPARATA: EVALUATION COMPLETED IMMUTABILITY' as risultato;
