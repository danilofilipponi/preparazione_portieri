import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EvaluationMapping, EvaluationMappingAuditReport, ParameterCoverage } from "../lib/evaluation-mapping-audit.ts";
import { aggregateParameterScore, bootstrapEvaluationMappings, createCoverageMatrix, isValidEvaluationTargetReference, normalizeEvaluationScore, planEvaluationSession, targetKey, type EvaluationEngineTarget, type EvaluationMappingDecision } from "../lib/evaluation-session-engine.ts";
import type { Exercise } from "../lib/types.ts";

function exercise(id: string, patch: Partial<Exercise> = {}): Exercise {
  return { id, codice: id, nome: `Esercizio ${id}`, category_id: 1, subcategory_id: 1, categoria: "Difesa porta", sottocategoria: "Tuffo", fase: "Analitico", obiettivo: "Tuffo", descrizione: "Tuffo ripetuto", durata_min: 10, portieri_min: 1, portieri_max: 3, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, attivo: true, physical_mappings: [], ...patch };
}

function mapping(item: Exercise, targetType: "TECHNICAL" | "PHYSICAL", targetId: string, patch: Partial<EvaluationMapping> = {}): EvaluationMapping {
  return { id: `${item.id}:${targetType}:${targetId}`, exercise: item, targetType, targetId, targetCode: targetId, targetName: targetId, aggregateName: targetType === "TECHNICAL" ? "Tecnica" : "Fisico", role: "PRIMARY", evaluationSuitability: .88, observabilityWeight: .9, specificityWeight: .86, confidence: "HIGH", evidenceNotes: "Evidenza controllata", tacticalFamily: "DIVE", complexity: "LOW", ...patch };
}

function decision(value: EvaluationMapping, patch: Partial<EvaluationMappingDecision> = {}): EvaluationMappingDecision {
  return { mapping: value, mappingStatus: "auto_approved", active: true, reason: "test", ...patch };
}

function target(targetType: "TECHNICAL" | "PHYSICAL", id: string, patch: Partial<EvaluationEngineTarget> = {}): EvaluationEngineTarget {
  return { key: targetKey(targetType, id), targetType, targetId: id, code: id, name: id, aggregateName: targetType === "TECHNICAL" ? "Tecnica" : "Fisico", health: "STRONG", feasibility: targetType === "PHYSICAL" ? "CATALOG_EVALUABLE" : undefined, requiredObservations: 2, requiredDistinctExercises: 2, priority: 5, ...patch };
}

function coverage(type: "TECHNICAL" | "PHYSICAL", id: string, patch: Partial<ParameterCoverage> = {}): ParameterCoverage {
  return { targetType: type, targetId: id, code: id, name: id, aggregateName: type, total: 3, evaluable: 3, good: 3, excellent: 1, contexts: ["Analitico", "Disturbo"], supportsTwoDistinctExercises: true, health: "STRONG", ...patch };
}

test("XOR: un target accetta esattamente un riferimento coerente", () => {
  assert.equal(isValidEvaluationTargetReference({ targetType: "TECHNICAL", technicalSubcategoryId: 1, physicalObjectiveId: null }), true);
  assert.equal(isValidEvaluationTargetReference({ targetType: "PHYSICAL", technicalSubcategoryId: null, physicalObjectiveId: "fis" }), true);
  assert.equal(isValidEvaluationTargetReference({ targetType: "TECHNICAL", technicalSubcategoryId: 1, physicalObjectiveId: "fis" }), false);
  assert.equal(isValidEvaluationTargetReference({ targetType: "PHYSICAL", technicalSubcategoryId: null, physicalObjectiveId: null }), false);
});

test("bootstrap: HIGH affidabile auto-approved, MEDIUM review, LOW rejected", () => {
  const item = exercise("E1"), high = mapping(item, "TECHNICAL", "T1"), medium = mapping(item, "TECHNICAL", "T2", { confidence: "MEDIUM", evaluationSuitability: .66 }), low = mapping(item, "PHYSICAL", "P1", { confidence: "LOW", evaluationSuitability: .34 });
  const report = { allMappings: [high, medium, low], highConfidence: [high], mediumConfidence: [medium], lowConfidence: [low], technicalCoverage: [coverage("TECHNICAL", "T1"), coverage("TECHNICAL", "T2")], physicalCoverage: [coverage("PHYSICAL", "P1")] } as EvaluationMappingAuditReport;
  const proposal = bootstrapEvaluationMappings(report);
  assert.deepEqual(proposal.decisions.map(row => [row.mappingStatus, row.active]), [["auto_approved", true], ["needs_review", false], ["rejected", false]]);
});

test("bootstrap: WEAK e protocol-only non diventano mapping attivi", () => {
  const item = exercise("E2"), weak = mapping(item, "TECHNICAL", "TW"), protocol = mapping(item, "PHYSICAL", "PP", { physicalFeasibility: "REQUIRES_DEDICATED_PROTOCOL" });
  const report = { allMappings: [weak, protocol], highConfidence: [weak, protocol], mediumConfidence: [], lowConfidence: [], technicalCoverage: [coverage("TECHNICAL", "TW", { health: "WEAK", evaluable: 1, good: 1 })], physicalCoverage: [coverage("PHYSICAL", "PP", { feasibility: "REQUIRES_DEDICATED_PROTOCOL" })] } as unknown as EvaluationMappingAuditReport;
  assert.ok(bootstrapEvaluationMappings(report).decisions.every(row => !row.active));
});

test("set cover privilegia un esercizio che copre due target", () => {
  const e1 = exercise("E1"), e2 = exercise("E2", { fase: "Disturbo" }), e3 = exercise("E3", { fase: "Situazionale" });
  const decisions = [decision(mapping(e1, "TECHNICAL", "T1")), decision(mapping(e1, "PHYSICAL", "P1")), decision(mapping(e2, "TECHNICAL", "T1")), decision(mapping(e3, "PHYSICAL", "P1"))];
  const result = planEvaluationSession({ evaluationType: "Targeted", exercises: [e1, e2, e3], mappingDecisions: decisions, selectedTargets: [target("TECHNICAL", "T1"), target("PHYSICAL", "P1")], maximumDuration: 40 });
  assert.equal(result.selectedExercises[0].exercise.id, "E1");
  assert.ok(result.coverageMatrix.every(row => row.status === "COVERED"));
});

test("ridondanza: non aggiunge esercizi dopo la copertura richiesta", () => {
  const e1 = exercise("R1"), e2 = exercise("R2"), t = target("TECHNICAL", "T", { requiredObservations: 1, requiredDistinctExercises: 1 });
  const result = planEvaluationSession({ evaluationType: "Targeted", exercises: [e1, e2], mappingDecisions: [decision(mapping(e1, "TECHNICAL", "T")), decision(mapping(e2, "TECHNICAL", "T"))], selectedTargets: [t], maximumDuration: 60 });
  assert.equal(result.selectedExercises.length, 1);
});

test("duration constraint: non supera la durata massima", () => {
  const e1 = exercise("D1", { durata_min: 25 }), e2 = exercise("D2", { durata_min: 15 });
  const result = planEvaluationSession({ evaluationType: "Targeted", exercises: [e1, e2], mappingDecisions: [decision(mapping(e1, "TECHNICAL", "T")), decision(mapping(e2, "TECHNICAL", "T"))], selectedTargets: [target("TECHNICAL", "T")], maximumDuration: 20 });
  assert.ok(result.estimatedDuration <= 20);
  assert.deepEqual(result.selectedExercises.map(row => row.exercise.id), ["D2"]);
});

test("uncovered target resta esplicitamente NOT COVERED", () => {
  const result = planEvaluationSession({ evaluationType: "Targeted", exercises: [], mappingDecisions: [], selectedTargets: [target("TECHNICAL", "MISSING")], maximumDuration: 30 });
  assert.equal(result.coverageMatrix[0].status, "NOT_COVERED");
  assert.equal(result.uncoveredTargets.length, 1);
});

test("protocol-only non genera esercizi arbitrari", () => {
  const e1 = exercise("P1"), protocolTarget = target("PHYSICAL", "PROTOCOL", { feasibility: "REQUIRES_DEDICATED_PROTOCOL" });
  const protocolMapping = mapping(e1, "PHYSICAL", "PROTOCOL", { physicalFeasibility: "REQUIRES_DEDICATED_PROTOCOL" });
  const result = planEvaluationSession({ evaluationType: "Targeted", exercises: [e1], mappingDecisions: [decision(protocolMapping)], selectedTargets: [protocolTarget], maximumDuration: 40 });
  assert.equal(result.selectedExercises.length, 0);
  assert.equal(result.coverageMatrix[0].status, "REQUIRES_PROTOCOL");
});

test("coverage matrix conta osservazioni, esercizi distinti e contesti", () => {
  const e1 = exercise("C1"), e2 = exercise("C2", { fase: "Disturbo" }), t = target("TECHNICAL", "T");
  const matrix = createCoverageMatrix([t], [{ exercise: e1, mappings: [decision(mapping(e1, "TECHNICAL", "T"))], selectionScore: 80, breakdown: {} as never, plannedObservations: 1 }, { exercise: e2, mappings: [decision(mapping(e2, "TECHNICAL", "T"))], selectionScore: 75, breakdown: {} as never, plannedObservations: 1 }]);
  assert.equal(matrix[0].observationCount, 2);
  assert.equal(matrix[0].distinctExercises, 2);
  assert.deepEqual(matrix[0].distinctContexts.sort(), ["Analitico", "Disturbo"]);
  assert.equal(matrix[0].status, "COVERED");
});

test("aggregazione usa score × observability × suitability × confidence", () => {
  const result = aggregateParameterScore([{ exerciseId: "A", score: 5, observability: 1, suitability: 1, confidence: 1 }, { exerciseId: "B", score: 1, observability: .5, suitability: 1, confidence: 1 }]);
  assert.equal(result.score, 3.667);
  assert.equal(result.normalizedScore, 66.67);
});

test("confidence assente vale 1.0", () => {
  const result = aggregateParameterScore([{ exerciseId: "A", score: 4, observability: .8, suitability: .9 }]);
  assert.equal(result.score, 4);
});

test("same-exercise weight cap limita ripetizioni dello stesso esercizio", () => {
  const result = aggregateParameterScore([{ exerciseId: "A", score: 5, observability: 1, suitability: 1 }, { exerciseId: "A", score: 5, observability: 1, suitability: 1 }, { exerciseId: "A", score: 5, observability: 1, suitability: 1 }], 1.25);
  assert.equal(result.totalWeight, 1.25);
  assert.equal(result.distinctExercises, 1);
});

test("normalizzazione conserva 1-5 e produce 0-100", () => {
  assert.equal(normalizeEvaluationScore(1), 0);
  assert.equal(normalizeEvaluationScore(3), 50);
  assert.equal(normalizeEvaluationScore(5), 100);
});

test("migration 0031 contiene scala, sette tabelle, XOR, ownership e RLS", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0031_evaluation_session_foundation.sql", import.meta.url), "utf8");
  for (const table of ["evaluation_scales", "evaluation_scale_levels", "exercise_evaluation_targets", "evaluation_sessions", "evaluation_session_targets", "evaluation_exercise_targets", "evaluation_observations"]) assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, /exercise_evaluation_targets_xor_check/);
  assert.match(sql, /evaluation_session_targets_xor_check/);
  assert.match(sql, /foreign key \(training_id, owner_id\)/);
  assert.match(sql, /foreign key \(goalkeeper_id, owner_id\)/);
  assert.match(sql, /foreign key \(training_exercise_id, training_id, owner_id\)/);
  assert.match(sql, /owner_id = auth\.uid\(\)/);
  assert.match(sql, /public\.is_catalog_admin\(\)/);
});

test("scala iniziale è un dato versionato con livelli 1-5", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0031_evaluation_session_foundation.sql", import.meta.url), "utf8");
  for (const label of ["Grave carenza", "Sotto livello", "Adeguato", "Buono", "Punto di forza"]) assert.match(sql, new RegExp(label));
  assert.match(sql, /GOALKEEPER_LEVEL/);
  assert.match(sql, /validate_evaluation_observation_score/);
});

test("osservazioni SQL sono append-only per authenticated", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0031_evaluation_session_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /grant select, insert on public\.evaluation_observations to authenticated/);
  assert.match(sql, /revoke update, delete on public\.evaluation_observations from authenticated/);
  assert.doesNotMatch(sql, /evaluation_observations_owner_access/);
});

test("pagina DEV non salva sessioni né richiama RPC", () => {
  const source = readFileSync(new URL("../app/dev/evaluation-session-engine/page.tsx", import.meta.url), "utf8");
  assert.match(source, /DEV · READ ONLY · NO SESSION SAVED/);
  assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
});
