-- Estende la gestione valutativa agli esercizi esistenti.
-- Mantiene un solo mapping tecnico attivo quando cambia la sottocategoria.

begin;

create or replace function public.set_exercise_evaluation_eligibility(
  requested_exercise_id uuid,
  requested_technical_subcategory_id integer,
  requested_enabled boolean,
  requested_evidence_notes text default ''
)
returns public.exercise_evaluation_targets
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  result public.exercise_evaluation_targets%rowtype;
begin
  if not public.is_catalog_admin() then
    raise exception 'Operazione catalogo non autorizzata';
  end if;

  if not exists (
    select 1
    from public.exercises exercise
    join public.exercise_subcategories subcategory
      on subcategory.id = requested_technical_subcategory_id
    where exercise.id = requested_exercise_id
      and exercise.subcategory_id = subcategory.id
      and exercise.attivo
      and subcategory.attivo
      and subcategory.fase <> 'Generale'
  ) then
    raise exception 'Esercizio o sottocategoria tecnica non validi';
  end if;

  -- La disattivazione coinvolge tutti i target tecnici dell'esercizio.
  -- L'attivazione spegne soltanto eventuali target tecnici di altre sottocategorie.
  update public.exercise_evaluation_targets
  set attivo = false,
      updated_at = now()
  where exercise_id = requested_exercise_id
    and target_type = 'Technical'
    and (
      not requested_enabled
      or technical_subcategory_id <> requested_technical_subcategory_id
    );

  insert into public.exercise_evaluation_targets (
    exercise_id, target_type, technical_subcategory_id, physical_objective_id,
    evaluation_suitability, observability_weight, specificity_weight,
    evidence_notes, confidence, mapping_status, attivo, target_role,
    physical_feasibility, tactical_family, complexity, decision_source,
    bootstrap_version
  ) values (
    requested_exercise_id, 'Technical', requested_technical_subcategory_id, null,
    0.850, 0.850, 0.900,
    coalesce(nullif(trim(requested_evidence_notes), ''), 'Osservare la qualita del gesto tecnico.'),
    'HIGH', 'auto_approved', requested_enabled, 'PRIMARY',
    null, null, 'MEDIUM', 'manual', 1
  )
  on conflict (exercise_id, technical_subcategory_id)
    where target_type = 'Technical'
  do update set
    evaluation_suitability = excluded.evaluation_suitability,
    observability_weight = excluded.observability_weight,
    specificity_weight = excluded.specificity_weight,
    evidence_notes = excluded.evidence_notes,
    confidence = excluded.confidence,
    mapping_status = excluded.mapping_status,
    attivo = excluded.attivo,
    target_role = excluded.target_role,
    complexity = excluded.complexity,
    decision_source = 'manual',
    updated_at = now()
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_exercise_evaluation_eligibility(uuid,integer,boolean,text)
  from public, anon;
grant execute on function public.set_exercise_evaluation_eligibility(uuid,integer,boolean,text)
  to authenticated;

commit;

select 'MIGRATION 0039 PREPARATA: EXISTING EXERCISE EVALUATION ELIGIBILITY' as risultato;
