import { planEvaluationSession, targetKey, type EvaluationEngineResult, type EvaluationMappingDecision } from "./evaluation-session-engine.ts";
import type { ProductionEvaluationTarget } from "./evaluation-production.ts";
import type { Exercise } from "./types.ts";
import type { GoalkeeperEvaluationHistorySession, HistoryParameterResult } from "./evaluation-history.ts";

export type ExpectedComparability = "HIGH" | "MEDIUM" | "LIMITED";

export type ReassessmentPlan = {
  result: EvaluationEngineResult;
  expectedComparability: ExpectedComparability;
  exerciseOverlap: number;
  contextOverlap: number;
  coveredTargetRatio: number;
  sameBaselineExerciseIds: string[];
  replacementExerciseIds: string[];
  warnings: string[];
};

export type ReassessmentBaselineCheck = {
  valid: boolean;
  reasons: string[];
};

const round = (value: number, digits = 3) => Number(value.toFixed(digits));
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function overlap(left: string[], right: string[]) {
  const a = new Set(left), b = new Set(right);
  const union = new Set([...a, ...b]);
  return union.size ? round([...a].filter(value => b.has(value)).length / union.size) : 0;
}

export function historyKeyToEngineKey(key: string) {
  const [type, id] = key.split(":", 2);
  return targetKey(type === "Technical" ? "TECHNICAL" : "PHYSICAL", id);
}

export function validateReassessmentBaseline(input: {
  baselineId: string;
  newSessionId?: string | null;
  baselineStatus: string;
  baselineGoalkeeperId: string;
  requestedGoalkeeperId: string;
  baselineOwnerId?: string;
  requestedOwnerId?: string;
}) : ReassessmentBaselineCheck {
  const reasons: string[] = [];
  if (input.baselineStatus !== "Completed") reasons.push("La baseline deve essere Completed.");
  if (input.baselineGoalkeeperId !== input.requestedGoalkeeperId) reasons.push("La baseline appartiene a un altro portiere.");
  if (input.newSessionId && input.newSessionId === input.baselineId) reasons.push("Una seduta non può essere baseline di se stessa.");
  if (input.baselineOwnerId && input.requestedOwnerId && input.baselineOwnerId !== input.requestedOwnerId) reasons.push("La baseline appartiene a un altro proprietario.");
  return { valid: reasons.length === 0, reasons };
}

export function selectBaselineTargets(baseline: GoalkeeperEvaluationHistorySession, targetCatalog: ProductionEvaluationTarget[], selectedHistoryKeys?: string[]) {
  const selected = new Set(selectedHistoryKeys ?? baseline.targetKeys);
  const catalog = new Map(targetCatalog.map(target => [target.key, target]));
  return baseline.parameters
    .filter(parameter => selected.has(parameter.key))
    .map(parameter => catalog.get(historyKeyToEngineKey(parameter.key)))
    .filter((target): target is ProductionEvaluationTarget => Boolean(target));
}

export function isBaselineTargetSubset(baseline: GoalkeeperEvaluationHistorySession, selectedHistoryKeys: string[]) {
  const baselineKeys = new Set(baseline.targetKeys);
  return selectedHistoryKeys.length > 0 && selectedHistoryKeys.every(key => baselineKeys.has(key));
}

export function baselineResultFor(parameter: HistoryParameterResult) {
  if (parameter.state === "NOT_OBSERVABLE") return { label: "Non valutato", detail: `${parameter.notObservedDecisions} occasioni non osservabili`, score: null };
  if (parameter.state === "NOT_EVALUATED" || parameter.weightedScore == null) return { label: "Non valutato", detail: "Nessuna misurazione valida", score: null };
  return { label: parameter.weightedScore.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), detail: `${parameter.validObservations} osservazioni · ${parameter.distinctExercises} esercizi`, score: parameter.weightedScore };
}

export function planReassessment(input: {
  baseline: GoalkeeperEvaluationHistorySession;
  selectedHistoryKeys: string[];
  targets: ProductionEvaluationTarget[];
  exercises: Exercise[];
  decisions: EvaluationMappingDecision[];
  maximumDuration: number;
  minimumObservations: number;
  contextPreference: "Bilanciata" | "Analitica" | "Situazionale" | "Percettiva";
}): ReassessmentPlan {
  if (!isBaselineTargetSubset(input.baseline, input.selectedHistoryKeys)) throw new Error("I target devono essere un sottoinsieme non vuoto della baseline.");
  const selectedTargets = selectBaselineTargets(input.baseline, input.targets, input.selectedHistoryKeys);
  if (!selectedTargets.length) throw new Error("Nessun target baseline è più disponibile nel catalogo valutativo.");

  const baselineExerciseIds = new Set(input.baseline.exerciseIds);
  const baselineContexts = new Set(input.baseline.parameters.filter(parameter => input.selectedHistoryKeys.includes(parameter.key)).flatMap(parameter => parameter.contexts));
  const selectedTargetKeys = new Set(selectedTargets.map(target => target.key));
  const boostedDecisions = input.decisions.map(decision => {
    const key = targetKey(decision.mapping.targetType, decision.mapping.targetId);
    if (!selectedTargetKeys.has(key)) return decision;
    const sameExerciseBonus = baselineExerciseIds.has(decision.mapping.exercise.id) ? .10 : 0;
    const sameContextBonus = baselineContexts.has(decision.mapping.exercise.fase) ? .04 : 0;
    if (!sameExerciseBonus && !sameContextBonus) return decision;
    return {
      ...decision,
      mapping: {
        ...decision.mapping,
        evaluationSuitability: clamp01(decision.mapping.evaluationSuitability + sameExerciseBonus + sameContextBonus),
        observabilityWeight: clamp01(decision.mapping.observabilityWeight + sameExerciseBonus * .4),
        specificityWeight: clamp01(decision.mapping.specificityWeight + sameContextBonus),
      },
      reason: `${decision.reason} Bonus comparabilità baseline applicato in preview.`,
    };
  });

  const generated = planEvaluationSession({
    evaluationType: "Reassessment",
    exercises: input.exercises.filter(exercise => exercise.attivo),
    mappingDecisions: boostedDecisions,
    selectedTargets,
    maximumDuration: Math.max(20, Math.min(45, input.maximumDuration)),
    minimumObservations: input.minimumObservations,
    minimumDistinctExercises: Math.min(2, input.minimumObservations),
    goalkeeperCount: 1,
    maximumExercises: 5,
    contextPreference: input.contextPreference,
  });
  const result: EvaluationEngineResult = {
    ...generated,
    estimatedDuration: Math.max(20, generated.estimatedDuration),
    durationWithinRecommendedRange: generated.estimatedDuration <= 45,
  };

  const selectedExerciseIds = result.selectedExercises.map(item => item.exercise.id);
  const selectedContexts = result.selectedExercises.map(item => item.exercise.fase);
  const exerciseOverlap = overlap([...baselineExerciseIds], selectedExerciseIds);
  const contextOverlap = overlap([...baselineContexts], selectedContexts);
  const coveredTargetRatio = result.coverageMatrix.length ? result.coverageMatrix.filter(row => row.status === "COVERED").length / result.coverageMatrix.length : 0;
  const expectedComparability: ExpectedComparability = coveredTargetRatio === 1 && exerciseOverlap >= .5 && contextOverlap >= .5
    ? "HIGH"
    : coveredTargetRatio >= .6 && (exerciseOverlap > 0 || contextOverlap >= .5) ? "MEDIUM" : "LIMITED";
  const sameBaselineExerciseIds = selectedExerciseIds.filter(id => baselineExerciseIds.has(id));
  const replacementExerciseIds = selectedExerciseIds.filter(id => !baselineExerciseIds.has(id));
  const warnings = [
    ...result.uncoveredTargets.map(row => `${row.parameter.name}: copertura ${row.status === "PARTIALLY_COVERED" ? "parziale" : "assente"}.`),
    exerciseOverlap === 0 ? "Nessun esercizio coincide con la baseline: la confrontabilità finale potrebbe essere limitata." : null,
    contextOverlap < .5 ? "I contesti metodologici differiscono in modo significativo dalla baseline." : null,
    replacementExerciseIds.length ? `${replacementExerciseIds.length} esercizi differenti dalla baseline.` : null,
  ].filter((item): item is string => Boolean(item));

  return { result, expectedComparability, exerciseOverlap, contextOverlap, coveredTargetRatio: round(coveredTargetRatio), sameBaselineExerciseIds, replacementExerciseIds, warnings };
}

export function buildReassessmentChain(sessions: GoalkeeperEvaluationHistorySession[], sessionId: string) {
  const byId = new Map(sessions.map(session => [session.id, session]));
  const chain: GoalkeeperEvaluationHistorySession[] = [];
  const visited = new Set<string>();
  let current = byId.get(sessionId) ?? null;
  while (current && !visited.has(current.id)) {
    chain.unshift(current);
    visited.add(current.id);
    current = current.baselineSessionId ? byId.get(current.baselineSessionId) ?? null : null;
  }
  return chain;
}
