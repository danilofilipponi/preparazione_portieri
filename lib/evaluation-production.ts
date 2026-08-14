import { finalDecisionForMapping } from "./complete-evaluation-design.ts";
import { buildEvaluationMappingAudit, type EvaluationMapping, type EvaluationMappingAuditReport, type ParameterCoverage } from "./evaluation-mapping-audit.ts";
import { bootstrapEvaluationMappings, createCoverageMatrix, planEvaluationSession, targetKey, type CoverageStatus, type EvaluationEngineResult, type EvaluationEngineTarget, type EvaluationMappingDecision, type SelectedEvaluationExercise } from "./evaluation-session-engine.ts";
import type { Exercise, ExerciseSubcategory, PhysicalAssessmentDimension, PhysicalObjective } from "./types.ts";

export const CORE_REQUIRED_NAMES = Object.freeze([
  "Presa alta",
  "Centralità e profondità",
  "Controllo orientato",
  "Decisione",
  "Controllo dinamico",
  "Arresto e ripartenza",
]);

export const CORE_OPTIONAL_NAMES = Object.freeze([
  "Tuffo + spostamento",
  "Riallineamento",
  "Doppio intervento",
  "1vs1 e finalizzazioni",
  "Uscite alte presa",
  "Stimolo percettivo",
  "Disturbo percettivo",
  "Reazione multidirezionale",
  "Orientamento spazio-temporale",
]);

export type PersistedEvaluationMappingRow = {
  id?: string;
  exercise_id: string;
  target_type: "Technical" | "Physical";
  technical_subcategory_id: number | null;
  physical_objective_id: string | null;
  evaluation_suitability: number | string;
  observability_weight: number | string;
  specificity_weight: number | string;
  evidence_notes: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  mapping_status: "auto_approved" | "needs_review" | "rejected";
  attivo: boolean;
  target_role?: string | null;
  physical_feasibility?: "CATALOG_EVALUABLE" | "REQUIRES_DEDICATED_PROTOCOL" | null;
  tactical_family?: EvaluationMapping["tacticalFamily"] | null;
  complexity?: EvaluationMapping["complexity"] | null;
  decision_source?: "bootstrap" | "manual";
};

export type EvaluationBootstrapRow = {
  exercise_code: string;
  target_type: "Technical" | "Physical";
  technical_subcategory_id: number | null;
  physical_objective_code: string | null;
  evaluation_suitability: number;
  observability_weight: number;
  specificity_weight: number;
  evidence_notes: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  mapping_status: "auto_approved" | "needs_review" | "rejected";
  attivo: boolean;
  target_role: string;
  physical_feasibility: "CATALOG_EVALUABLE" | "REQUIRES_DEDICATED_PROTOCOL" | null;
  tactical_family: string;
  complexity: string;
  decision_source: "bootstrap" | "manual";
  bootstrap_version: 1;
};

export type ProductionEvaluationTarget = EvaluationEngineTarget & {
  technicalSubcategoryId: number | null;
  physicalObjectiveId: string | null;
  physicalDimensionId: string | null;
  physicalDimensionName: string | null;
};

export type PhysicalDimensionResolution = {
  dimension: PhysicalAssessmentDimension;
  status: CoverageStatus;
  explanation: string;
  selectedFis: ProductionEvaluationTarget[];
  availableFis: ProductionEvaluationTarget[];
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mappingKey = (mapping: EvaluationMapping) => `${mapping.exercise.codice}|${mapping.targetName}`;
const healthRank = { STRONG: 4, ADEQUATE: 3, WEAK: 2, UNCOVERED: 1 } as const;

export function buildProductionBootstrapRows(audit: EvaluationMappingAuditReport): EvaluationBootstrapRow[] {
  const base = bootstrapEvaluationMappings(audit);
  return base.decisions.map(decision => {
    const manual = finalDecisionForMapping(decision.mapping);
    const mappingStatus = manual?.decision === "APPROVE" ? "auto_approved" : manual?.decision === "REJECT" ? "rejected" : manual?.decision === "KEEP_REVIEW" ? "needs_review" : decision.mappingStatus;
    const active = manual?.decision === "APPROVE" ? true : manual ? false : decision.active;
    return {
      exercise_code: decision.mapping.exercise.codice,
      target_type: decision.mapping.targetType === "TECHNICAL" ? "Technical" : "Physical",
      technical_subcategory_id: decision.mapping.targetType === "TECHNICAL" ? Number(decision.mapping.targetId) : null,
      physical_objective_code: decision.mapping.targetType === "PHYSICAL" ? decision.mapping.targetCode : null,
      evaluation_suitability: decision.mapping.evaluationSuitability,
      observability_weight: decision.mapping.observabilityWeight,
      specificity_weight: decision.mapping.specificityWeight,
      evidence_notes: manual ? `${decision.mapping.evidenceNotes} Revisione manuale: ${manual.reason}` : decision.mapping.evidenceNotes,
      confidence: decision.mapping.confidence,
      mapping_status: mappingStatus,
      attivo: active,
      target_role: String(decision.mapping.role),
      physical_feasibility: decision.mapping.targetType === "PHYSICAL" ? decision.mapping.physicalFeasibility ?? "CATALOG_EVALUABLE" : null,
      tactical_family: decision.mapping.tacticalFamily,
      complexity: decision.mapping.complexity,
      decision_source: manual ? "manual" : "bootstrap",
      bootstrap_version: 1,
    };
  });
}

export function createProductionBootstrap(input: { exercises: Exercise[]; subcategories: ExerciseSubcategory[]; physicalObjectives: PhysicalObjective[]; physicalDimensions: PhysicalAssessmentDimension[] }) {
  return buildProductionBootstrapRows(buildEvaluationMappingAudit(input));
}

export function hydratePersistedEvaluationMappings(rows: PersistedEvaluationMappingRow[], exercises: Exercise[], subcategories: ExerciseSubcategory[], objectives: PhysicalObjective[]): EvaluationMappingDecision[] {
  const exerciseById = new Map(exercises.map(item => [item.id, item]));
  const subcategoryById = new Map(subcategories.map(item => [item.id, item]));
  const objectiveById = new Map(objectives.map(item => [item.id, item]));
  return rows.map(row => {
    const exercise = exerciseById.get(row.exercise_id);
    const subcategory = row.technical_subcategory_id == null ? null : subcategoryById.get(row.technical_subcategory_id);
    const objective = row.physical_objective_id == null ? null : objectiveById.get(row.physical_objective_id);
    if (!exercise || (!subcategory && !objective)) return null;
    const mapping: EvaluationMapping = {
      id: row.id ?? `${row.exercise_id}:${row.target_type}:${row.technical_subcategory_id ?? row.physical_objective_id}`,
      exercise,
      targetType: row.target_type === "Technical" ? "TECHNICAL" : "PHYSICAL",
      targetId: row.target_type === "Technical" ? String(subcategory!.id) : objective!.id,
      targetCode: row.target_type === "Technical" ? `SUB-${subcategory!.id}` : objective!.codice,
      targetName: row.target_type === "Technical" ? subcategory!.nome : objective!.obiettivo_fisico,
      aggregateName: row.target_type === "Technical" ? exercise.categoria : objective!.macro_area,
      role: (row.target_role ?? (row.target_type === "Technical" ? "PRIMARY" : "Principale")) as EvaluationMapping["role"],
      evaluationSuitability: Number(row.evaluation_suitability),
      observabilityWeight: Number(row.observability_weight),
      specificityWeight: Number(row.specificity_weight),
      confidence: row.confidence,
      evidenceNotes: row.evidence_notes,
      physicalFeasibility: row.target_type === "Physical" ? row.physical_feasibility ?? "CATALOG_EVALUABLE" : undefined,
      tacticalFamily: row.tactical_family ?? "POSITIONING",
      complexity: row.complexity ?? "MEDIUM",
    };
    return { mapping, mappingStatus: row.mapping_status, active: row.attivo, reason: row.decision_source === "manual" ? "Decisione metodologica manuale" : "Bootstrap validato" } satisfies EvaluationMappingDecision;
  }).filter((item): item is EvaluationMappingDecision => item !== null);
}

function healthForMappings(rows: EvaluationMappingDecision[]): ParameterCoverage["health"] {
  const active = rows.filter(item => item.active);
  const contexts = new Set(active.map(item => item.mapping.exercise.fase));
  if (active.length >= 3 && contexts.size >= 2) return "STRONG";
  if (active.length >= 2) return "ADEQUATE";
  if (active.length === 1) return "WEAK";
  return "UNCOVERED";
}

export function buildProductionTargetCatalog(decisions: EvaluationMappingDecision[], subcategories: ExerciseSubcategory[], objectives: PhysicalObjective[]): ProductionEvaluationTarget[] {
  const technical = subcategories.filter(item => item.fase !== "Generale").map(item => {
    const rows = decisions.filter(row => row.mapping.targetType === "TECHNICAL" && row.mapping.targetId === String(item.id));
    return {
      key: targetKey("TECHNICAL", String(item.id)), targetType: "TECHNICAL" as const, targetId: String(item.id), code: `SUB-${item.id}`,
      name: item.nome, aggregateName: rows[0]?.mapping.aggregateName ?? "Tecnica", health: healthForMappings(rows),
      requiredObservations: 2, requiredDistinctExercises: 2, priority: 4,
      technicalSubcategoryId: item.id, physicalObjectiveId: null, physicalDimensionId: null, physicalDimensionName: null,
    };
  });
  const physical = objectives.map(item => {
    const rows = decisions.filter(row => row.mapping.targetType === "PHYSICAL" && row.mapping.targetId === item.id);
    const protocol = rows.length > 0 && rows.every(row => row.mapping.physicalFeasibility === "REQUIRES_DEDICATED_PROTOCOL");
    return {
      key: targetKey("PHYSICAL", item.id), targetType: "PHYSICAL" as const, targetId: item.id, code: item.codice,
      name: item.obiettivo_fisico, aggregateName: item.macro_area, health: healthForMappings(rows),
      feasibility: protocol ? "REQUIRES_DEDICATED_PROTOCOL" as const : "CATALOG_EVALUABLE" as const,
      requiredObservations: 2, requiredDistinctExercises: 2, priority: 4,
      technicalSubcategoryId: null, physicalObjectiveId: item.id, physicalDimensionId: null, physicalDimensionName: null,
    };
  });
  return [...technical, ...physical];
}

function bestNamedTarget(catalog: ProductionEvaluationTarget[], name: string) {
  const query = normalize(name);
  const matches = catalog.filter(target => normalize(target.name) === query);
  return matches.sort((a, b) => healthRank[b.health] - healthRank[a.health] || a.code.localeCompare(b.code))[0] ?? null;
}

export function resolveCompleteCoreTargets(catalog: ProductionEvaluationTarget[]) {
  const required = CORE_REQUIRED_NAMES.map(name => bestNamedTarget(catalog, name)).filter((item): item is ProductionEvaluationTarget => Boolean(item));
  const optional = CORE_OPTIONAL_NAMES.map(name => bestNamedTarget(catalog, name)).filter((item): item is ProductionEvaluationTarget => Boolean(item) && item.health !== "UNCOVERED" && item.feasibility !== "REQUIRES_DEDICATED_PROTOCOL");
  const optionalRotated = optional.sort((a, b) => healthRank[b.health] - healthRank[a.health] || a.name.localeCompare(b.name)).slice(0, 3);
  return { required, optional, selected: [...required, ...optionalRotated] };
}

export function resolvePhysicalDimensionTargets(dimensions: PhysicalAssessmentDimension[], catalog: ProductionEvaluationTarget[], decisions: EvaluationMappingDecision[], selectedIds: string[]): PhysicalDimensionResolution[] {
  return dimensions.filter(dimension => selectedIds.includes(dimension.id)).map(dimension => {
    const objectiveIds = new Set((dimension.objective_mappings ?? []).map(item => item.physical_objective.id));
    const availableFis = catalog.filter(target => target.targetType === "PHYSICAL" && objectiveIds.has(target.targetId));
    const evaluable = availableFis.filter(target => target.feasibility !== "REQUIRES_DEDICATED_PROTOCOL");
    const scored = evaluable.map(target => {
      const rows = decisions.filter(row => row.active && row.mapping.targetType === "PHYSICAL" && row.mapping.targetId === target.targetId);
      return { target, rows, score: rows.length * 10 + rows.reduce((sum, row) => sum + row.mapping.evaluationSuitability, 0) };
    }).sort((a, b) => b.score - a.score || a.target.name.localeCompare(b.target.name));
    const usable = scored.filter(item => item.rows.length > 0);
    const selectedFis = usable.slice(0, Math.min(2, usable.length)).map(item => ({ ...item.target, physicalDimensionId: dimension.id, physicalDimensionName: dimension.nome }));
    const distinctExercises = new Set(selectedFis.flatMap(target => decisions.filter(row => row.active && row.mapping.targetType === "PHYSICAL" && row.mapping.targetId === target.targetId).map(row => row.mapping.exercise.id))).size;
    const expectedFis = Math.min(2, Math.max(1, evaluable.length));
    const status: CoverageStatus = evaluable.length === 0 && availableFis.some(item => item.feasibility === "REQUIRES_DEDICATED_PROTOCOL")
      ? "REQUIRES_PROTOCOL"
      : selectedFis.length >= expectedFis && distinctExercises >= 2
        ? "COVERED"
        : selectedFis.length > 0 ? "PARTIALLY_COVERED" : "NOT_COVERED";
    const explanation = status === "COVERED"
      ? `${selectedFis.length} FIS osservabili e ${distinctExercises} esercizi distinti disponibili.`
      : status === "PARTIALLY_COVERED"
        ? `La dimensione è rappresentata solo da ${selectedFis.map(item => item.name).join(" e ")}; non viene dichiarata misurata integralmente.`
        : status === "REQUIRES_PROTOCOL" ? "Gli obiettivi associati richiedono un protocollo fisico dedicato." : "Nessun mapping attivo affidabile disponibile.";
    return { dimension, status, explanation, selectedFis, availableFis };
  });
}

export function planProductionEvaluation(input: {
  evaluationType: "Complete" | "Targeted";
  exercises: Exercise[];
  decisions: EvaluationMappingDecision[];
  targets: ProductionEvaluationTarget[];
  maximumDuration: number;
  minimumObservations: number;
  contextPreference: "Bilanciata" | "Analitica" | "Situazionale" | "Percettiva";
}) {
  return planEvaluationSession({
    evaluationType: input.evaluationType,
    exercises: input.exercises,
    mappingDecisions: input.decisions,
    selectedTargets: input.targets,
    maximumDuration: input.maximumDuration,
    minimumObservations: input.minimumObservations,
    minimumDistinctExercises: Math.min(2, input.minimumObservations),
    goalkeeperCount: 1,
    maximumExercises: input.evaluationType === "Complete" ? 8 : 6,
    minimumExercises: input.evaluationType === "Complete" ? 6 : 1,
    contextPreference: input.contextPreference,
  });
}

export function replacementCandidates(selected: SelectedEvaluationExercise[], target: SelectedEvaluationExercise, decisions: EvaluationMappingDecision[], targets: ProductionEvaluationTarget[], exercises: Exercise[]) {
  const wanted = new Set(target.mappings.map(row => targetKey(row.mapping.targetType, row.mapping.targetId)));
  const selectedIds = new Set(selected.map(row => row.exercise.id));
  const validTargets = new Set(targets.map(row => row.key));
  return exercises.filter(exercise => !selectedIds.has(exercise.id)).map(exercise => {
    const mappings = decisions.filter(row => row.active && row.mapping.exercise.id === exercise.id && validTargets.has(targetKey(row.mapping.targetType, row.mapping.targetId)));
    const retained = mappings.filter(row => wanted.has(targetKey(row.mapping.targetType, row.mapping.targetId))).length;
    const utility = mappings.reduce((sum, row) => sum + row.mapping.evaluationSuitability * .45 + row.mapping.observabilityWeight * .35 + row.mapping.specificityWeight * .2, 0) + retained * .25;
    return { exercise, mappings, utility: Number((utility * 100).toFixed(1)) };
  }).filter(item => item.mappings.length > 0).sort((a, b) => b.utility - a.utility || a.exercise.durata_min - b.exercise.durata_min).slice(0, 8);
}

export function replaceEvaluationExercise(result: EvaluationEngineResult, targetExerciseId: string, replacement: { exercise: Exercise; mappings: EvaluationMappingDecision[]; utility: number }) {
  const selectedExercises = result.selectedExercises.map(item => item.exercise.id === targetExerciseId ? { exercise: replacement.exercise, mappings: replacement.mappings, selectionScore: replacement.utility, breakdown: item.breakdown, plannedObservations: item.plannedObservations } : item);
  const coverageMatrix = createCoverageMatrix(result.coverageMatrix.map(row => row.parameter), selectedExercises);
  const estimatedDuration = selectedExercises.reduce((sum, item) => sum + item.exercise.durata_min, 0);
  return { ...result, selectedExercises, coverageMatrix, uncoveredTargets: coverageMatrix.filter(row => row.status === "NOT_COVERED" || row.status === "PARTIALLY_COVERED"), protocolOnlyTargets: coverageMatrix.filter(row => row.status === "REQUIRES_PROTOCOL"), estimatedDuration };
}

export function losesRequiredCoverage(before: EvaluationEngineResult, after: EvaluationEngineResult) {
  const beforeCovered = new Set(before.coverageMatrix.filter(row => row.status === "COVERED").map(row => row.parameter.key));
  return after.coverageMatrix.filter(row => beforeCovered.has(row.parameter.key) && row.status !== "COVERED").map(row => row.parameter.name);
}

export function manualDecisionKeys(rows: EvaluationBootstrapRow[]) {
  return rows.filter(row => row.decision_source === "manual").map(row => `${row.exercise_code}|${row.target_type}|${row.technical_subcategory_id ?? row.physical_objective_code}`);
}

export function bootstrapDecisionByKey(audit: EvaluationMappingAuditReport) {
  return new Map(buildProductionBootstrapRows(audit).map(row => [`${row.exercise_code}|${row.target_type}|${row.technical_subcategory_id ?? row.physical_objective_code}`, row]));
}

export { mappingKey };
