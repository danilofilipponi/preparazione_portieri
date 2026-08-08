-- Fase 4: editor seduta, lock, revisioni, varianti e audit.
begin;
alter table public.trainings add column if not exists session_generation_snapshot jsonb not null default '{}'::jsonb;
alter table public.trainings add column if not exists current_quality_snapshot jsonb not null default '{}'::jsonb;
alter table public.trainings add column if not exists regeneration_count integer not null default 0;
alter table public.trainings add column if not exists revision_number integer not null default 1;
alter table public.trainings add column if not exists confirmed_at timestamptz;
alter table public.trainings alter column status set default 'draft';
alter table public.trainings drop constraint if exists trainings_status_check;
alter table public.trainings add constraint trainings_status_check check(status in ('planned','draft','confirmed','completed','cancelled'));
alter table public.training_blocks add column if not exists regeneration_count integer not null default 0;
alter table public.training_exercises add column if not exists locked boolean not null default false;
alter table public.training_exercises add column if not exists source text not null default 'legacy';
alter table public.training_exercises add column if not exists replacement_reason text;
alter table public.training_exercises add column if not exists replacement_note text;
alter table public.training_exercises add column if not exists created_at timestamptz not null default now();
alter table public.training_exercises add column if not exists updated_at timestamptz not null default now();
alter table public.training_exercises alter column source set default 'generated';
do $c$ begin
  if not exists(select 1 from pg_constraint where conname='training_exercises_source_check') then alter table public.training_exercises add constraint training_exercises_source_check check(source in('legacy','generated','manual','replacement','regenerated')); end if;
end $c$;
alter table public.training_exercise_goalkeeper_variants add column if not exists tipo text not null default 'Manuale';
alter table public.training_exercise_goalkeeper_variants add column if not exists motivazione text;
alter table public.training_exercise_goalkeeper_variants add column if not exists priority_source text;
alter table public.training_exercise_goalkeeper_variants add column if not exists updated_at timestamptz not null default now();
create table if not exists public.training_exercise_changes(
 id uuid primary key default gen_random_uuid(), training_id uuid not null references public.trainings(id) on delete cascade,
 training_exercise_id uuid references public.training_exercises(id) on delete set null,
 action text not null check(action in('lock','unlock','replacement','manual_add','remove','duration','reorder','move','regenerate_block','regenerate_session')),
 before_snapshot jsonb not null default '{}'::jsonb, after_snapshot jsonb not null default '{}'::jsonb,
 reason_code text, note text, created_at timestamptz not null default now()
);
create index if not exists training_exercise_changes_training_idx on public.training_exercise_changes(training_id,created_at);
alter table public.training_exercise_changes enable row level security;
do $p$ begin if not exists(select 1 from pg_policies where schemaname='public' and tablename='training_exercise_changes' and policyname='public training exercise changes access') then create policy "public training exercise changes access" on public.training_exercise_changes for all to anon,authenticated using(true) with check(true); end if; end $p$;
do $t$ begin
 if not exists(select 1 from pg_trigger where tgname='training_exercises_set_updated_at') then create trigger training_exercises_set_updated_at before update on public.training_exercises for each row execute function public.set_updated_at(); end if;
 if not exists(select 1 from pg_trigger where tgname='training_exercise_variants_set_updated_at') then create trigger training_exercise_variants_set_updated_at before update on public.training_exercise_goalkeeper_variants for each row execute function public.set_updated_at(); end if;
end $t$;
create or replace function public.replace_generated_training_exercises(requested_training_id uuid,requested_items jsonb)
returns integer language plpgsql security invoker set search_path=public as $$ declare inserted_count integer; begin
 delete from public.training_exercises where training_id=requested_training_id;
 insert into public.training_exercises(training_id,exercise_id,position,planned_duration_minutes,notes,training_block_id,block_position,exercise_score,selection_snapshot,fallback_level,individual_variant_suggestion,locked,source,replacement_reason,replacement_note)
 select requested_training_id,i.exercise_id,i.position,i.planned_duration_minutes,null,i.training_block_id,i.block_position,i.exercise_score,i.selection_snapshot,i.fallback_level,i.individual_variant_suggestion,coalesce(i.locked,false),coalesce(i.source,'generated'),i.replacement_reason,i.replacement_note
 from jsonb_to_recordset(coalesce(requested_items,'[]'::jsonb)) as i(exercise_id uuid,position integer,planned_duration_minutes integer,training_block_id uuid,block_position integer,exercise_score numeric,selection_snapshot jsonb,fallback_level smallint,individual_variant_suggestion text,locked boolean,source text,replacement_reason text,replacement_note text);
 get diagnostics inserted_count=row_count; return inserted_count; end $$;
grant execute on function public.replace_generated_training_exercises(uuid,jsonb) to anon,authenticated;
commit;
select 'MIGRATION 0024 COMPLETATA' as risultato;
