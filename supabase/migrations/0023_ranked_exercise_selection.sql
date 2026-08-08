-- Fase 3: snapshot del ranking degli esercizi selezionati nei blocchi.
-- Conservativa: non modifica catalogo o mappature.
begin;
alter table public.training_blocks add column if not exists transition_minutes integer not null default 2;
alter table public.training_exercises add column if not exists training_block_id uuid references public.training_blocks(id) on delete set null;
alter table public.training_exercises add column if not exists block_position integer;
alter table public.training_exercises add column if not exists exercise_score numeric(5,2);
alter table public.training_exercises add column if not exists selection_snapshot jsonb not null default '{}'::jsonb;
alter table public.training_exercises add column if not exists fallback_level smallint not null default 0;
alter table public.training_exercises add column if not exists individual_variant_suggestion text;
do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='training_blocks_transition_minutes_check') then alter table public.training_blocks add constraint training_blocks_transition_minutes_check check (transition_minutes between 0 and 10); end if;
  if not exists (select 1 from pg_constraint where conname='training_exercises_score_check') then alter table public.training_exercises add constraint training_exercises_score_check check (exercise_score is null or exercise_score between 0 and 100); end if;
  if not exists (select 1 from pg_constraint where conname='training_exercises_fallback_check') then alter table public.training_exercises add constraint training_exercises_fallback_check check (fallback_level between 0 and 6); end if;
end
$constraints$;
create unique index if not exists training_exercises_block_position_idx on public.training_exercises(training_block_id, block_position) where training_block_id is not null;
create index if not exists training_exercises_history_idx on public.training_exercises(exercise_id, training_id);
create or replace function public.replace_generated_training_exercises(requested_training_id uuid, requested_items jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare inserted_count integer;
begin
  if not exists (select 1 from public.trainings where id=requested_training_id) then raise exception 'Seduta non trovata'; end if;
  delete from public.training_exercises where training_id=requested_training_id;
  insert into public.training_exercises(training_id,exercise_id,position,planned_duration_minutes,notes,training_block_id,block_position,exercise_score,selection_snapshot,fallback_level,individual_variant_suggestion)
  select requested_training_id,item.exercise_id,item.position,item.planned_duration_minutes,null,item.training_block_id,item.block_position,item.exercise_score,item.selection_snapshot,item.fallback_level,item.individual_variant_suggestion
  from jsonb_to_recordset(coalesce(requested_items,'[]'::jsonb)) as item(exercise_id uuid,position integer,planned_duration_minutes integer,training_block_id uuid,block_position integer,exercise_score numeric,selection_snapshot jsonb,fallback_level smallint,individual_variant_suggestion text);
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
grant execute on function public.replace_generated_training_exercises(uuid,jsonb) to anon, authenticated;
commit;
select 'MIGRATION 0023 COMPLETATA' as risultato;
