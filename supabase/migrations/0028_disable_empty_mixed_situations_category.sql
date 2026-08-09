-- Rimuove dal catalogo attivo la categoria storica vuota senza cancellare
-- eventuali riferimenti conservati in valutazioni o sedute esistenti.
do $$
declare
  target_category_id integer;
begin
  select id
    into target_category_id
  from public.exercise_categories
  where lower(trim(nome)) = lower('Situazioni miste / combo tuffi')
  limit 1;

  if target_category_id is null then
    return;
  end if;

  if exists (
    select 1
    from public.exercises
    where category_id = target_category_id
      and attivo = true
  ) then
    raise exception
      'La categoria Situazioni miste / combo tuffi contiene ancora esercizi attivi e non può essere rimossa';
  end if;

  update public.exercise_subcategories
  set attivo = false
  where category_id = target_category_id
    and attivo = true;

  update public.exercise_categories
  set attivo = false
  where id = target_category_id
    and attivo = true;
end $$;
