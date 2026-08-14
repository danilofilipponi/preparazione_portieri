import { EVALUATION_PRESENTATION_DIMENSIONS, reliabilityFor, type EvaluationReliability } from "./evaluation-field.ts";
import { aggregateParameterScore } from "./evaluation-session-engine.ts";

export type HistoryEvaluationType = "Complete" | "Targeted" | "Reassessment";
export type ComparabilityLevel = "COMPARABLE" | "PARTIALLY_COMPARABLE" | "LOW_COMPARABILITY" | "NOT_COMPARABLE";
export type HistoryProfile = "TECHNICAL PROFILE" | "PERCEPTUAL / DECISIONAL PROFILE" | "PHYSICAL OBSERVABLE PROFILE";

export type HistorySessionRow = {
  id: string;
  training_id: string;
  goalkeeper_id: string;
  evaluation_type: HistoryEvaluationType;
  previous_evaluation_session_id: string | null;
  status: string;
  scale_id: string;
  started_at: string | null;
  completed_at: string | null;
};

export type HistoryTrainingRow = { id: string; training_date: string; planned_duration_minutes: number };
export type HistorySessionTargetRow = {
  id: string;
  evaluation_session_id: string;
  target_type: "Technical" | "Physical";
  technical_subcategory_id: number | null;
  physical_objective_id: string | null;
  physical_dimension_id: string | null;
  parameter_name_snapshot: string;
  coverage_status: string;
};
export type HistoryExerciseTargetRow = {
  id: string;
  evaluation_session_id: string;
  training_exercise_id: string;
  session_target_id: string;
  observability_weight: number | string;
  selection_weight: number | string;
};
export type HistoryObservationRow = {
  id: string;
  evaluation_exercise_target_id: string;
  score: number | null;
  observation_status: "OBSERVED" | "NOT_OBSERVED";
  confidence: number | string | null;
  observed_at: string;
};
export type HistoryTrainingExerciseRow = {
  id: string;
  training_id: string;
  exercise_id: string;
  exercise: { id: string; codice: string; nome: string; fase: string } | null;
};

export type HistoryParameterResult = {
  key: string;
  sessionTargetId: string;
  sessionId: string;
  sessionType: HistoryEvaluationType;
  date: string;
  scaleId: string;
  name: string;
  targetType: "Technical" | "Physical";
  physicalDimensionId: string | null;
  profile: HistoryProfile;
  validObservations: number;
  notObservedDecisions: number;
  distinctExercises: number;
  distinctContexts: number;
  exerciseIds: string[];
  contexts: string[];
  weightedScore: number | null;
  normalizedScore: number | null;
  totalWeight: number;
  averageSuitability: number;
  averageObservability: number;
  averageConfidence: number;
  reliability: EvaluationReliability;
  state: "EVALUATED" | "NOT_OBSERVABLE" | "NOT_EVALUATED";
};

export type HistoryDimensionResult = {
  name: string;
  profile: HistoryProfile;
  sessionId: string;
  date: string;
  scaleId: string;
  score: number | null;
  normalizedScore: number | null;
  reliability: EvaluationReliability;
  parameterKeys: string[];
};

export type GoalkeeperEvaluationHistorySession = {
  id: string;
  goalkeeperId: string;
  trainingId: string;
  evaluationType: HistoryEvaluationType;
  date: string;
  completedAt: string;
  durationMinutes: number;
  exerciseCount: number;
  exerciseIds: string[];
  scaleId: string;
  baselineSessionId: string | null;
  baselineDate: string | null;
  parameters: HistoryParameterResult[];
  dimensions: HistoryDimensionResult[];
  targetKeys: string[];
};

export type EvaluationHistoryInput = {
  sessions: HistorySessionRow[];
  trainings: HistoryTrainingRow[];
  targets: HistorySessionTargetRow[];
  exerciseTargets: HistoryExerciseTargetRow[];
  observations: HistoryObservationRow[];
  trainingExercises: HistoryTrainingExerciseRow[];
};

export type ComparabilityResult = {
  level: ComparabilityLevel;
  delta: number | null;
  exerciseOverlap: number;
  contextOverlap: number;
  sessionTargetOverlap: number;
  daysApart: number;
  reasons: string[];
  cautions: string[];
};

export type SessionComparison = {
  level: ComparabilityLevel;
  targetOverlap: number;
  commonParameterKeys: string[];
  parameterComparisons: Array<{ previous: HistoryParameterResult; current: HistoryParameterResult; comparison: ComparabilityResult }>;
  reasons: string[];
};

const reliabilityRank: Record<EvaluationReliability, number> = { INSUFFICIENT: 0, LIMITED: 1, GOOD: 2, STRONG: 3 };
const comparabilityRank: Record<ComparabilityLevel, number> = { NOT_COMPARABLE: 0, LOW_COMPARABILITY: 1, PARTIALLY_COMPARABLE: 2, COMPARABLE: 3 };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function historyParameterKey(target: Pick<HistorySessionTargetRow, "target_type" | "technical_subcategory_id" | "physical_objective_id">) {
  return target.target_type === "Technical" ? `Technical:${target.technical_subcategory_id}` : `Physical:${target.physical_objective_id}`;
}

function profileFor(target: HistorySessionTargetRow): HistoryProfile {
  if (target.target_type === "Physical") return "PHYSICAL OBSERVABLE PROFILE";
  const name = normalize(target.parameter_name_snapshot);
  return ["decisione", "stimolo percettivo", "disturbo percettivo"].some(query => name.includes(query)) ? "PERCEPTUAL / DECISIONAL PROFILE" : "TECHNICAL PROFILE";
}

function intersectionRatio(a: string[], b: string[]) {
  const left = new Set(a), right = new Set(b);
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  return round([...left].filter(value => right.has(value)).length / union.size, 3);
}

function daysBetween(a: string, b: string) {
  return Math.round(Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86_400_000);
}

function minimumLevel(current: ComparabilityLevel, cap: ComparabilityLevel) {
  return comparabilityRank[current] <= comparabilityRank[cap] ? current : cap;
}

function buildDimensions(sessionId: string, date: string, scaleId: string, parameters: HistoryParameterResult[]): HistoryDimensionResult[] {
  return EVALUATION_PRESENTATION_DIMENSIONS.map(dimension => {
    const matching = parameters.filter(parameter => parameter.profile === dimension.profile && dimension.queries.some(query => normalize(parameter.name).includes(normalize(query))));
    const evaluable = matching.filter(parameter => parameter.weightedScore != null && parameter.totalWeight > 0);
    const totalWeight = evaluable.reduce((sum, parameter) => sum + parameter.totalWeight, 0);
    const score = totalWeight ? evaluable.reduce((sum, parameter) => sum + parameter.weightedScore! * parameter.totalWeight, 0) / totalWeight : null;
    const reliability: EvaluationReliability = evaluable.length === 0 ? "INSUFFICIENT" : evaluable.every(parameter => parameter.reliability === "STRONG") ? "STRONG" : evaluable.some(parameter => reliabilityRank[parameter.reliability] >= reliabilityRank.GOOD) ? "GOOD" : "LIMITED";
    return {
      name: dimension.name,
      profile: dimension.profile,
      sessionId,
      date,
      scaleId,
      score: score == null ? null : round(score, 3),
      normalizedScore: score == null ? null : round(((score - 1) / 4) * 100),
      reliability,
      parameterKeys: matching.map(parameter => parameter.key).sort(),
    };
  });
}

export function buildGoalkeeperEvaluationHistory(input: EvaluationHistoryInput): GoalkeeperEvaluationHistorySession[] {
  const trainingById = new Map(input.trainings.map(training => [training.id, training]));
  const sessionById = new Map(input.sessions.map(session => [session.id, session]));
  const trainingExerciseById = new Map(input.trainingExercises.map(item => [item.id, item]));
  const trainingExercisesByTraining = new Map<string, HistoryTrainingExerciseRow[]>();
  for (const item of input.trainingExercises) trainingExercisesByTraining.set(item.training_id, [...(trainingExercisesByTraining.get(item.training_id) ?? []), item]);
  const targetsBySession = new Map<string, HistorySessionTargetRow[]>();
  for (const target of input.targets) targetsBySession.set(target.evaluation_session_id, [...(targetsBySession.get(target.evaluation_session_id) ?? []), target]);
  const exerciseTargetBySession = new Map<string, HistoryExerciseTargetRow[]>();
  for (const link of input.exerciseTargets) exerciseTargetBySession.set(link.evaluation_session_id, [...(exerciseTargetBySession.get(link.evaluation_session_id) ?? []), link]);
  const observationsByLink = new Map<string, HistoryObservationRow[]>();
  for (const observation of input.observations) observationsByLink.set(observation.evaluation_exercise_target_id, [...(observationsByLink.get(observation.evaluation_exercise_target_id) ?? []), observation]);

  const built = input.sessions.filter(session => session.status === "Completed" && session.completed_at).map<GoalkeeperEvaluationHistorySession | null>(session => {
    const training = trainingById.get(session.training_id);
    if (!training) return null;
    const links = exerciseTargetBySession.get(session.id) ?? [];
    const sessionTargets = targetsBySession.get(session.id) ?? [];
    const parameters = sessionTargets.map(target => {
      const targetLinks = links.filter(link => link.session_target_id === target.id);
      const allObservations = targetLinks.flatMap(link => (observationsByLink.get(link.id) ?? []).map(observation => ({ observation, link })));
      const valid = allObservations.filter(item => item.observation.observation_status === "OBSERVED" && item.observation.score != null);
      const aggregate = aggregateParameterScore(valid.map(item => ({
        exerciseId: trainingExerciseById.get(item.link.training_exercise_id)?.exercise_id ?? item.link.training_exercise_id,
        score: item.observation.score!,
        observability: Number(item.link.observability_weight),
        suitability: Number(item.link.selection_weight),
        confidence: Number(item.observation.confidence ?? 1),
      })));
      const exerciseRows = valid.map(item => trainingExerciseById.get(item.link.training_exercise_id)).filter((item): item is HistoryTrainingExerciseRow => Boolean(item));
      const exerciseIds = [...new Set(exerciseRows.map(item => item.exercise_id))].sort();
      const contexts = [...new Set(exerciseRows.map(item => item.exercise?.fase).filter((item): item is string => Boolean(item)))].sort();
      const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      const averageWeight = valid.length ? aggregate.totalWeight / valid.length : 0;
      const notObservedDecisions = allObservations.filter(item => item.observation.observation_status === "NOT_OBSERVED").length;
      return {
        key: historyParameterKey(target), sessionTargetId: target.id, sessionId: session.id, sessionType: session.evaluation_type,
        date: training.training_date, scaleId: session.scale_id, name: target.parameter_name_snapshot, targetType: target.target_type,
        physicalDimensionId: target.physical_dimension_id, profile: profileFor(target), validObservations: valid.length,
        notObservedDecisions, distinctExercises: exerciseIds.length, distinctContexts: contexts.length, exerciseIds, contexts,
        weightedScore: aggregate.score, normalizedScore: aggregate.normalizedScore, totalWeight: aggregate.totalWeight,
        averageSuitability: round(average(valid.map(item => Number(item.link.selection_weight))), 3),
        averageObservability: round(average(valid.map(item => Number(item.link.observability_weight))), 3),
        averageConfidence: round(average(valid.map(item => Number(item.observation.confidence ?? 1))), 3),
        reliability: reliabilityFor({ validObservations: valid.length, distinctExercises: exerciseIds.length, distinctContexts: contexts.length, averageWeight }),
        state: valid.length ? "EVALUATED" : notObservedDecisions ? "NOT_OBSERVABLE" : "NOT_EVALUATED",
      } satisfies HistoryParameterResult;
    });
    const exerciseCount = new Set((trainingExercisesByTraining.get(training.id) ?? []).map(item => item.id)).size;
    return {
      id: session.id, goalkeeperId: session.goalkeeper_id, trainingId: training.id, evaluationType: session.evaluation_type,
      date: training.training_date, completedAt: session.completed_at!, durationMinutes: Number(training.planned_duration_minutes),
      exerciseCount, exerciseIds: (trainingExercisesByTraining.get(training.id) ?? []).map(item => item.exercise_id), scaleId: session.scale_id,
      baselineSessionId: session.previous_evaluation_session_id, baselineDate: null,
      parameters, dimensions: buildDimensions(session.id, training.training_date, session.scale_id, parameters),
      targetKeys: parameters.map(parameter => parameter.key).sort(),
    } satisfies GoalkeeperEvaluationHistorySession;
  }).filter((item): item is GoalkeeperEvaluationHistorySession => Boolean(item));
  return built.map(item => ({
    ...item,
    baselineDate: item.baselineSessionId ? trainingById.get(sessionById.get(item.baselineSessionId)?.training_id ?? "")?.training_date ?? null : null,
  })).sort((a, b) => b.date.localeCompare(a.date) || b.completedAt.localeCompare(a.completedAt));
}

export function compareParameterResults(previous: HistoryParameterResult, current: HistoryParameterResult, sessionTargetOverlap = 1): ComparabilityResult {
  const reasons: string[] = [], cautions: string[] = [];
  const exerciseOverlap = intersectionRatio(previous.exerciseIds, current.exerciseIds);
  const contextOverlap = intersectionRatio(previous.contexts, current.contexts);
  const daysApart = daysBetween(previous.date, current.date);
  const base = { delta: null, exerciseOverlap, contextOverlap, sessionTargetOverlap: round(sessionTargetOverlap, 3), daysApart, reasons, cautions };
  if (previous.key !== current.key) return { ...base, level: "NOT_COMPARABLE", cautions: ["Parametri differenti: il confronto diretto non è metodologicamente valido."] };
  reasons.push("Stesso parametro valutativo.");
  if (previous.scaleId !== current.scaleId) return { ...base, level: "NOT_COMPARABLE", cautions: ["Scale valutative differenti."] };
  reasons.push("Stessa versione della scala.");
  if (previous.weightedScore == null || current.weightedScore == null) return { ...base, level: "NOT_COMPARABLE", cautions: [previous.weightedScore == null ? "La valutazione precedente non contiene un risultato numerico valido." : "La valutazione corrente non contiene un risultato numerico valido."] };

  const bothReliable = reliabilityRank[previous.reliability] >= reliabilityRank.GOOD && reliabilityRank[current.reliability] >= reliabilityRank.GOOD;
  const enoughEvidence = previous.validObservations >= 2 && current.validObservations >= 2 && previous.distinctExercises >= 2 && current.distinctExercises >= 2;
  const sameType = previous.sessionType === current.sessionType;
  let level: ComparabilityLevel = bothReliable && enoughEvidence && exerciseOverlap >= .5 && sameType ? "COMPARABLE"
    : (reliabilityRank[previous.reliability] >= reliabilityRank.LIMITED && reliabilityRank[current.reliability] >= reliabilityRank.LIMITED && (exerciseOverlap > 0 || contextOverlap > 0)) ? "PARTIALLY_COMPARABLE"
      : "LOW_COMPARABILITY";

  if (exerciseOverlap >= .5) reasons.push("Almeno metà degli esercizi coincide."); else cautions.push(exerciseOverlap > 0 ? "Sovrapposizione esercizi limitata." : "Esercizi differenti.");
  if (contextOverlap >= .5) reasons.push("Contesti metodologici simili."); else cautions.push("Contesti metodologici differenti.");
  if (bothReliable) reasons.push("Affidabilità buona o forte in entrambe."); else cautions.push("Affidabilità non omogenea o limitata.");
  if (enoughEvidence) reasons.push("Almeno due osservazioni e due esercizi distinti in entrambe."); else cautions.push("Evidenza osservativa ridotta in almeno una valutazione.");
  if (!sameType) { level = minimumLevel(level, "PARTIALLY_COMPARABLE"); cautions.push("Complete e Mirata non sono globalmente equivalenti."); }
  if (previous.sessionType === "Targeted" && current.sessionType === "Targeted" && sessionTargetOverlap < .5) { level = minimumLevel(level, sessionTargetOverlap === 0 ? "NOT_COMPARABLE" : "LOW_COMPARABILITY"); cautions.push("Le due valutazioni mirate hanno pochi target in comune."); }
  if (daysApart > 365) { level = minimumLevel(level, "PARTIALLY_COMPARABLE"); cautions.push("Intervallo temporale superiore a dodici mesi."); }
  return { ...base, level, delta: round(current.weightedScore - previous.weightedScore, 2), reasons, cautions };
}

export function compareHistorySessions(previous: GoalkeeperEvaluationHistorySession, current: GoalkeeperEvaluationHistorySession): SessionComparison {
  const targetOverlap = intersectionRatio(previous.targetKeys, current.targetKeys);
  const commonParameterKeys = previous.targetKeys.filter(key => current.targetKeys.includes(key));
  const parameterComparisons = commonParameterKeys.map(key => {
    const before = previous.parameters.find(parameter => parameter.key === key)!;
    const after = current.parameters.find(parameter => parameter.key === key)!;
    return { previous: before, current: after, comparison: compareParameterResults(before, after, targetOverlap) };
  });
  const reasons: string[] = [];
  let level: ComparabilityLevel;
  if (!commonParameterKeys.length) level = "NOT_COMPARABLE";
  else if (previous.evaluationType === "Targeted" && current.evaluationType === "Targeted" && targetOverlap < .5) level = targetOverlap === 0 ? "NOT_COMPARABLE" : "LOW_COMPARABILITY";
  else if (previous.evaluationType !== current.evaluationType) level = "PARTIALLY_COMPARABLE";
  else level = parameterComparisons.reduce<ComparabilityLevel>((best, item) => comparabilityRank[item.comparison.level] < comparabilityRank[best] ? item.comparison.level : best, "COMPARABLE");
  if (previous.evaluationType === current.evaluationType) reasons.push(`Entrambe le valutazioni sono ${previous.evaluationType === "Complete" ? "Complete" : "Mirate"}.`);
  else reasons.push("Tipologie differenti: confronto consentito soltanto sui parametri comuni.");
  reasons.push(`${commonParameterKeys.length} parametri comuni; sovrapposizione target ${Math.round(targetOverlap * 100)}%.`);
  return { level, targetOverlap, commonParameterKeys, parameterComparisons, reasons };
}

export function compareDimensionResults(previous: HistoryDimensionResult, current: HistoryDimensionResult) {
  const compositionOverlap = intersectionRatio(previous.parameterKeys, current.parameterKeys);
  if (previous.name !== current.name || previous.score == null || current.score == null || previous.scaleId !== current.scaleId) return { level: "NOT_COMPARABLE" as const, delta: null, compositionOverlap, compositionChanged: compositionOverlap < 1 };
  let level: ComparabilityLevel = compositionOverlap >= .75 && reliabilityRank[previous.reliability] >= reliabilityRank.GOOD && reliabilityRank[current.reliability] >= reliabilityRank.GOOD ? "COMPARABLE" : compositionOverlap >= .5 ? "PARTIALLY_COMPARABLE" : compositionOverlap > 0 ? "LOW_COMPARABILITY" : "NOT_COMPARABLE";
  if (daysBetween(previous.date, current.date) > 365) level = minimumLevel(level, "PARTIALLY_COMPARABLE");
  return { level, delta: level === "NOT_COMPARABLE" ? null : round(current.score - previous.score, 2), compositionOverlap, compositionChanged: compositionOverlap < 1 };
}

export function buildParameterTimelines(sessions: GoalkeeperEvaluationHistorySession[]) {
  const timelines = new Map<string, { key: string; name: string; targetType: "Technical" | "Physical"; profile: HistoryProfile; entries: HistoryParameterResult[] }>();
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) for (const parameter of session.parameters) {
    const current = timelines.get(parameter.key) ?? { key: parameter.key, name: parameter.name, targetType: parameter.targetType, profile: parameter.profile, entries: [] };
    current.entries.push(parameter);
    timelines.set(parameter.key, current);
  }
  return [...timelines.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
}
