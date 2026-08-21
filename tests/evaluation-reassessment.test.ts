import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildParameterTimelines, compareHistorySessions, type GoalkeeperEvaluationHistorySession, type HistoryParameterResult } from "../lib/evaluation-history.ts";
import { baselineResultFor, buildReassessmentChain, isBaselineTargetSubset, planReassessment, validateReassessmentBaseline } from "../lib/evaluation-reassessment.ts";
import type { EvaluationMapping } from "../lib/evaluation-mapping-audit.ts";
import type { EvaluationMappingDecision } from "../lib/evaluation-session-engine.ts";
import type { ProductionEvaluationTarget } from "../lib/evaluation-production.ts";
import type { Exercise } from "../lib/types.ts";

function exercise(id: string, patch: Partial<Exercise> = {}): Exercise {
  return { id, codice: id, nome: id, category_id: 1, subcategory_id: 10, categoria: "Test", sottocategoria: "Presa alta", fase: "Analitico", obiettivo: "Test", descrizione: "Test", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, attivo: true, physical_mappings: [], ...patch };
}

function parameter(patch: Partial<HistoryParameterResult> = {}): HistoryParameterResult {
  return { key: "Technical:10", sessionTargetId: "target-1", sessionId: "baseline", sessionType: "Complete", date: "2026-01-10", scaleId: "scale-1", name: "Presa alta", targetType: "Technical", physicalDimensionId: null, profile: "TECHNICAL PROFILE", validObservations: 3, notObservedDecisions: 0, distinctExercises: 2, distinctContexts: 1, exerciseIds: ["E1", "E2"], contexts: ["Analitico"], weightedScore: 3.2, normalizedScore: 55, totalWeight: 2, averageSuitability: .9, averageObservability: .9, averageConfidence: 1, reliability: "GOOD", state: "EVALUATED", ...patch };
}

function session(id = "baseline", type: "Complete" | "Targeted" | "Reassessment" = "Complete", patch: Partial<GoalkeeperEvaluationHistorySession> = {}): GoalkeeperEvaluationHistorySession {
  const parameters = patch.parameters ?? [parameter({ sessionId: id, sessionType: type })];
  return { id, goalkeeperId: "keeper-1", trainingId: `training-${id}`, evaluationType: type, date: "2026-01-10", completedAt: "2026-01-10T18:00:00Z", durationMinutes: 60, exerciseCount: 2, exerciseIds: ["E1", "E2"], scaleId: "scale-1", baselineSessionId: null, baselineDate: null, parameters, dimensions: [], targetKeys: parameters.map(item => item.key), ...patch };
}

function mapping(item: Exercise, suitability = .82): EvaluationMappingDecision {
  const value: EvaluationMapping = { id: `map-${item.id}`, exercise: item, targetType: "TECHNICAL", targetId: "10", targetCode: "T10", targetName: "Presa alta", aggregateName: "Tecnica", role: "PRIMARY", evaluationSuitability: suitability, observabilityWeight: .85, specificityWeight: .85, confidence: "HIGH", evidenceNotes: "Test", tacticalFamily: "HIGH_CLAIM", complexity: "LOW" };
  return { mapping: value, mappingStatus: "auto_approved", active: true, reason: "test" };
}

const target: ProductionEvaluationTarget = { key: "TECHNICAL:10", targetType: "TECHNICAL", targetId: "10", code: "T10", name: "Presa alta", aggregateName: "Tecnica", health: "STRONG", requiredObservations: 1, requiredDistinctExercises: 1, priority: 5, technicalSubcategoryId: 10, physicalObjectiveId: null, physicalDimensionId: null, physicalDimensionName: null };

test("valid baseline requires Completed, same goalkeeper, owner and no self-reference", () => {
  assert.equal(validateReassessmentBaseline({ baselineId: "one", baselineStatus: "Completed", baselineGoalkeeperId: "g", requestedGoalkeeperId: "g", baselineOwnerId: "u", requestedOwnerId: "u" }).valid, true);
  assert.equal(validateReassessmentBaseline({ baselineId: "one", baselineStatus: "Ready", baselineGoalkeeperId: "g", requestedGoalkeeperId: "g" }).valid, false);
  assert.equal(validateReassessmentBaseline({ baselineId: "one", baselineStatus: "Completed", baselineGoalkeeperId: "g1", requestedGoalkeeperId: "g2" }).valid, false);
  assert.equal(validateReassessmentBaseline({ baselineId: "one", newSessionId: "one", baselineStatus: "Completed", baselineGoalkeeperId: "g", requestedGoalkeeperId: "g" }).valid, false);
  assert.equal(validateReassessmentBaseline({ baselineId: "one", baselineStatus: "Completed", baselineGoalkeeperId: "g", requestedGoalkeeperId: "g", baselineOwnerId: "u1", requestedOwnerId: "u2" }).valid, false);
});

test("same targets and subset are valid, external target is rejected", () => {
  const baseline = session("baseline", "Complete", { targetKeys: ["Technical:10", "Physical:p1"] });
  assert.equal(isBaselineTargetSubset(baseline, baseline.targetKeys), true);
  assert.equal(isBaselineTargetSubset(baseline, ["Technical:10"]), true);
  assert.equal(isBaselineTargetSubset(baseline, ["Technical:99"]), false);
  assert.equal(isBaselineTargetSubset(baseline, []), false);
});

test("same exercise receives a moderate bonus and remains preferred when valid", () => {
  const baseline = session();
  const e1 = exercise("E1"), e3 = exercise("E3", { fase: "Situazionale" });
  const plan = planReassessment({ baseline, selectedHistoryKeys: baseline.targetKeys, targets: [target], exercises: [e1, e3], decisions: [mapping(e1, .8), mapping(e3, .84)], maximumDuration: 30, minimumObservations: 1, contextPreference: "Bilanciata" });
  assert.equal(plan.result.selectedExercises[0]?.exercise.id, "E1");
  assert.deepEqual(plan.sameBaselineExerciseIds, ["E1"]);
  assert.equal(plan.result.estimatedDuration, 20);
});

test("inactive baseline exercise is replaced without blind duplication", () => {
  const baseline = session();
  const inactive = exercise("E1", { attivo: false }), replacement = exercise("E3");
  const plan = planReassessment({ baseline, selectedHistoryKeys: baseline.targetKeys, targets: [target], exercises: [inactive, replacement], decisions: [mapping(inactive), mapping(replacement)], maximumDuration: 30, minimumObservations: 1, contextPreference: "Bilanciata" });
  assert.deepEqual(plan.result.selectedExercises.map(item => item.exercise.id), ["E3"]);
  assert.deepEqual(plan.replacementExerciseIds, ["E3"]);
});

test("expected comparability distinguishes continuity from replacement", () => {
  const baseline = session("baseline", "Complete", { exerciseIds: ["E1"] });
  const same = exercise("E1"), other = exercise("E9", { fase: "Situazionale" });
  const high = planReassessment({ baseline, selectedHistoryKeys: baseline.targetKeys, targets: [target], exercises: [same], decisions: [mapping(same)], maximumDuration: 30, minimumObservations: 1, contextPreference: "Bilanciata" });
  const limited = planReassessment({ baseline, selectedHistoryKeys: baseline.targetKeys, targets: [target], exercises: [other], decisions: [mapping(other)], maximumDuration: 30, minimumObservations: 1, contextPreference: "Bilanciata" });
  assert.equal(high.expectedComparability, "HIGH");
  assert.equal(limited.expectedComparability, "LIMITED");
});

test("NOT_OBSERVED baseline remains non numeric", () => {
  const result = baselineResultFor(parameter({ weightedScore: null, normalizedScore: null, validObservations: 0, notObservedDecisions: 2, state: "NOT_OBSERVABLE", reliability: "INSUFFICIENT" }));
  assert.equal(result.score, null);
  assert.equal(result.label, "Non valutato");
  assert.match(result.detail, /2 occasioni non osservabili/);
});

test("reassessment chain supports reassessment of reassessment", () => {
  const baseline = session("base");
  const one = session("r1", "Reassessment", { baselineSessionId: "base", date: "2026-02-10" });
  const two = session("r2", "Reassessment", { baselineSessionId: "r1", date: "2026-03-10" });
  assert.deepEqual(buildReassessmentChain([two, baseline, one], "r2").map(item => item.id), ["base", "r1", "r2"]);
});

test("completed reassessment enters existing parameter history and final comparison", () => {
  const baseline = session("base");
  const reassessment = session("r1", "Reassessment", { baselineSessionId: "base", date: "2026-03-10", parameters: [parameter({ sessionId: "r1", sessionType: "Reassessment", date: "2026-03-10", weightedScore: 3.8 })] });
  assert.deepEqual(buildParameterTimelines([reassessment, baseline])[0]?.entries.map(item => item.sessionId), ["base", "r1"]);
  const comparison = compareHistorySessions(baseline, reassessment);
  assert.equal(comparison.commonParameterKeys.length, 1);
  assert.equal(comparison.parameterComparisons[0]?.comparison.level, "PARTIALLY_COMPARABLE");
});

test("migration enforces ownership, completed baseline, same goalkeeper and immutable baseline", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0034_goalkeeper_reassessment_v1.sql", import.meta.url), "utf8");
  assert.match(sql, /previous_evaluation_session_id/);
  assert.match(sql, /baseline\.status <> 'Completed'/);
  assert.match(sql, /baseline\.goalkeeper_id <> new\.goalkeeper_id/);
  assert.match(sql, /id = new\.previous_evaluation_session_id and owner_id = new\.owner_id/);
  assert.match(sql, /new\.id = new\.previous_evaluation_session_id/);
  assert.match(sql, /I target della Rivalutazione devono essere un sottoinsieme della baseline/);
  assert.doesNotMatch(sql, /update public\.evaluation_sessions\s+set[\s\S]{0,200}where id = baseline\.id/i);
  assert.doesNotMatch(sql, /insert into public\.evaluation_observations/i);
});

test("reassessment RPC is authenticated-only and reuses production creation", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0034_goalkeeper_reassessment_v1.sql", import.meta.url), "utf8");
  assert.match(sql, /current_owner uuid := auth\.uid\(\)/);
  assert.match(sql, /public\.create_evaluation_training\(/);
  assert.match(sql, /revoke all on function public\.create_reassessment_training[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.create_reassessment_training[\s\S]*to authenticated/i);
});

test("completed evaluation deletion is explicit, owner scoped and preserves used baselines", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0037_controlled_completed_evaluation_deletion.sql", import.meta.url), "utf8");
  assert.match(sql, /current_owner uuid := auth\.uid\(\)/i);
  assert.match(sql, /id = requested_session_id[\s\S]*owner_id = current_owner/i);
  assert.match(sql, /previous_evaluation_session_id = target_session\.id/i);
  assert.match(sql, /controlled_evaluation_delete/i);
  assert.match(sql, /delete from public\.trainings[\s\S]*owner_id = current_owner/i);
  assert.match(sql, /revoke all on function public\.delete_owned_evaluation_training\(uuid\)[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.delete_owned_evaluation_training\(uuid\)[\s\S]*to authenticated/i);
});
