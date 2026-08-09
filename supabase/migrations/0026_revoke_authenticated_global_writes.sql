-- Hardening finale dei cataloghi globali di sola lettura.
-- Non modifica policy RLS, ownership, RPC o Storage.

begin;

revoke insert, update, delete
on table
  public.exercise_categories,
  public.exercise_subcategories,
  public.physical_objectives,
  public.physical_assessment_dimensions,
  public.physical_assessment_dimension_objectives
from authenticated;

commit;

select 'MIGRATION 0026 COMPLETATA: PRIVILEGI DI SCRITTURA GLOBALI REVOCATI' as risultato;
