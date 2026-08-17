import { aggregateParameterScore } from "./evaluation-session-engine.ts";
import type { Exercise } from "./types.ts";

export type EvaluationObservationStatus = "OBSERVED" | "NOT_OBSERVED";
export type EvaluationReliability = "INSUFFICIENT" | "LIMITED" | "GOOD" | "STRONG";
export type EvaluationExerciseState = "NOT_STARTED" | "PARTIAL" | "OBSERVED";

export type EvaluationScaleLevel = { score: number; label: string; description: string };
export type EvaluationFieldTarget = {
  exercise_target_id: string;
  session_target_id: string;
  target_type: "Technical" | "Physical";
  parameter_name: string;
  technical_name: string | null;
  physical_dimension_id: string | null;
  physical_dimension_name: string | null;
  physical_objective_id: string | null;
  fis_code: string | null;
  fis_name: string | null;
  observability_weight: number;
  suitability_weight: number;
  evidence_notes: string;
  coverage_status: string;
};
export type EvaluationFieldExercise = {
  training_exercise_id: string;
  position: number;
  planned_duration_minutes: number;
  exercise: Exercise;
  targets: EvaluationFieldTarget[];
};
export type EvaluationFieldObservation = {
  id: string;
  exercise_target_id: string;
  observation_number: number;
  score: number | null;
  observation_status: EvaluationObservationStatus;
  notes: string | null;
  confidence: number | null;
  observed_at: string;
};
export type EvaluationFieldPayload = {
  session: {
    id: string;
    training_id: string;
    status: "Ready" | "InProgress" | "Completed" | "Cancelled" | "Draft";
    evaluation_type: "Complete" | "Targeted" | "Custom" | "Reassessment";
    started_at: string | null;
    completed_at: string | null;
    minimum_observations: number;
    date: string;
    goalkeeper_id: string;
    goalkeeper_name: string;
  };
  scale_levels: EvaluationScaleLevel[];
  exercises: EvaluationFieldExercise[];
  observations: EvaluationFieldObservation[];
};

export type EvaluationParameterResult = {
  sessionTargetId: string;
  name: string;
  targetType: "Technical" | "Physical";
  profile: "TECHNICAL PROFILE" | "PERCEPTUAL / DECISIONAL PROFILE" | "PHYSICAL OBSERVABLE PROFILE";
  physicalDimensionName: string | null;
  fisName: string | null;
  validObservations: number;
  notObserved: number;
  distinctExercises: number;
  distinctContexts: number;
  weightedScore: number | null;
  normalizedScore: number | null;
  totalWeight: number;
  reliability: EvaluationReliability;
  observations: Array<EvaluationFieldObservation & { exercise: Exercise; target: EvaluationFieldTarget; level: EvaluationScaleLevel | null }>;
};

export type PhysicalDisplay = {
  dimensionName: string | null;
  fisName: string;
  resolved: boolean;
};

export const EVALUATION_PRESENTATION_DIMENSIONS = Object.freeze([
  { name: "Difesa della porta", profile: "TECHNICAL PROFILE", queries: ["presa alta", "presa rasoterra", "tuffo", "doppio intervento"] },
  { name: "Gestione dello spazio", profile: "TECHNICAL PROFILE", queries: ["centralita", "profondita", "riallineamento"] },
  { name: "Gestione 1vs1", profile: "TECHNICAL PROFILE", queries: ["1vs1", "finalizzazioni"] },
  { name: "Gioco di piede", profile: "TECHNICAL PROFILE", queries: ["controllo orientato", "cambio gioco", "trasmissione", "gioco di piede"] },
  { name: "Palle alte", profile: "TECHNICAL PROFILE", queries: ["uscite alte", "presa alta"] },
  { name: "Percezione e decisione", profile: "PERCEPTUAL / DECISIONAL PROFILE", queries: ["decisione", "stimolo percettivo", "disturbo percettivo"] },
  { name: "Reattivita osservabile", profile: "PHYSICAL OBSERVABLE PROFILE", queries: ["reazione", "reattivita"] },
  { name: "Controllo del movimento", profile: "PHYSICAL OBSERVABLE PROFILE", queries: ["controllo dinamico", "arresto", "ripartenza", "orientamento spazio temporale"] },
] as const);

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function resolvePhysicalDisplay(input: { physicalDimensionName?: string | null; fisName?: string | null; parameterName: string }): PhysicalDisplay {
  const explicitDimension = input.physicalDimensionName?.trim() || null;
  const fisName = input.fisName?.trim() || input.parameterName;
  if (explicitDimension) return { dimensionName: explicitDimension, fisName, resolved: true };

  const searchable = normalize(`${input.parameterName} ${fisName}`);
  const inferred = EVALUATION_PRESENTATION_DIMENSIONS.find(dimension =>
    dimension.profile === "PHYSICAL OBSERVABLE PROFILE"
    && dimension.queries.some(query => searchable.includes(normalize(query))),
  );
  return { dimensionName: inferred?.name ?? null, fisName, resolved: Boolean(inferred) };
}

function profileFor(target: EvaluationFieldTarget): EvaluationParameterResult["profile"] {
  if (target.target_type === "Physical") return "PHYSICAL OBSERVABLE PROFILE";
  const name = normalize(target.parameter_name);
  return ["decisione", "stimolo percettivo", "disturbo percettivo"].some(query => name.includes(query)) ? "PERCEPTUAL / DECISIONAL PROFILE" : "TECHNICAL PROFILE";
}

export function reliabilityFor(input: { validObservations: number; distinctExercises: number; distinctContexts: number; averageWeight: number }): EvaluationReliability {
  if (input.validObservations === 0) return "INSUFFICIENT";
  if (input.validObservations === 1) return "LIMITED";
  if (input.validObservations >= 3 && input.distinctExercises >= 2 && input.distinctContexts >= 2 && input.averageWeight >= .7) return "STRONG";
  if (input.validObservations >= 2 && input.distinctExercises >= 2 && input.averageWeight >= .55) return "GOOD";
  return "LIMITED";
}

export function exerciseEvaluationState(exercise: EvaluationFieldExercise, observations: EvaluationFieldObservation[]): EvaluationExerciseState {
  if (!exercise.targets.length) return "OBSERVED";
  const decided = exercise.targets.filter(target => observations.some(observation => observation.exercise_target_id === target.exercise_target_id)).length;
  if (decided === 0) return "NOT_STARTED";
  return decided === exercise.targets.length ? "OBSERVED" : "PARTIAL";
}

export function buildEvaluationResults(payload: EvaluationFieldPayload): EvaluationParameterResult[] {
  const links = payload.exercises.flatMap(exercise => exercise.targets.map(target => ({ exercise, target })));
  const grouped = new Map<string, typeof links>();
  for (const link of links) grouped.set(link.target.session_target_id, [...(grouped.get(link.target.session_target_id) ?? []), link]);
  return [...grouped.entries()].map(([sessionTargetId, targetLinks]) => {
    const target = targetLinks[0].target;
    const linkById = new Map(targetLinks.map(link => [link.target.exercise_target_id, link]));
    const all = payload.observations.filter(observation => linkById.has(observation.exercise_target_id));
    const valid = all.filter(observation => observation.observation_status === "OBSERVED" && observation.score != null);
    const aggregate = aggregateParameterScore(valid.map(observation => {
      const link = linkById.get(observation.exercise_target_id)!;
      return { exerciseId: link.exercise.training_exercise_id, score: observation.score!, observability: Number(link.target.observability_weight), suitability: Number(link.target.suitability_weight), confidence: Number(observation.confidence ?? 1) };
    }));
    const exercises = new Set(valid.map(observation => linkById.get(observation.exercise_target_id)!.exercise.training_exercise_id));
    const contexts = new Set(valid.map(observation => linkById.get(observation.exercise_target_id)!.exercise.exercise.fase));
    const averageWeight = valid.length ? aggregate.totalWeight / valid.length : 0;
    return {
      sessionTargetId, name: target.parameter_name, targetType: target.target_type, profile: profileFor(target),
      physicalDimensionName: target.physical_dimension_name, fisName: target.fis_name,
      validObservations: valid.length, notObserved: all.filter(observation => observation.observation_status === "NOT_OBSERVED").length,
      distinctExercises: exercises.size, distinctContexts: contexts.size,
      weightedScore: aggregate.score, normalizedScore: aggregate.normalizedScore, totalWeight: aggregate.totalWeight,
      reliability: reliabilityFor({ validObservations: valid.length, distinctExercises: exercises.size, distinctContexts: contexts.size, averageWeight }),
      observations: all.map(observation => {
        const link = linkById.get(observation.exercise_target_id)!;
        return { ...observation, exercise: link.exercise.exercise, target: link.target, level: payload.scale_levels.find(level => level.score === observation.score) ?? null };
      }),
    };
  });
}

export function evaluationLiveSummary(payload: EvaluationFieldPayload) {
  const results = buildEvaluationResults(payload);
  const exerciseStates = payload.exercises.map(exercise => exerciseEvaluationState(exercise, payload.observations));
  const targetStates = results.map(result => result.validObservations > 0 ? "OBSERVED" : result.notObserved > 0 ? "NOT_OBSERVED" : "UNDECIDED");
  return {
    exercisesCompleted: exerciseStates.filter(state => state === "OBSERVED").length,
    exercisesPartial: exerciseStates.filter(state => state === "PARTIAL").length,
    exercisesNotStarted: exerciseStates.filter(state => state === "NOT_STARTED").length,
    parametersObserved: targetStates.filter(state => state === "OBSERVED").length,
    parametersNotObserved: targetStates.filter(state => state === "NOT_OBSERVED").length,
    parametersUndecided: targetStates.filter(state => state === "UNDECIDED").length,
    parametersTotal: results.length,
    validObservationsTotal: payload.observations.filter(observation => observation.observation_status === "OBSERVED" && observation.score != null).length,
    observationsTotal: payload.observations.length,
    notObservedTotal: payload.observations.filter(observation => observation.observation_status === "NOT_OBSERVED").length,
  };
}

export function buildPresentationDimensions(results: EvaluationParameterResult[]) {
  return EVALUATION_PRESENTATION_DIMENSIONS.map(dimension => {
    const parameters = results.filter(result => result.profile === dimension.profile && dimension.queries.some(query => normalize(result.name).includes(normalize(query))));
    const evaluable = parameters.filter(result => result.weightedScore != null);
    const totalWeight = evaluable.reduce((sum, result) => sum + result.totalWeight, 0);
    const score = totalWeight > 0 ? evaluable.reduce((sum, result) => sum + result.weightedScore! * result.totalWeight, 0) / totalWeight : null;
    const reliability: EvaluationReliability = evaluable.length === 0 ? "INSUFFICIENT" : evaluable.every(result => result.reliability === "STRONG") ? "STRONG" : evaluable.some(result => result.reliability === "GOOD" || result.reliability === "STRONG") ? "GOOD" : "LIMITED";
    return { ...dimension, parameters, score: score == null ? null : Number(score.toFixed(3)), normalizedScore: score == null ? null : Number((((score - 1) / 4) * 100).toFixed(2)), reliability };
  });
}
