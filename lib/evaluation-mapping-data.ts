import { supabase } from "./supabase";
import type { PersistedEvaluationMappingRow } from "./evaluation-production";

const PAGE_SIZE = 1000;
const EVALUATION_MAPPING_COLUMNS = "id,exercise_id,target_type,technical_subcategory_id,physical_objective_id,evaluation_suitability,observability_weight,specificity_weight,evidence_notes,confidence,mapping_status,attivo,target_role,physical_feasibility,tactical_family,complexity,decision_source";

export async function loadAllEvaluationMappings() {
  if (!supabase) return { data: [] as PersistedEvaluationMappingRow[], error: null };

  const rows: PersistedEvaluationMappingRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("exercise_evaluation_targets")
      .select(EVALUATION_MAPPING_COLUMNS)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: [] as PersistedEvaluationMappingRow[], error };

    const page = (data ?? []) as PersistedEvaluationMappingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
