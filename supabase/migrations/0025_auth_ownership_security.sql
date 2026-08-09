-- Auth, ownership e RLS production-safe.
-- Backfill autorizzato per l'account preparatore verificato prima di ogni modifica.

begin;

do $verify_owner$
begin
  if not exists (
    select 1 from auth.users
    where id = 'd585816b-1894-44b8-8b96-b9152bce6561'::uuid
  ) then
    raise exception 'Backfill annullato: UUID preparatore non presente in auth.users';
  end if;
end
$verify_owner$;

create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() = 'd585816b-1894-44b8-8b96-b9152bce6561'::uuid;
$$;
revoke all on function public.is_catalog_admin() from public, anon;
grant execute on function public.is_catalog_admin() to authenticated;

do $ownership$
declare
  table_name text;
  personal_tables text[] := array[
    'app_settings', 'goalkeepers', 'goalkeeper_assessments',
    'goalkeeper_assessment_items', 'seasons', 'season_phases',
    'season_recall_periods', 'season_training_profiles', 'matches',
    'calendar_exceptions', 'calendar_days', 'trainings',
    'training_objectives', 'training_exercises', 'training_goalkeepers',
    'training_exercise_goalkeeper_variants', 'weekly_training_focus',
    'training_blocks', 'training_exercise_changes'
  ];
begin
  foreach table_name in array personal_tables loop
    execute format(
      'alter table public.%I add column if not exists owner_id uuid references auth.users(id) on delete cascade default auth.uid()',
      table_name
    );
    execute format(
      'update public.%I set owner_id = $1 where owner_id is null',
      table_name
    ) using 'd585816b-1894-44b8-8b96-b9152bce6561'::uuid;
    execute format('alter table public.%I alter column owner_id set default auth.uid()', table_name);
    execute format('alter table public.%I alter column owner_id set not null', table_name);
    execute format('create index if not exists %I on public.%I(owner_id)', table_name || '_owner_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$ownership$;

create unique index if not exists app_settings_one_per_owner_idx
  on public.app_settings(owner_id);

-- Rimuove tutte le policy permissive precedenti dalle tabelle gestite dall'app.
do $drop_public_policies$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'exercises','exercise_categories','exercise_subcategories',
        'physical_objectives','exercise_physical_objectives',
        'physical_assessment_dimensions','physical_assessment_dimension_objectives',
        'app_settings','goalkeepers','goalkeeper_assessments',
        'goalkeeper_assessment_items','seasons','season_phases',
        'season_recall_periods','season_training_profiles','matches',
        'calendar_exceptions','calendar_days','trainings','training_objectives',
        'training_exercises','training_goalkeepers',
        'training_exercise_goalkeeper_variants','weekly_training_focus',
        'training_blocks','training_exercise_changes'
      ])
  loop
    execute format('drop policy %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end
$drop_public_policies$;

-- Cataloghi globali: lettura per authenticated; modifica solo per il curatore autorizzato.
do $global_policies$
declare table_name text;
begin
  foreach table_name in array array[
    'exercises','exercise_categories','exercise_subcategories',
    'physical_objectives','exercise_physical_objectives',
    'physical_assessment_dimensions','physical_assessment_dimension_objectives'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_authenticated_read', table_name
    );
  end loop;

  create policy exercises_catalog_admin_write
    on public.exercises for all to authenticated
    using (public.is_catalog_admin()) with check (public.is_catalog_admin());
  create policy exercise_physical_objectives_catalog_admin_write
    on public.exercise_physical_objectives for all to authenticated
    using (public.is_catalog_admin()) with check (public.is_catalog_admin());
end
$global_policies$;

-- Dati personali: ogni riga è visibile e modificabile solo dal proprietario.
do $personal_policies$
declare table_name text;
begin
  foreach table_name in array array[
    'app_settings','goalkeepers','goalkeeper_assessments',
    'goalkeeper_assessment_items','seasons','season_phases',
    'season_recall_periods','season_training_profiles','matches',
    'calendar_exceptions','calendar_days','trainings','training_objectives',
    'training_exercises','training_goalkeepers',
    'training_exercise_goalkeeper_variants','weekly_training_focus',
    'training_blocks','training_exercise_changes'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      table_name || '_owner_access', table_name
    );
  end loop;
end
$personal_policies$;

-- Nessun accesso anonimo alle tabelle applicative.
do $table_grants$
declare table_name text;
begin
  foreach table_name in array array[
    'exercises','exercise_categories','exercise_subcategories',
    'physical_objectives','exercise_physical_objectives',
    'physical_assessment_dimensions','physical_assessment_dimension_objectives',
    'app_settings','goalkeepers','goalkeeper_assessments',
    'goalkeeper_assessment_items','seasons','season_phases',
    'season_recall_periods','season_training_profiles','matches',
    'calendar_exceptions','calendar_days','trainings','training_objectives',
    'training_exercises','training_goalkeepers',
    'training_exercise_goalkeeper_variants','weekly_training_focus',
    'training_blocks','training_exercise_changes'
  ] loop
    execute format('revoke all on table public.%I from anon', table_name);
  end loop;

  grant select on public.exercises, public.exercise_categories,
    public.exercise_subcategories, public.physical_objectives,
    public.exercise_physical_objectives, public.physical_assessment_dimensions,
    public.physical_assessment_dimension_objectives to authenticated;
  grant insert, update, delete on public.exercises,
    public.exercise_physical_objectives to authenticated;
  grant select, insert, update, delete on public.app_settings, public.goalkeepers,
    public.goalkeeper_assessments, public.goalkeeper_assessment_items,
    public.seasons, public.season_phases, public.season_recall_periods,
    public.season_training_profiles, public.matches, public.calendar_exceptions,
    public.calendar_days, public.trainings, public.training_objectives,
    public.training_exercises, public.training_goalkeepers,
    public.training_exercise_goalkeeper_variants, public.weekly_training_focus,
    public.training_blocks, public.training_exercise_changes to authenticated;
end
$table_grants$;

-- Le viste devono rispettare la RLS delle tabelle sottostanti.
alter view if exists public.training_category_usage set (security_invoker = true);
revoke all on public.training_category_usage from anon;
grant select on public.training_category_usage to authenticated;

-- Storage: il bucket resta pubblico in lettura; scrittura riservata al curatore autenticato.
insert into storage.buckets(id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public exercise images read" on storage.objects;
drop policy if exists "public exercise images upload" on storage.objects;
drop policy if exists "public exercise images update" on storage.objects;
drop policy if exists "public exercise images delete" on storage.objects;

create policy "exercise images public read"
  on storage.objects for select to public
  using (bucket_id = 'exercise-images');
create policy "exercise images authenticated upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-images' and public.is_catalog_admin());
create policy "exercise images authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'exercise-images' and public.is_catalog_admin())
  with check (bucket_id = 'exercise-images' and public.is_catalog_admin());
create policy "exercise images authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-images' and public.is_catalog_admin());

-- RPC: wrapper con controllo esplicito dell'identità e revoca completa ad anon/public.
alter function public.set_exercise_physical_objective(uuid,uuid,text,integer,text,boolean)
  rename to set_exercise_physical_objective_authorized_internal;
create function public.set_exercise_physical_objective(
  requested_exercise_id uuid, requested_physical_objective_id uuid,
  requested_role text, requested_weight integer, requested_reason text,
  requested_active boolean default true
)
returns public.exercise_physical_objectives
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_catalog_admin() then raise exception 'Operazione catalogo non autorizzata'; end if;
  return public.set_exercise_physical_objective_authorized_internal(
    requested_exercise_id, requested_physical_objective_id, requested_role,
    requested_weight, requested_reason, requested_active
  );
end $$;

alter function public.preview_season_agenda(uuid)
  rename to preview_season_agenda_authorized_internal;
create function public.preview_season_agenda(requested_season_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not exists(select 1 from public.seasons where id=requested_season_id and owner_id=auth.uid()) then
    raise exception 'Stagione non autorizzata';
  end if;
  return public.preview_season_agenda_authorized_internal(requested_season_id);
end $$;

alter function public.generate_season_agenda(uuid)
  rename to generate_season_agenda_authorized_internal;
create function public.generate_season_agenda(requested_season_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists(select 1 from public.seasons where id=requested_season_id and owner_id=auth.uid()) then
    raise exception 'Stagione non autorizzata';
  end if;
  return public.generate_season_agenda_authorized_internal(requested_season_id);
end $$;

alter function public.create_goalkeeper_assessment(uuid,date,text,jsonb)
  rename to create_goalkeeper_assessment_authorized_internal;
create function public.create_goalkeeper_assessment(
  requested_goalkeeper_id uuid, requested_assessment_date date,
  requested_general_notes text, requested_items jsonb
)
returns uuid language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists(select 1 from public.goalkeepers where id=requested_goalkeeper_id and owner_id=auth.uid()) then
    raise exception 'Portiere non autorizzato';
  end if;
  return public.create_goalkeeper_assessment_authorized_internal(
    requested_goalkeeper_id, requested_assessment_date,
    requested_general_notes, requested_items
  );
end $$;

alter function public.replace_generated_training_exercises(uuid,jsonb)
  rename to replace_generated_training_exercises_authorized_internal;
create function public.replace_generated_training_exercises(requested_training_id uuid, requested_items jsonb)
returns integer language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists(select 1 from public.trainings where id=requested_training_id and owner_id=auth.uid()) then
    raise exception 'Seduta non autorizzata';
  end if;
  return public.replace_generated_training_exercises_authorized_internal(requested_training_id, requested_items);
end $$;

revoke all on function public.set_exercise_physical_objective_authorized_internal(uuid,uuid,text,integer,text,boolean) from public, anon, authenticated;
revoke all on function public.preview_season_agenda_authorized_internal(uuid) from public, anon, authenticated;
revoke all on function public.generate_season_agenda_authorized_internal(uuid) from public, anon, authenticated;
revoke all on function public.create_goalkeeper_assessment_authorized_internal(uuid,date,text,jsonb) from public, anon, authenticated;
revoke all on function public.replace_generated_training_exercises_authorized_internal(uuid,jsonb) from public, anon, authenticated;

revoke all on function public.set_exercise_physical_objective(uuid,uuid,text,integer,text,boolean) from public, anon;
revoke all on function public.preview_season_agenda(uuid) from public, anon;
revoke all on function public.generate_season_agenda(uuid) from public, anon;
revoke all on function public.create_goalkeeper_assessment(uuid,date,text,jsonb) from public, anon;
revoke all on function public.replace_generated_training_exercises(uuid,jsonb) from public, anon;
revoke all on function public.get_exercises_by_physical_objective(uuid) from public, anon;

grant execute on function public.set_exercise_physical_objective(uuid,uuid,text,integer,text,boolean) to authenticated;
grant execute on function public.preview_season_agenda(uuid) to authenticated;
grant execute on function public.generate_season_agenda(uuid) to authenticated;
grant execute on function public.create_goalkeeper_assessment(uuid,date,text,jsonb) to authenticated;
grant execute on function public.replace_generated_training_exercises(uuid,jsonb) to authenticated;
grant execute on function public.get_exercises_by_physical_objective(uuid) to authenticated;

commit;

select 'MIGRATION 0025 COMPLETATA: AUTH, OWNERSHIP, RLS E STORAGE PROTETTI' as risultato;
