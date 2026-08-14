import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoalkeeperEvaluationHistory,
  buildParameterTimelines,
  compareDimensionResults,
  compareHistorySessions,
  compareParameterResults,
  type EvaluationHistoryInput,
  type GoalkeeperEvaluationHistorySession,
  type HistoryParameterResult,
} from "../lib/evaluation-history.ts";

const parameter = (overrides: Partial<HistoryParameterResult> = {}): HistoryParameterResult => ({
  key: "Technical:10",
  sessionTargetId: "target-1",
  sessionId: "session-1",
  sessionType: "Complete",
  date: "2026-01-10",
  scaleId: "scale-v1",
  name: "Presa alta",
  targetType: "Technical",
  physicalDimensionId: null,
  profile: "TECHNICAL PROFILE",
  validObservations: 3,
  notObservedDecisions: 0,
  distinctExercises: 3,
  distinctContexts: 2,
  exerciseIds: ["exercise-1", "exercise-2", "exercise-3"],
  contexts: ["Analitico", "Situazionale"],
  weightedScore: 3,
  normalizedScore: 50,
  totalWeight: 2.4,
  averageSuitability: 0.9,
  averageObservability: 0.9,
  averageConfidence: 1,
  reliability: "GOOD",
  state: "EVALUATED",
  ...overrides,
});

const historySession = (id: string, date: string, parameters: HistoryParameterResult[], type: "Complete" | "Targeted" = "Complete"): GoalkeeperEvaluationHistorySession => ({
  id,
  goalkeeperId: "keeper-1",
  trainingId: `training-${id}`,
  evaluationType: type,
  date,
  completedAt: `${date}T18:00:00Z`,
  durationMinutes: 60,
  exerciseCount: 3,
  exerciseIds: ["exercise-1", "exercise-2", "exercise-3"],
  scaleId: "scale-v1",
  baselineSessionId: null,
  baselineDate: null,
  parameters,
  dimensions: [],
  targetKeys: parameters.map(item => item.key).sort(),
});

test("history includes only Completed sessions and orders newest first", () => {
  const input: EvaluationHistoryInput = {
    sessions: [
      { id: "old", training_id: "training-old", goalkeeper_id: "keeper-1", evaluation_type: "Complete", previous_evaluation_session_id: null, status: "Completed", scale_id: "scale-v1", started_at: null, completed_at: "2026-01-10T18:00:00Z" },
      { id: "new", training_id: "training-new", goalkeeper_id: "keeper-1", evaluation_type: "Complete", previous_evaluation_session_id: null, status: "Completed", scale_id: "scale-v1", started_at: null, completed_at: "2026-02-10T18:00:00Z" },
      { id: "open", training_id: "training-open", goalkeeper_id: "keeper-1", evaluation_type: "Targeted", previous_evaluation_session_id: null, status: "InProgress", scale_id: "scale-v1", started_at: null, completed_at: null },
    ],
    trainings: [
      { id: "training-old", training_date: "2026-01-10", planned_duration_minutes: 45 },
      { id: "training-new", training_date: "2026-02-10", planned_duration_minutes: 60 },
      { id: "training-open", training_date: "2026-03-10", planned_duration_minutes: 60 },
    ],
    targets: [], exerciseTargets: [], observations: [], trainingExercises: [],
  };
  assert.deepEqual(buildGoalkeeperEvaluationHistory(input).map(item => item.id), ["new", "old"]);
});

test("same reliable parameter and shared exercises is comparable", () => {
  const before = parameter();
  const after = parameter({ sessionId: "session-2", date: "2026-03-10", weightedScore: 3.8, exerciseIds: ["exercise-1", "exercise-2", "exercise-4"] });
  const comparison = compareParameterResults(before, after);
  assert.equal(comparison.level, "COMPARABLE");
  assert.equal(comparison.delta, 0.8);
});

test("different parameters or scales are never compared numerically", () => {
  assert.equal(compareParameterResults(parameter(), parameter({ key: "Technical:11" })).level, "NOT_COMPARABLE");
  assert.equal(compareParameterResults(parameter(), parameter({ scaleId: "scale-v2" })).level, "NOT_COMPARABLE");
});

test("limited evidence lowers comparability", () => {
  const before = parameter({ reliability: "LIMITED", validObservations: 1, distinctExercises: 1, exerciseIds: ["exercise-1"] });
  const after = parameter({ sessionId: "session-2", reliability: "LIMITED", validObservations: 1, distinctExercises: 1, exerciseIds: ["exercise-1"] });
  assert.equal(compareParameterResults(before, after).level, "PARTIALLY_COMPARABLE");
});

test("same parameter with different exercises is not treated as fully comparable", () => {
  const before = parameter({ exerciseIds: ["exercise-1", "exercise-2"] });
  const after = parameter({ sessionId: "session-2", exerciseIds: ["exercise-8", "exercise-9"] });
  assert.equal(compareParameterResults(before, after).level, "PARTIALLY_COMPARABLE");
});

test("NOT_OBSERVED remains non numeric and not comparable", () => {
  const notObserved = parameter({ weightedScore: null, normalizedScore: null, totalWeight: 0, validObservations: 0, notObservedDecisions: 2, reliability: "INSUFFICIENT", state: "NOT_OBSERVABLE" });
  const comparison = compareParameterResults(parameter(), notObserved);
  assert.equal(comparison.level, "NOT_COMPARABLE");
  assert.equal(comparison.delta, null);
});

test("dimension comparison reports composition changes", () => {
  const before = { name: "Difesa della porta", profile: "TECHNICAL PROFILE" as const, sessionId: "one", date: "2026-01-10", scaleId: "scale-v1", score: 3, normalizedScore: 50, reliability: "GOOD" as const, parameterKeys: ["a", "b", "c"] };
  const after = { ...before, sessionId: "two", date: "2026-03-10", score: 4, parameterKeys: ["a", "b", "d"] };
  const comparison = compareDimensionResults(before, after);
  assert.equal(comparison.compositionChanged, true);
  assert.equal(comparison.level, "PARTIALLY_COMPARABLE");
});

test("Complete sessions compare only common parameters without an overall score", () => {
  const before = historySession("one", "2026-01-10", [parameter()]);
  const after = historySession("two", "2026-03-10", [parameter({ sessionId: "two", weightedScore: 4 })]);
  const comparison = compareHistorySessions(before, after);
  assert.equal(comparison.level, "COMPARABLE");
  assert.deepEqual(comparison.commonParameterKeys, ["Technical:10"]);
  assert.equal(comparison.parameterComparisons[0]?.comparison.delta, 1);
  assert.equal("overallScore" in comparison, false);
});

test("a parameter present in only one session remains missing and is not fabricated", () => {
  const extra = parameter({ key: "Technical:99", name: "Parametro solo precedente" });
  const comparison = compareHistorySessions(
    historySession("one", "2026-01-10", [parameter(), extra]),
    historySession("two", "2026-03-10", [parameter({ sessionId: "two" })]),
  );
  assert.deepEqual(comparison.commonParameterKeys, ["Technical:10"]);
  assert.equal(comparison.parameterComparisons.some(item => item.previous.key === "Technical:99"), false);
});

test("Complete and Targeted sessions compare only their common parameter and are capped", () => {
  const before = historySession("one", "2026-01-10", [parameter()]);
  const after = historySession("two", "2026-03-10", [parameter({ sessionId: "two", sessionType: "Targeted" })], "Targeted");
  const comparison = compareHistorySessions(before, after);
  assert.equal(comparison.level, "PARTIALLY_COMPARABLE");
  assert.equal(comparison.parameterComparisons[0]?.comparison.level, "PARTIALLY_COMPARABLE");
});

test("Targeted comparisons require meaningful target overlap", () => {
  const shared = parameter({ sessionType: "Targeted" });
  const otherOne = parameter({ key: "Technical:11", name: "Presa bassa", sessionType: "Targeted" });
  const otherTwo = parameter({ key: "Technical:12", name: "Tuffo", sessionType: "Targeted" });
  const compatible = compareHistorySessions(
    historySession("one", "2026-01-10", [shared, otherOne], "Targeted"),
    historySession("two", "2026-03-10", [parameter({ sessionId: "two", sessionType: "Targeted" }), otherOne], "Targeted"),
  );
  const weak = compareHistorySessions(
    historySession("one", "2026-01-10", [shared, otherOne], "Targeted"),
    historySession("two", "2026-03-10", [parameter({ sessionId: "two", sessionType: "Targeted" }), otherTwo], "Targeted"),
  );
  assert.notEqual(compatible.level, "NOT_COMPARABLE");
  assert.equal(weak.level, "LOW_COMPARABILITY");
});

test("parameter timelines remain chronological from oldest to newest", () => {
  const sessions = [
    historySession("new", "2026-05-01", [parameter({ sessionId: "new", date: "2026-05-01" })]),
    historySession("old", "2026-01-01", [parameter({ sessionId: "old", date: "2026-01-01" })]),
  ];
  assert.deepEqual(buildParameterTimelines(sessions)[0]?.entries.map(item => item.sessionId), ["old", "new"]);
});
