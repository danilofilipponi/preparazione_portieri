import { createCoverageMatrix, targetKey, type EvaluationEngineResult, type EvaluationMappingDecision, type EvaluationSelectionBreakdown } from "./evaluation-session-engine.ts";
import type { ProductionEvaluationTarget } from "./evaluation-production.ts";
import type { Exercise } from "./types.ts";

const neutralBreakdown: EvaluationSelectionBreakdown = {
  coverageGain: 1,
  specificity: 0,
  observability: 0,
  variety: 0,
  practicalCompatibility: 0,
  loadCompatibility: 0,
  redundancyPenalty: 0,
  excessComplexityPenalty: 0,
  excessLoadPenalty: 0,
};

export function buildCustomEvaluation(input: {
  exerciseIds: string[];
  exercises: Exercise[];
  decisions: EvaluationMappingDecision[];
  targets: ProductionEvaluationTarget[];
  duration: number;
  minimumObservations: number;
}): { result: EvaluationEngineResult; targets: ProductionEvaluationTarget[] } {
  const selectedExercises = input.exerciseIds.map(id => input.exercises.find(exercise => exercise.id === id)).filter((exercise): exercise is Exercise => Boolean(exercise?.attivo));
  const targetCatalog = new Map(input.targets.map(target => [target.key, target]));
  const mappingsByExercise = new Map<string, EvaluationMappingDecision[]>();
  for (const decision of input.decisions) {
    if (!decision.active || decision.mappingStatus !== "auto_approved") continue;
    const key = targetKey(decision.mapping.targetType, decision.mapping.targetId);
    if (!targetCatalog.has(key)) continue;
    const values = mappingsByExercise.get(decision.mapping.exercise.id) ?? [];
    values.push(decision);
    mappingsByExercise.set(decision.mapping.exercise.id, values);
  }
  const selected = selectedExercises.map(exercise => ({ exercise, mappings: mappingsByExercise.get(exercise.id) ?? [], selectionScore: 100, breakdown: neutralBreakdown, plannedObservations: 1 })).filter(item => item.mappings.length > 0);
  const usedTargetKeys = new Set(selected.flatMap(item => item.mappings.map(mapping => targetKey(mapping.mapping.targetType, mapping.mapping.targetId))));
  const targets = input.targets.filter(target => usedTargetKeys.has(target.key));
  const coverageMatrix = createCoverageMatrix(targets, selected);
  const duration = Math.max(30, Math.min(60, Math.round(input.duration)));
  return { targets, result: { evaluationType: "Custom", selectedExercises: selected, coverageMatrix, uncoveredTargets: coverageMatrix.filter(row => row.status === "NOT_COVERED" || row.status === "PARTIALLY_COVERED"), protocolOnlyTargets: coverageMatrix.filter(row => row.status === "REQUIRES_PROTOCOL"), estimatedDuration: duration, selectionScore: 100, durationTarget: duration, durationWithinRecommendedRange: duration >= 30 && duration <= 60, exerciseCountWithinRecommendedRange: selected.length >= 1 && selected.length <= 6 } };
}
