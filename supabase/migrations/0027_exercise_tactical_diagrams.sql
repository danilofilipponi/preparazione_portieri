-- Schema tattico dinamico degli esercizi.
-- Non modifica RLS, ownership, RPC o Storage: eredita i permessi di public.exercises.

begin;

alter table public.exercises
  add column if not exists tactical_diagram jsonb,
  add column if not exists diagram_source text,
  add column if not exists diagram_updated_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exercises_diagram_source_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises add constraint exercises_diagram_source_check
      check (diagram_source is null or diagram_source in ('automatic', 'manual', 'automatic_edited'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exercises_tactical_diagram_shape_check'
      and conrelid = 'public.exercises'::regclass
  ) then
    alter table public.exercises add constraint exercises_tactical_diagram_shape_check
      check (
        tactical_diagram is null or (
          jsonb_typeof(tactical_diagram) = 'object'
          and jsonb_typeof(tactical_diagram -> 'canvas') = 'object'
          and jsonb_typeof(tactical_diagram -> 'elements') = 'array'
          and jsonb_typeof(tactical_diagram -> 'actions') = 'array'
        )
      );
  end if;
end
$constraints$;

comment on column public.exercises.tactical_diagram is
  'Schema tattico SVG: canvas, elementi e azioni con coordinate percentuali.';
comment on column public.exercises.diagram_source is
  'Origine dello schema: automatic, manual o automatic_edited.';
comment on column public.exercises.diagram_updated_at is
  'Data dell’ultima generazione o modifica dello schema tattico.';

commit;
