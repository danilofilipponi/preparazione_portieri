import type { EvaluationMapping, EvaluationMappingAuditReport, EvaluationTargetType, ParameterCoverage, PhysicalFeasibility } from "./evaluation-mapping-audit.ts";
import type { Exercise } from "./types.ts";

export type EvaluationType = "Complete" | "Targeted" | "Reassessment";
export type MappingStatus = "auto_approved" | "needs_review" | "rejected";
export type CoverageStatus = "COVERED" | "PARTIALLY_COVERED" | "NOT_COVERED" | "REQUIRES_PROTOCOL";

export const EVALUATION_SELECTION_WEIGHTS = Object.freeze({
  coverageGain: .35,
  specificity: .20,
  observability: .25,
  variety: .08,
  practicalCompatibility: .05,
  loadCompatibility: .07,
  redundancyPenalty: .12,
  excessComplexityPenalty: .10,
  excessLoadPenalty: .08,
});

export const EVALUATION_SESSION_DEFAULTS: Readonly<Record<EvaluationType, { duration: number; minimumDuration: number; maximumDuration: number; minimumExercises: number; maximumExercises: number }>> = Object.freeze({
  Complete: { duration: 70, minimumDuration: 60, maximumDuration: 80, minimumExercises: 6, maximumExercises: 8 },
  Targeted: { duration: 45, minimumDuration: 30, maximumDuration: 60, minimumExercises: 3, maximumExercises: 6 },
  Reassessment: { duration: 30, minimumDuration: 20, maximumDuration: 45, minimumExercises: 2, maximumExercises: 5 },
});

export type EvaluationEngineTarget = {
  key: string;
  targetType: EvaluationTargetType;
  targetId: string;
  code: string;
  name: string;
  aggregateName: string;
  health: ParameterCoverage["health"];
  feasibility?: PhysicalFeasibility;
  requiredObservations: number;
  requiredDistinctExercises: number;
  priority: number;
};

export type EvaluationMappingDecision = {
  mapping: EvaluationMapping;
  mappingStatus: MappingStatus;
  active: boolean;
  reason: string;
};

export type MappingBootstrapProposal = {
  decisions: EvaluationMappingDecision[];
  counts: { total: number; high: number; medium: number; low: number; autoApproved: number; needsReview: number; rejected: number; active: number; inactive: number };
};

export type EvaluationSelectionBreakdown = {
  coverageGain: number;
  specificity: number;
  observability: number;
  variety: number;
  practicalCompatibility: number;
  loadCompatibility: number;
  redundancyPenalty: number;
  excessComplexityPenalty: number;
  excessLoadPenalty: number;
};

export type SelectedEvaluationExercise = {
  exercise: Exercise;
  mappings: EvaluationMappingDecision[];
  selectionScore: number;
  breakdown: EvaluationSelectionBreakdown;
  plannedObservations: number;
};

export type EvaluationCoverageRow = {
  parameter: EvaluationEngineTarget;
  selectedExercises: Exercise[];
  observationCount: number;
  distinctExercises: number;
  distinctContexts: string[];
  status: CoverageStatus;
};

export type EvaluationEngineResult = {
  evaluationType: EvaluationType;
  selectedExercises: SelectedEvaluationExercise[];
  coverageMatrix: EvaluationCoverageRow[];
  uncoveredTargets: EvaluationCoverageRow[];
  protocolOnlyTargets: EvaluationCoverageRow[];
  estimatedDuration: number;
  selectionScore: number;
  durationTarget: number;
  durationWithinRecommendedRange: boolean;
  exerciseCountWithinRecommendedRange: boolean;
};

export const targetKey = (targetType: EvaluationTargetType, targetId: string) => `${targetType}:${targetId}`;

export function isValidEvaluationTargetReference(value: { targetType: EvaluationTargetType; technicalSubcategoryId?: string | number | null; physicalObjectiveId?: string | null }) {
  return value.targetType === "TECHNICAL"
    ? value.technicalSubcategoryId != null && value.physicalObjectiveId == null
    : value.physicalObjectiveId != null && value.technicalSubcategoryId == null;
}

export function bootstrapEvaluationMappings(report: EvaluationMappingAuditReport): MappingBootstrapProposal {
  const healthByTarget = new Map([...report.technicalCoverage, ...report.physicalCoverage].map(row => [targetKey(row.targetType, row.targetId), row]));
  const decisions = report.allMappings.map(mapping => {
    const coverage = healthByTarget.get(targetKey(mapping.targetType, mapping.targetId));
    if (mapping.physicalFeasibility === "REQUIRES_DEDICATED_PROTOCOL") return { mapping, mappingStatus: "rejected" as const, active: false, reason: "Richiede protocollo specifico: escluso dal motore standard." };
    if (mapping.confidence === "LOW") return { mapping, mappingStatus: "rejected" as const, active: false, reason: "LOW confidence: inattivo per default." };
    if (!coverage || coverage.health === "UNCOVERED") return { mapping, mappingStatus: "rejected" as const, active: false, reason: "Parametro non sufficientemente coperto." };
    if (coverage.health === "WEAK") return { mapping, mappingStatus: "needs_review" as const, active: false, reason: "Copertura WEAK: revisione umana obbligatoria." };
    if (mapping.confidence === "HIGH" && mapping.evaluationSuitability >= .70) return { mapping, mappingStatus: "auto_approved" as const, active: true, reason: "HIGH confidence, suitability buona e parametro almeno ADEQUATE." };
    if (mapping.confidence === "MEDIUM" || mapping.confidence === "HIGH") return { mapping, mappingStatus: "needs_review" as const, active: false, reason: "Candidato valido ma da verificare prima dell'attivazione." };
    return { mapping, mappingStatus: "needs_review" as const, active: false, reason: "Mapping non auto-approvabile: revisione umana obbligatoria." };
  });
  return { decisions, counts: { total: decisions.length, high: report.highConfidence.length, medium: report.mediumConfidence.length, low: report.lowConfidence.length, autoApproved: decisions.filter(row => row.mappingStatus === "auto_approved").length, needsReview: decisions.filter(row => row.mappingStatus === "needs_review").length, rejected: decisions.filter(row => row.mappingStatus === "rejected").length, active: decisions.filter(row => row.active).length, inactive: decisions.filter(row => !row.active).length } };
}

export function coverageToEngineTargets(rows: ParameterCoverage[], requiredObservations = 2, requiredDistinctExercises = 2): EvaluationEngineTarget[] {
  return rows.map(row => ({ key: targetKey(row.targetType, row.targetId), targetType: row.targetType, targetId: row.targetId, code: row.code, name: row.name, aggregateName: row.aggregateName, health: row.health, feasibility: row.feasibility, requiredObservations, requiredDistinctExercises, priority: row.health === "STRONG" ? 5 : row.health === "ADEQUATE" ? 4 : row.health === "WEAK" ? 2 : 1 }));
}

function balancedCore(rows: ParameterCoverage[], limit: number): ParameterCoverage[] {
  const eligible = rows.filter(row => ["STRONG", "ADEQUATE"].includes(row.health) && row.feasibility !== "REQUIRES_DEDICATED_PROTOCOL").sort((a, b) => (b.health === "STRONG" ? 1 : 0) - (a.health === "STRONG" ? 1 : 0) || b.good - a.good || b.excellent - a.excellent || b.evaluable - a.evaluable || a.name.localeCompare(b.name));
  const groups = new Map<string, ParameterCoverage[]>();
  for (const row of eligible) { const values = groups.get(row.aggregateName) ?? []; values.push(row); groups.set(row.aggregateName, values); }
  const selected: ParameterCoverage[] = [];
  let depth = 0;
  while (selected.length < limit) {
    let added = false;
    for (const values of groups.values()) if (values[depth] && selected.length < limit) { selected.push(values[depth]); added = true; }
    if (!added) break;
    depth += 1;
  }
  return selected;
}

export function proposeCoreEvaluationTargets(report: EvaluationMappingAuditReport, options: { technicalLimit?: number; physicalLimit?: number } = {}): EvaluationEngineTarget[] {
  const technical = balancedCore(report.technicalCoverage, options.technicalLimit ?? 8);
  const physical = balancedCore(report.physicalCoverage, options.physicalLimit ?? 4);
  return coverageToEngineTargets([...technical, ...physical]);
}

const intensityLoad = (exercise: Exercise) => exercise.intensita === "Alta" ? 1 : exercise.intensita === "Media-Alta" ? .85 : exercise.intensita === "Media" ? .65 : exercise.intensita === "Bassa-Media" ? .45 : .3;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function scoreCandidate(exercise: Exercise, mappings: EvaluationMappingDecision[], targets: Map<string, EvaluationEngineTarget>, observations: Map<string, Set<string>>, selected: SelectedEvaluationExercise[], input: EvaluationEngineInput): { score: number; breakdown: EvaluationSelectionBreakdown } {
  const targetRows = mappings.filter(row => targets.has(targetKey(row.mapping.targetType, row.mapping.targetId)));
  const gains = targetRows.map(row => { const target = targets.get(targetKey(row.mapping.targetType, row.mapping.targetId))!; const current = observations.get(target.key)?.size ?? 0; return Math.max(0, target.requiredDistinctExercises - current) / target.requiredDistinctExercises * (target.priority / 5); });
  const coverageGain = clamp01(gains.reduce((sum, value) => sum + value, 0) / Math.max(1, targets.size));
  const specificity = targetRows.reduce((sum, row) => sum + row.mapping.specificityWeight, 0) / Math.max(1, targetRows.length);
  const observability = targetRows.reduce((sum, row) => sum + row.mapping.observabilityWeight, 0) / Math.max(1, targetRows.length);
  const phases = new Set(selected.map(row => row.exercise.fase));
  const categories = new Set(selected.map(row => row.exercise.category_id));
  const baseVariety = selected.length === 0 ? .8 : clamp01((phases.has(exercise.fase) ? .35 : .65) + (categories.has(exercise.category_id) ? 0 : .35));
  const preference = input.contextPreference ?? "Bilanciata";
  const preferredContext = preference === "Analitica"
    ? exercise.fase === "Analitico"
    : preference === "Situazionale"
      ? exercise.fase.includes("Situazionale") || exercise.fase === "Scenario aperto"
      : preference === "Percettiva"
        ? exercise.fase === "Disturbo" || exercise.sottocategoria.toLowerCase().includes("percett")
        : exercise.fase !== "Analitico";
  const contextFloorBonus = input.evaluationType === "Complete" && preferredContext && !phases.has(exercise.fase) ? .15 : 0;
  const variety = clamp01(baseVariety + contextFloorBonus);
  const goalkeeperCount = input.goalkeeperCount ?? 1;
  const practicalCompatibility = goalkeeperCount >= exercise.portieri_min && goalkeeperCount <= exercise.portieri_max ? 1 : .15;
  const load = intensityLoad(exercise);
  const loadCompatibility = input.evaluationType === "Reassessment" ? 1 - load * .55 : input.evaluationType === "Targeted" ? 1 - Math.abs(load - .62) : 1 - Math.abs(load - .68);
  const redundancyPenalty = clamp01(targetRows.filter(row => (observations.get(targetKey(row.mapping.targetType, row.mapping.targetId))?.size ?? 0) >= targets.get(targetKey(row.mapping.targetType, row.mapping.targetId))!.requiredDistinctExercises).length / Math.max(1, targetRows.length));
  const excessComplexityPenalty = targetRows.some(row => row.mapping.complexity === "HIGH") ? clamp01(1 - specificity) : 0;
  const selectedHighLoad = selected.filter(row => intensityLoad(row.exercise) >= .85).length;
  const excessLoadPenalty = load >= .85 && selectedHighLoad >= 2 ? clamp01((selectedHighLoad - 1) / 3) : 0;
  const breakdown = { coverageGain, specificity, observability, variety, practicalCompatibility, loadCompatibility: clamp01(loadCompatibility), redundancyPenalty, excessComplexityPenalty, excessLoadPenalty };
  const weights = EVALUATION_SELECTION_WEIGHTS;
  const score = 100 * (breakdown.coverageGain * weights.coverageGain + breakdown.specificity * weights.specificity + breakdown.observability * weights.observability + breakdown.variety * weights.variety + breakdown.practicalCompatibility * weights.practicalCompatibility + breakdown.loadCompatibility * weights.loadCompatibility - breakdown.redundancyPenalty * weights.redundancyPenalty - breakdown.excessComplexityPenalty * weights.excessComplexityPenalty - breakdown.excessLoadPenalty * weights.excessLoadPenalty);
  return { score: round(Math.max(0, score)), breakdown: Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, round(value)])) as unknown as EvaluationSelectionBreakdown };
}

export type EvaluationEngineInput = {
  evaluationType: EvaluationType;
  exercises: Exercise[];
  mappingDecisions: EvaluationMappingDecision[];
  selectedTargets: EvaluationEngineTarget[];
  maximumDuration?: number;
  minimumObservations?: number;
  minimumDistinctExercises?: number;
  goalkeeperCount?: number;
  includeNeedsReview?: boolean;
  maximumExercises?: number;
  minimumExercises?: number;
  contextPreference?: "Bilanciata" | "Analitica" | "Situazionale" | "Percettiva";
};

export function createCoverageMatrix(targets: EvaluationEngineTarget[], selected: SelectedEvaluationExercise[]): EvaluationCoverageRow[] {
  return targets.map(target => {
    const rows = selected.filter(item => item.mappings.some(mapping => targetKey(mapping.mapping.targetType, mapping.mapping.targetId) === target.key));
    const selectedExercises = [...new Map(rows.map(row => [row.exercise.id, row.exercise])).values()];
    const observationCount = rows.reduce((sum, row) => sum + row.plannedObservations, 0);
    const distinctContexts = [...new Set(rows.map(row => row.exercise.fase))];
    const status: CoverageStatus = target.feasibility === "REQUIRES_DEDICATED_PROTOCOL" ? "REQUIRES_PROTOCOL" : selectedExercises.length >= target.requiredDistinctExercises && observationCount >= target.requiredObservations ? "COVERED" : selectedExercises.length > 0 ? "PARTIALLY_COVERED" : "NOT_COVERED";
    return { parameter: target, selectedExercises, observationCount, distinctExercises: selectedExercises.length, distinctContexts, status };
  });
}

export function planEvaluationSession(input: EvaluationEngineInput): EvaluationEngineResult {
  const defaults = EVALUATION_SESSION_DEFAULTS[input.evaluationType];
  const durationTarget = input.maximumDuration ?? defaults.duration;
  const maximumExercises = input.maximumExercises ?? defaults.maximumExercises;
  const minimumExercises = input.minimumExercises ?? 0;
  const enforceRecommendedFloor = input.minimumExercises != null;
  const targets = new Map(input.selectedTargets.map(target => [target.key, { ...target, requiredObservations: input.minimumObservations ?? target.requiredObservations, requiredDistinctExercises: input.minimumDistinctExercises ?? target.requiredDistinctExercises }]));
  const eligibleMappings = input.mappingDecisions.filter(row => row.active || (input.includeNeedsReview && row.mappingStatus === "needs_review")).filter(row => targets.has(targetKey(row.mapping.targetType, row.mapping.targetId))).filter(row => row.mapping.physicalFeasibility !== "REQUIRES_DEDICATED_PROTOCOL");
  const mappingsByExercise = new Map<string, EvaluationMappingDecision[]>();
  for (const row of eligibleMappings) { const values = mappingsByExercise.get(row.mapping.exercise.id) ?? []; values.push(row); mappingsByExercise.set(row.mapping.exercise.id, values); }
  const observations = new Map<string, Set<string>>();
  const selected: SelectedEvaluationExercise[] = [];
  let estimatedDuration = 0;
  while (selected.length < maximumExercises) {
    let best: SelectedEvaluationExercise | null = null;
    for (const exercise of input.exercises) {
      if (selected.some(row => row.exercise.id === exercise.id)) continue;
      if (estimatedDuration + exercise.durata_min > durationTarget) continue;
      const mappings = mappingsByExercise.get(exercise.id) ?? [];
      if (!mappings.length) continue;
      const scored = scoreCandidate(exercise, mappings, targets, observations, selected, input);
      const minimumNotReached = enforceRecommendedFloor && (selected.length < minimumExercises || estimatedDuration < defaults.minimumDuration);
      const contributes = minimumNotReached || mappings.some(row => { const key = targetKey(row.mapping.targetType, row.mapping.targetId); return (observations.get(key)?.size ?? 0) < targets.get(key)!.requiredDistinctExercises; });
      if (!contributes) continue;
      const candidate = { exercise, mappings, selectionScore: scored.score, breakdown: scored.breakdown, plannedObservations: 1 };
      if (!best || candidate.selectionScore > best.selectionScore || (candidate.selectionScore === best.selectionScore && exercise.durata_min < best.exercise.durata_min) || (candidate.selectionScore === best.selectionScore && exercise.durata_min === best.exercise.durata_min && exercise.codice.localeCompare(best.exercise.codice) < 0)) best = candidate;
    }
    if (!best || best.selectionScore <= 0) break;
    selected.push(best);
    estimatedDuration += best.exercise.durata_min;
    for (const row of best.mappings) { const key = targetKey(row.mapping.targetType, row.mapping.targetId); if (!targets.has(key)) continue; const values = observations.get(key) ?? new Set<string>(); values.add(best.exercise.id); observations.set(key, values); }
  }
  const coverageMatrix = createCoverageMatrix([...targets.values()], selected);
  return { evaluationType: input.evaluationType, selectedExercises: selected, coverageMatrix, uncoveredTargets: coverageMatrix.filter(row => row.status === "NOT_COVERED" || row.status === "PARTIALLY_COVERED"), protocolOnlyTargets: coverageMatrix.filter(row => row.status === "REQUIRES_PROTOCOL"), estimatedDuration, selectionScore: round(selected.reduce((sum, row) => sum + row.selectionScore, 0) / Math.max(1, selected.length)), durationTarget, durationWithinRecommendedRange: estimatedDuration >= defaults.minimumDuration && estimatedDuration <= defaults.maximumDuration, exerciseCountWithinRecommendedRange: selected.length >= defaults.minimumExercises && selected.length <= defaults.maximumExercises };
}

export type ScoredEvaluationObservation = { exerciseId: string; score: number; observability: number; suitability: number; confidence?: number | null };

export function aggregateParameterScore(observations: ScoredEvaluationObservation[], sameExerciseWeightCap = 1.25): { score: number | null; normalizedScore: number | null; totalWeight: number; observations: number; distinctExercises: number } {
  if (!observations.length) return { score: null, normalizedScore: null, totalWeight: 0, observations: 0, distinctExercises: 0 };
  const grouped = new Map<string, Array<{ observation: ScoredEvaluationObservation; rawWeight: number }>>();
  for (const observation of observations) { const rawWeight = clamp01(observation.observability) * clamp01(observation.suitability) * clamp01(observation.confidence ?? 1); const values = grouped.get(observation.exerciseId) ?? []; values.push({ observation, rawWeight }); grouped.set(observation.exerciseId, values); }
  let weightedScore = 0, totalWeight = 0;
  for (const values of grouped.values()) {
    const rawTotal = values.reduce((sum, row) => sum + row.rawWeight, 0);
    const scale = rawTotal > sameExerciseWeightCap ? sameExerciseWeightCap / rawTotal : 1;
    for (const row of values) { const weight = row.rawWeight * scale; weightedScore += row.observation.score * weight; totalWeight += weight; }
  }
  const score = totalWeight > 0 ? weightedScore / totalWeight : null;
  return { score: score == null ? null : round(score, 3), normalizedScore: score == null ? null : normalizeEvaluationScore(score), totalWeight: round(totalWeight, 3), observations: observations.length, distinctExercises: grouped.size };
}

export function normalizeEvaluationScore(score: number, minimum = 1, maximum = 5) {
  if (maximum <= minimum) throw new Error("Intervallo scala non valido");
  return round(clamp01((score - minimum) / (maximum - minimum)) * 100, 2);
}
