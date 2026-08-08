-- FASE A — compatibilità strutturale con MASTER_catalogo_portieri_completo.xlsx.
-- Non importa esercizi, non rinomina categorie e non elimina dati esistenti.

begin;

-- Match Simulation usa valori come "4+": numero_azioni deve rimanere testuale.
alter table public.exercises
  add column if not exists scenario_gara text;

alter table public.exercises
  add column if not exists numero_azioni text;

-- Il MASTER introduce due livelli intermedi di intensità.
alter table public.exercises
  drop constraint if exists exercises_intensita_check;

alter table public.exercises
  add constraint exercises_intensita_check
  check (intensita in ('Bassa', 'Bassa-Media', 'Media', 'Media-Alta', 'Alta'));

-- Il MASTER usa una scala di difficoltà da 1 a 5.
alter table public.exercises
  drop constraint if exists exercises_difficolta_check;

alter table public.exercises
  add constraint exercises_difficolta_check
  check (difficolta between 1 and 5);

-- Fasi metodologiche complete del MASTER.
alter table public.exercises
  drop constraint if exists exercises_fase_check;

alter table public.exercises
  add constraint exercises_fase_check
  check (fase in (
    'Analitico',
    'Disturbo',
    'Situazionale',
    'Integrato guidato',
    'Integrato variabile',
    'Situazionale complesso',
    'Scenario aperto'
  ));

-- Mantiene "Generale" per compatibilità con le sottocategorie storiche.
alter table public.exercise_subcategories
  drop constraint if exists exercise_subcategories_fase_check;

alter table public.exercise_subcategories
  add constraint exercise_subcategories_fase_check
  check (fase in (
    'Analitico',
    'Disturbo',
    'Situazionale',
    'Integrato guidato',
    'Integrato variabile',
    'Situazionale complesso',
    'Scenario aperto',
    'Generale'
  ));

-- La stessa sottocategoria può comparire in fasi diverse.
-- Il controllo evita che il nuovo vincolo fallisca a metà migration.
do $phase_a_check$
begin
  if exists (
    select 1
    from public.exercise_subcategories
    group by category_id, nome, fase
    having count(*) > 1
  ) then
    raise exception 'FASE A annullata: esistono sottocategorie duplicate per categoria, nome e fase.';
  end if;
end
$phase_a_check$;

alter table public.exercise_subcategories
  drop constraint if exists exercise_subcategories_category_id_nome_key;

do $phase_a_unique$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_subcategories_category_name_phase_key'
      and conrelid = 'public.exercise_subcategories'::regclass
  ) then
    alter table public.exercise_subcategories
      add constraint exercise_subcategories_category_name_phase_key
      unique (category_id, nome, fase);
  end if;
end
$phase_a_unique$;

-- I nuovi record della tassonomia riceveranno un ID senza modificare quelli attuali.
create sequence if not exists public.exercise_subcategories_id_seq;

alter sequence public.exercise_subcategories_id_seq
  owned by public.exercise_subcategories.id;

select setval(
  'public.exercise_subcategories_id_seq',
  greatest(coalesce((select max(id) from public.exercise_subcategories), 1), 1),
  true
);

alter table public.exercise_subcategories
  alter column id set default nextval('public.exercise_subcategories_id_seq');

comment on column public.exercises.scenario_gara is
  'Scenario specifico degli esercizi Match Simulation.';

comment on column public.exercises.numero_azioni is
  'Numero o intervallo di azioni Match Simulation; testo per supportare valori come 4+.';

commit;

-- Riepilogo visibile nel pannello Results di Supabase.
select
  'FASE A COMPLETATA' as risultato,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercises' and column_name = 'scenario_gara'
  ) as scenario_gara_pronto,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercises' and column_name = 'numero_azioni'
  ) as numero_azioni_pronto;
