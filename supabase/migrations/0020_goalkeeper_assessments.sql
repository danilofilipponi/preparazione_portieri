-- Modulo Valutazione Portieri.
-- Migrazione conservativa: non modifica e non elimina catalogo, sedute o valutazioni esistenti.

begin;

create table if not exists public.goalkeepers (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text not null,
  data_nascita date,
  attivo boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.physical_assessment_dimensions (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique,
  nome text not null unique,
  descrizione text not null default '',
  ordine integer not null check (ordine > 0),
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.physical_assessment_dimension_objectives (
  physical_dimension_id uuid not null references public.physical_assessment_dimensions(id) on delete restrict,
  physical_objective_id uuid not null references public.physical_objectives(id) on delete restrict,
  peso numeric(3,2) not null default 1 check (peso > 0 and peso <= 1),
  primary key (physical_dimension_id, physical_objective_id)
);

create table if not exists public.goalkeeper_assessments (
  id uuid primary key default gen_random_uuid(),
  goalkeeper_id uuid not null references public.goalkeepers(id) on delete restrict,
  data_valutazione date not null,
  note_generali text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goalkeeper_assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.goalkeeper_assessments(id) on delete cascade,
  tipo text not null check (tipo in ('Tecnica', 'Fisica')),
  exercise_category_id integer references public.exercise_categories(id) on delete restrict,
  physical_dimension_id uuid references public.physical_assessment_dimensions(id) on delete restrict,
  score numeric(3,1) not null check (score >= 0 and score <= 10),
  nota text,
  created_at timestamptz not null default now(),
  constraint goalkeeper_assessment_item_target_check check (
    (tipo = 'Tecnica' and exercise_category_id is not null and physical_dimension_id is null)
    or
    (tipo = 'Fisica' and exercise_category_id is null and physical_dimension_id is not null)
  )
);

create unique index if not exists goalkeeper_assessment_technical_item_idx
  on public.goalkeeper_assessment_items (assessment_id, exercise_category_id)
  where tipo = 'Tecnica';
create unique index if not exists goalkeeper_assessment_physical_item_idx
  on public.goalkeeper_assessment_items (assessment_id, physical_dimension_id)
  where tipo = 'Fisica';
create index if not exists goalkeeper_assessments_history_idx
  on public.goalkeeper_assessments (goalkeeper_id, data_valutazione desc, created_at desc);
create index if not exists goalkeeper_assessment_items_assessment_idx
  on public.goalkeeper_assessment_items (assessment_id);

create table if not exists public.training_goalkeepers (
  training_id uuid not null references public.trainings(id) on delete cascade,
  goalkeeper_id uuid not null references public.goalkeepers(id) on delete restrict,
  individual_focus text,
  created_at timestamptz not null default now(),
  primary key (training_id, goalkeeper_id)
);

create table if not exists public.training_exercise_goalkeeper_variants (
  training_exercise_id uuid not null references public.training_exercises(id) on delete cascade,
  goalkeeper_id uuid not null references public.goalkeepers(id) on delete restrict,
  variante_individuale text,
  difficolta_delta smallint check (difficolta_delta between -2 and 2),
  note text,
  created_at timestamptz not null default now(),
  primary key (training_exercise_id, goalkeeper_id)
);

do $triggers$
declare table_name text;
begin
  foreach table_name in array array['goalkeepers','physical_assessment_dimensions','goalkeeper_assessments'] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = table_name || '_set_updated_at'
        and tgrelid = ('public.' || table_name)::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        table_name || '_set_updated_at', table_name
      );
    end if;
  end loop;
end
$triggers$;

alter table public.goalkeepers enable row level security;
alter table public.physical_assessment_dimensions enable row level security;
alter table public.physical_assessment_dimension_objectives enable row level security;
alter table public.goalkeeper_assessments enable row level security;
alter table public.goalkeeper_assessment_items enable row level security;
alter table public.training_goalkeepers enable row level security;
alter table public.training_exercise_goalkeeper_variants enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goalkeepers' and policyname='public goalkeepers access') then
    create policy "public goalkeepers access" on public.goalkeepers for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='physical_assessment_dimensions' and policyname='public physical assessment dimensions read') then
    create policy "public physical assessment dimensions read" on public.physical_assessment_dimensions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='physical_assessment_dimension_objectives' and policyname='public physical assessment mappings read') then
    create policy "public physical assessment mappings read" on public.physical_assessment_dimension_objectives for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goalkeeper_assessments' and policyname='public goalkeeper assessments read') then
    create policy "public goalkeeper assessments read" on public.goalkeeper_assessments for select to anon, authenticated using (true);
    create policy "public goalkeeper assessments insert" on public.goalkeeper_assessments for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='goalkeeper_assessment_items' and policyname='public goalkeeper assessment items read') then
    create policy "public goalkeeper assessment items read" on public.goalkeeper_assessment_items for select to anon, authenticated using (true);
    create policy "public goalkeeper assessment items insert" on public.goalkeeper_assessment_items for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_goalkeepers' and policyname='public training goalkeepers access') then
    create policy "public training goalkeepers access" on public.training_goalkeepers for all to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='training_exercise_goalkeeper_variants' and policyname='public individual variants access') then
    create policy "public individual variants access" on public.training_exercise_goalkeeper_variants for all to anon, authenticated using (true) with check (true);
  end if;
end
$policies$;

comment on table public.goalkeepers is 'Anagrafica dei portieri, disattivabili senza cancellazione fisica.';
comment on table public.goalkeeper_assessments is 'Storico immutabile delle valutazioni periodiche dei portieri.';
comment on column public.goalkeeper_assessment_items.score is 'Punteggio decimale da 0,0 a 10,0.';

commit;

select 'MIGRATION 0020 COMPLETATA' as risultato;
