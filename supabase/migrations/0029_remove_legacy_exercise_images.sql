begin;

do $$
declare
  total_exercises integer;
  diagrams_present integer;
  sources_present integer;
  schema_images integer;
  photos integer;
begin
  select
    count(*),
    count(*) filter (where tactical_diagram is not null),
    count(*) filter (where diagram_source is not null),
    count(*) filter (where schema_url is not null),
    count(*) filter (where foto_url is not null)
  into total_exercises, diagrams_present, sources_present, schema_images, photos
  from public.exercises;

  if total_exercises <> 468
     or diagrams_present <> 468
     or sources_present <> 468
     or schema_images <> 36
     or photos <> 17 then
    raise exception
      'Legacy image removal blocked: total %, tactical_diagram %, diagram_source %, schema_url %, foto_url %',
      total_exercises, diagrams_present, sources_present, schema_images, photos;
  end if;
end
$$;

alter table public.exercises
  drop column if exists schema_url,
  drop column if exists foto_url,
  drop column if exists immagine_url;

commit;
