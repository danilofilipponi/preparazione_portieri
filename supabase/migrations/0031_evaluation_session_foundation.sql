-- Fondazione Seduta di Valutazione.
-- Conservativa: non modifica catalogo, Tactical Board o generatore sedute.
-- I mapping dell'audit DEV non vengono inseriti automaticamente.

begin;

-- Le chiavi composite permettono di verificare ownership e appartenenza
-- interamente tramite foreign key, senza affidarsi soltanto alla RLS.
create unique index if not exists trainings_id_owner_unique
  on public.trainings(id, owner_id);
create unique index if not exists goalkeepers_id_owner_unique
  on public.goalkeepers(id, owner_id);
create unique index if not exists training_exercises_id_training_owner_unique
  on public.training_exercises(id, training_id, owner_id);

create table if not exists public.evaluation_scales (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  version integer not null check (version > 0),
  minimum_score integer not null,
  maximum_score integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_scales_range_check check (minimum_score < maximum_score),
  constraint evaluation_scales_code_version_unique unique(code, version)
);

create table if not exists public.evaluation_scale_levels (
  id uuid primary key default gen_random_uuid(),
  scale_id uuid not null references public.evaluation_scales(id) on delete restrict,
  score integer not null,
  label text not null,
  description text not null default '',
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  constraint evaluation_scale_levels_scale_score_unique unique(scale_id, score),
  constraint evaluation_scale_levels_scale_order_unique unique(scale_id, display_order)
);

create table if not exists public.exercise_evaluation_targets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  target_type text not null check (target_type in ('Technical','Physical')),
  technical_subcategory_id integer references public.exercise_subcategories(id) on delete restrict,
  physical_objective_id uuid references public.physical_objectives(id) on delete restrict,
  evaluation_suitability numeric(4,3) not null check (evaluation_suitability between 0 and 1),
  observability_weight numeric(4,3) not null check (observability_weight between 0 and 1),
  specificity_weight numeric(4,3) not null check (specificity_weight between 0 and 1),
  evidence_notes text not null default '',
  confidence text not null check (confidence in ('HIGH','MEDIUM','LOW')),
  mapping_status text not null default 'needs_review'
    check (mapping_status in ('auto_approved','needs_review','rejected')),
  attivo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_evaluation_targets_xor_check check (
    (target_type = 'Technical' and technical_subcategory_id is not null and physical_objective_id is null)
    or
    (target_type = 'Physical' and technical_subcategory_id is null and physical_objective_id is not null)
  ),
  constraint exercise_evaluation_targets_active_status_check check (
    not attivo or mapping_status = 'auto_approved'
  )
);

create unique index if not exists exercise_evaluation_targets_technical_unique
  on public.exercise_evaluation_targets(exercise_id, technical_subcategory_id)
  where target_type = 'Technical';
create unique index if not exists exercise_evaluation_targets_physical_unique
  on public.exercise_evaluation_targets(exercise_id, physical_objective_id)
  where target_type = 'Physical';
create index if not exists exercise_evaluation_targets_active_idx
  on public.exercise_evaluation_targets(target_type, attivo, mapping_status);

create table if not exists public.evaluation_sessions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null,
  goalkeeper_id uuid not null,
  evaluation_type text not null check (evaluation_type in ('Complete','Targeted','Reassessment')),
  previous_evaluation_session_id uuid,
  status text not null default 'Draft'
    check (status in ('Draft','Ready','InProgress','Completed','Cancelled')),
  scale_id uuid not null references public.evaluation_scales(id) on delete restrict,
  minimum_observations smallint not null default 2 check (minimum_observations > 0),
  minimum_distinct_exercises smallint not null default 2 check (minimum_distinct_exercises > 0),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_sessions_training_unique unique(training_id),
  constraint evaluation_sessions_timestamps_check check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint evaluation_sessions_training_owner_fk
    foreign key (training_id, owner_id) references public.trainings(id, owner_id) on delete cascade,
  constraint evaluation_sessions_goalkeeper_owner_fk
    foreign key (goalkeeper_id, owner_id) references public.goalkeepers(id, owner_id) on delete restrict
);

create unique index if not exists evaluation_sessions_id_owner_unique
  on public.evaluation_sessions(id, owner_id);
create unique index if not exists evaluation_sessions_id_training_owner_unique
  on public.evaluation_sessions(id, training_id, owner_id);
alter table public.evaluation_sessions
  add constraint evaluation_sessions_previous_owner_fk
  foreign key (previous_evaluation_session_id, owner_id)
  references public.evaluation_sessions(id, owner_id) on delete restrict;

create table if not exists public.evaluation_session_targets (
  id uuid primary key default gen_random_uuid(),
  evaluation_session_id uuid not null,
  target_type text not null check (target_type in ('Technical','Physical')),
  technical_subcategory_id integer references public.exercise_subcategories(id) on delete restrict,
  physical_objective_id uuid references public.physical_objectives(id) on delete restrict,
  priority smallint not null default 3 check (priority between 1 and 5),
  required_observations smallint not null default 2 check (required_observations > 0),
  required_distinct_exercises smallint not null default 2 check (required_distinct_exercises > 0),
  source text not null check (source in ('manual','deficit','previous_evaluation','complete_profile')),
  parameter_name_snapshot text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_session_targets_xor_check check (
    (target_type = 'Technical' and technical_subcategory_id is not null and physical_objective_id is null)
    or
    (target_type = 'Physical' and technical_subcategory_id is null and physical_objective_id is not null)
  ),
  constraint evaluation_session_targets_session_owner_fk
    foreign key (evaluation_session_id, owner_id)
    references public.evaluation_sessions(id, owner_id) on delete cascade
);

create unique index if not exists evaluation_session_targets_id_session_owner_unique
  on public.evaluation_session_targets(id, evaluation_session_id, owner_id);
create unique index if not exists evaluation_session_targets_technical_unique
  on public.evaluation_session_targets(evaluation_session_id, technical_subcategory_id)
  where target_type = 'Technical';
create unique index if not exists evaluation_session_targets_physical_unique
  on public.evaluation_session_targets(evaluation_session_id, physical_objective_id)
  where target_type = 'Physical';

create table if not exists public.evaluation_exercise_targets (
  id uuid primary key default gen_random_uuid(),
  evaluation_session_id uuid not null,
  training_id uuid not null,
  training_exercise_id uuid not null,
  session_target_id uuid not null,
  observability_weight numeric(4,3) not null check (observability_weight between 0 and 1),
  selection_weight numeric(4,3) not null check (selection_weight between 0 and 1),
  planned_observations smallint not null default 1 check (planned_observations > 0),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_exercise_targets_session_training_owner_fk
    foreign key (evaluation_session_id, training_id, owner_id)
    references public.evaluation_sessions(id, training_id, owner_id) on delete cascade,
  constraint evaluation_exercise_targets_training_exercise_owner_fk
    foreign key (training_exercise_id, training_id, owner_id)
    references public.training_exercises(id, training_id, owner_id) on delete cascade,
  constraint evaluation_exercise_targets_session_target_owner_fk
    foreign key (session_target_id, evaluation_session_id, owner_id)
    references public.evaluation_session_targets(id, evaluation_session_id, owner_id) on delete cascade,
  constraint evaluation_exercise_targets_unique
    unique(evaluation_session_id, training_exercise_id, session_target_id)
);

create unique index if not exists evaluation_exercise_targets_id_owner_unique
  on public.evaluation_exercise_targets(id, owner_id);

create table if not exists public.evaluation_observations (
  id uuid primary key default gen_random_uuid(),
  evaluation_exercise_target_id uuid not null,
  observation_number integer not null check (observation_number > 0),
  score integer not null,
  notes text,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint evaluation_observations_exercise_target_owner_fk
    foreign key (evaluation_exercise_target_id, owner_id)
    references public.evaluation_exercise_targets(id, owner_id) on delete cascade,
  constraint evaluation_observations_sequence_unique
    unique(evaluation_exercise_target_id, observation_number)
);

create index if not exists evaluation_sessions_owner_status_idx
  on public.evaluation_sessions(owner_id, status, created_at desc);
create index if not exists evaluation_session_targets_session_idx
  on public.evaluation_session_targets(evaluation_session_id);
create index if not exists evaluation_exercise_targets_session_idx
  on public.evaluation_exercise_targets(evaluation_session_id, training_exercise_id);
create index if not exists evaluation_observations_target_idx
  on public.evaluation_observations(evaluation_exercise_target_id, observed_at);

-- La scala è versionata e gestita come dato globale.
insert into public.evaluation_scales(code, name, version, minimum_score, maximum_score, active)
values ('GOALKEEPER_LEVEL', 'Scala valutativa portiere', 1, 1, 5, true)
on conflict (code, version) do update set
  name = excluded.name,
  minimum_score = excluded.minimum_score,
  maximum_score = excluded.maximum_score,
  active = excluded.active;

insert into public.evaluation_scale_levels(scale_id, score, label, description, display_order)
select scale.id, level.score, level.label, level.description, level.score
from public.evaluation_scales scale
cross join (values
  (1, 'Grave carenza', 'Prestazione significativamente inferiore al livello richiesto.'),
  (2, 'Sotto livello', 'Parametro ancora sotto il livello adeguato.'),
  (3, 'Adeguato', 'Prestazione coerente con il livello minimo atteso.'),
  (4, 'Buono', 'Parametro espresso con qualità e continuità.'),
  (5, 'Punto di forza', 'Parametro distintivo, stabile e trasferibile alla gara.')
) as level(score, label, description)
where scale.code = 'GOALKEEPER_LEVEL' and scale.version = 1
on conflict (scale_id, score) do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order;

-- Valida il voto contro i livelli della scala realmente collegata alla sessione.
create or replace function public.validate_evaluation_observation_score()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare requested_scale_id uuid;
begin
  select session.scale_id into requested_scale_id
  from public.evaluation_exercise_targets exercise_target
  join public.evaluation_sessions session
    on session.id = exercise_target.evaluation_session_id
   and session.owner_id = exercise_target.owner_id
  where exercise_target.id = new.evaluation_exercise_target_id
    and exercise_target.owner_id = new.owner_id;

  if requested_scale_id is null then
    raise exception 'Target valutativo non valido per il proprietario';
  end if;
  if not exists (
    select 1 from public.evaluation_scale_levels
    where scale_id = requested_scale_id and score = new.score
  ) then
    raise exception 'Score % non previsto dalla scala della seduta', new.score;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_evaluation_observation_score() from public, anon, authenticated;

drop trigger if exists evaluation_observations_validate_score on public.evaluation_observations;
create trigger evaluation_observations_validate_score
before insert on public.evaluation_observations
for each row execute function public.validate_evaluation_observation_score();

do $updated_at_triggers$
declare table_name text;
begin
  foreach table_name in array array[
    'evaluation_scales','exercise_evaluation_targets','evaluation_sessions',
    'evaluation_session_targets','evaluation_exercise_targets'
  ] loop
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
$updated_at_triggers$;

do $rls$
declare table_name text;
begin
  foreach table_name in array array[
    'evaluation_scales','evaluation_scale_levels','exercise_evaluation_targets',
    'evaluation_sessions','evaluation_session_targets','evaluation_exercise_targets',
    'evaluation_observations'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$rls$;

-- Globali: lettura authenticated, scrittura soltanto catalog admin.
create policy evaluation_scales_authenticated_read
  on public.evaluation_scales for select to authenticated using (true);
create policy evaluation_scales_catalog_admin_write
  on public.evaluation_scales for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());
create policy evaluation_scale_levels_authenticated_read
  on public.evaluation_scale_levels for select to authenticated using (true);
create policy evaluation_scale_levels_catalog_admin_write
  on public.evaluation_scale_levels for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());
create policy exercise_evaluation_targets_authenticated_read
  on public.exercise_evaluation_targets for select to authenticated using (true);
create policy exercise_evaluation_targets_catalog_admin_write
  on public.exercise_evaluation_targets for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

-- Personali: proprietario soltanto. Le osservazioni sono append-only.
create policy evaluation_sessions_owner_access
  on public.evaluation_sessions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy evaluation_session_targets_owner_access
  on public.evaluation_session_targets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy evaluation_exercise_targets_owner_access
  on public.evaluation_exercise_targets for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy evaluation_observations_owner_read
  on public.evaluation_observations for select to authenticated
  using (owner_id = auth.uid());
create policy evaluation_observations_owner_insert
  on public.evaluation_observations for insert to authenticated
  with check (owner_id = auth.uid());

revoke all on table public.evaluation_scales,
  public.evaluation_scale_levels,
  public.exercise_evaluation_targets,
  public.evaluation_sessions,
  public.evaluation_session_targets,
  public.evaluation_exercise_targets,
  public.evaluation_observations from anon;

grant select on public.evaluation_scales,
  public.evaluation_scale_levels,
  public.exercise_evaluation_targets to authenticated;
grant insert, update, delete on public.evaluation_scales,
  public.evaluation_scale_levels,
  public.exercise_evaluation_targets to authenticated;
grant select, insert, update, delete on public.evaluation_sessions,
  public.evaluation_session_targets,
  public.evaluation_exercise_targets to authenticated;
grant select, insert on public.evaluation_observations to authenticated;
revoke update, delete on public.evaluation_observations from authenticated;

commit;

select 'MIGRATION 0031 PREPARATA: FONDAZIONE SEDUTA DI VALUTAZIONE' as risultato;
