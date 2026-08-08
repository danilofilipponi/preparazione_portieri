-- Pianificatore sedute basato su profilo, portieri presenti e priorita spiegabili.
-- Migrazione conservativa: non elimina e non rinomina dati esistenti.

begin;

create table if not exists public.weekly_training_focus (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  week_start date not null,
  primary_category_id integer references public.exercise_categories(id) on delete set null,
  secondary_category_id integer references public.exercise_categories(id) on delete set null,
  source text not null default 'Automatico' check (source in ('Automatico','Assistito','Manuale')),
  reasons_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, week_start)
);

create table if not exists public.training_blocks (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references public.trainings(id) on delete cascade,
  tipo_blocco text not null check (tipo_blocco in ('Attivazione','Tecnico principale','Disturbo / tecnico-fisico','Situazionale / Match Simulation')),
  ordine smallint not null check (ordine between 1 and 4),
  durata_target integer not null check (durata_target > 0),
  fase_metodologica_preferita text,
  carico_target text,
  technical_category_id integer references public.exercise_categories(id) on delete set null,
  physical_dimension_id uuid references public.physical_assessment_dimensions(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_id, ordine)
);

alter table public.trainings add column if not exists generation_mode text not null default 'Automatico';
alter table public.trainings add column if not exists focus_source text;
alter table public.trainings add column if not exists technical_focus_primary_category_id integer references public.exercise_categories(id) on delete set null;
alter table public.trainings add column if not exists technical_focus_secondary_category_id integer references public.exercise_categories(id) on delete set null;
alter table public.trainings add column if not exists physical_focus_dimension_id uuid references public.physical_assessment_dimensions(id) on delete set null;
alter table public.trainings add column if not exists weekly_focus_id uuid references public.weekly_training_focus(id) on delete set null;
alter table public.trainings add column if not exists session_profile_code text;
alter table public.trainings add column if not exists session_profile_snapshot jsonb not null default '{}'::jsonb;
alter table public.trainings add column if not exists technical_ranking_snapshot jsonb not null default '[]'::jsonb;
alter table public.trainings add column if not exists physical_ranking_snapshot jsonb not null default '[]'::jsonb;
alter table public.trainings add column if not exists generation_reason_snapshot jsonb not null default '{}'::jsonb;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname='trainings_generation_mode_check' and conrelid='public.trainings'::regclass) then
    alter table public.trainings add constraint trainings_generation_mode_check check (generation_mode in ('Automatico','Assistito','Manuale'));
  end if;
end
$constraints$;

create index if not exists training_blocks_training_idx on public.training_blocks(training_id, ordine);
create index if not exists weekly_training_focus_week_idx on public.weekly_training_focus(season_id, week_start);

create or replace view public.training_category_usage as
select t.season_id, t.training_date, e.category_id, count(*)::integer as utilizzi
from public.trainings t
join public.training_exercises te on te.training_id=t.id
join public.exercises e on e.id=te.exercise_id
where e.category_id is not null
group by t.season_id,t.training_date,e.category_id
union all
select t.season_id, t.training_date, b.technical_category_id, count(*)::integer
from public.trainings t
join public.training_blocks b on b.training_id=t.id
where b.technical_category_id is not null
group by t.season_id,t.training_date,b.technical_category_id;

do $triggers$
declare table_name text;
begin
  foreach table_name in array array['weekly_training_focus','training_blocks'] loop
    if not exists (select 1 from pg_trigger where tgname=table_name || '_set_updated_at' and tgrelid=('public.' || table_name)::regclass) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
  end loop;
end
$triggers$;

alter table public.weekly_training_focus enable row level security;
alter table public.training_blocks enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='weekly_training_focus' and policyname='public weekly training focus access') then
    create policy "public weekly training focus access" on public.weekly_training_focus for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_blocks' and policyname='public training blocks access') then
    create policy "public training blocks access" on public.training_blocks for all to anon, authenticated using (true) with check (true);
  end if;
end
$policies$;

commit;

select 'MIGRATION 0022 COMPLETATA' as risultato;
