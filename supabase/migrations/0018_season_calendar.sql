-- Configurazione stagione, gare, profili, eccezioni e giornate di calendario.
-- Non elimina né rinomina strutture esistenti.

begin;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  nome_stagione text not null,
  data_inizio date not null,
  data_fine date not null,
  squadra text not null,
  numero_portieri_standard integer not null default 3 check (numero_portieri_standard > 0),
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_dates_check check (data_fine >= data_inizio)
);

create unique index if not exists seasons_single_active_idx on public.seasons (attiva) where attiva = true;

create table if not exists public.season_phases (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  tipo text not null check (tipo in ('Pre-campionato', 'Campionato')),
  data_inizio date not null,
  data_fine date not null,
  giorni_standard_allenamento smallint[] not null default '{}',
  giorni_riposo smallint[] not null default '{}',
  possibilita_doppia_seduta boolean not null default false,
  durata_standard_seduta integer not null default 60 check (durata_standard_seduta > 0),
  giorno_gara_standard smallint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, tipo),
  check (data_fine >= data_inizio),
  check (giorni_standard_allenamento <@ array[1,2,3,4,5,6,7]::smallint[]),
  check (giorni_riposo <@ array[1,2,3,4,5,6,7]::smallint[]),
  check (giorno_gara_standard is null or giorno_gara_standard between 1 and 7)
);

create table if not exists public.season_recall_periods (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  data_inizio date not null,
  data_fine date not null,
  giorni_allenamento smallint[] not null default '{}',
  giorni_riposo smallint[] not null default '{}',
  livello_incremento_carico_fisico text,
  note text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id),
  check (data_fine >= data_inizio)
);

create table if not exists public.season_training_profiles (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  nome text not null,
  match_day_offset smallint not null,
  tipo_seduta text not null,
  carico_previsto text,
  durata_standard integer check (durata_standard is null or durata_standard > 0),
  caratteristiche text[] not null default '{}',
  progressione_tecnica text[] not null default '{}',
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, match_day_offset)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('Campionato', 'Coppa', 'Amichevole', 'Torneo', 'Altro')),
  avversario text,
  casa_trasferta text check (casa_trasferta is null or casa_trasferta in ('Casa', 'Trasferta')),
  note text,
  origine text not null default 'Manuale' check (origine in ('Generata', 'Manuale')),
  bloccata boolean not null default false,
  attiva boolean not null default true,
  generation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, generation_key)
);

create table if not exists public.calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  data date not null,
  tipo_giornata text not null check (tipo_giornata in ('Allenamento', 'Gara', 'Amichevole', 'Riposo', 'Recupero', 'Allenamento extra', 'Annullato', 'Altro')),
  durata_prevista integer check (durata_prevista is null or durata_prevista > 0),
  carico_previsto text,
  numero_portieri_previsti integer check (numero_portieri_previsti is null or numero_portieri_previsti > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, data)
);

create table if not exists public.calendar_days (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  season_phase_id uuid references public.season_phases(id) on delete set null,
  data date not null,
  tipo_giornata text not null check (tipo_giornata in ('Allenamento', 'Gara', 'Amichevole', 'Riposo', 'Recupero', 'Allenamento extra', 'Annullato', 'Altro')),
  match_id uuid references public.matches(id) on delete set null,
  training_profile_id uuid references public.season_training_profiles(id) on delete set null,
  exception_id uuid references public.calendar_exceptions(id) on delete set null,
  richiamo_atletico boolean not null default false,
  match_day_offset smallint,
  match_day_relation text generated always as (
    case when match_day_offset is null then null when match_day_offset = 0 then 'MD'
      when match_day_offset < 0 then 'MD' || match_day_offset::text else 'MD+' || match_day_offset::text end
  ) stored,
  obiettivo_tecnico_principale text,
  obiettivo_tecnico_secondario text,
  physical_objective_id uuid references public.physical_objectives(id) on delete set null,
  durata_prevista integer check (durata_prevista is null or durata_prevista > 0),
  carico_previsto text,
  numero_portieri_previsti integer check (numero_portieri_previsti is null or numero_portieri_previsti > 0),
  note text,
  origine text not null default 'Generata' check (origine in ('Generata', 'Manuale', 'Eccezione')),
  bloccata boolean not null default false,
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, data)
);

alter table public.trainings add column if not exists season_id uuid references public.seasons(id) on delete set null;
alter table public.trainings add column if not exists calendar_day_id uuid references public.calendar_days(id) on delete set null;
alter table public.trainings add column if not exists season_phase_id uuid references public.season_phases(id) on delete set null;
alter table public.trainings add column if not exists session_number smallint not null default 1;
alter table public.trainings add column if not exists session_type text;
alter table public.trainings add column if not exists technical_objective_primary text;
alter table public.trainings add column if not exists technical_objective_secondary text;
alter table public.trainings add column if not exists planned_load text;
alter table public.trainings add column if not exists match_day_offset smallint;
alter table public.trainings add column if not exists athletic_recall boolean not null default false;
alter table public.trainings add column if not exists generated_by_calendar boolean not null default false;
alter table public.trainings add column if not exists content_status text not null default 'compiled';

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'trainings_content_status_check' and conrelid = 'public.trainings'::regclass) then
    alter table public.trainings add constraint trainings_content_status_check check (content_status in ('empty', 'compiled', 'manual'));
  end if;
end
$constraints$;

create unique index if not exists trainings_calendar_session_idx on public.trainings (calendar_day_id, session_number) where calendar_day_id is not null;
create index if not exists calendar_days_season_date_idx on public.calendar_days (season_id, data) where attiva = true;
create index if not exists matches_season_date_idx on public.matches (season_id, data) where attiva = true;
create index if not exists calendar_exceptions_season_date_idx on public.calendar_exceptions (season_id, data);

do $triggers$
declare table_name text;
begin
  foreach table_name in array array['seasons','season_phases','season_recall_periods','season_training_profiles','matches','calendar_exceptions','calendar_days'] loop
    if not exists (select 1 from pg_trigger where tgname = table_name || '_set_updated_at' and tgrelid = ('public.' || table_name)::regclass) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
  end loop;
end
$triggers$;

do $rls$
declare table_name text; policy_name text;
begin
  foreach table_name in array array['seasons','season_phases','season_recall_periods','season_training_profiles','matches','calendar_exceptions','calendar_days'] loop
    execute format('alter table public.%I enable row level security', table_name);
    policy_name := 'public ' || replace(table_name, '_', ' ') || ' access';
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = policy_name) then
      execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', policy_name, table_name);
    end if;
  end loop;
end
$rls$;

commit;

select 'MIGRATION 0018 COMPLETATA' as risultato;
