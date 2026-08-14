import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EvaluationMapping, EvaluationMappingAuditReport, ParameterCoverage } from "../lib/evaluation-mapping-audit.ts";
import { buildApproveOnlyDecisions, buildEvaluationMappingReview, buildReviewExport, calculateReviewPriority, classifyReviewCandidate, coverageStatusForMappings, findEvaluationTarget } from "../lib/evaluation-mapping-review.ts";
import type { EvaluationEngineTarget } from "../lib/evaluation-session-engine.ts";
import type { Exercise } from "../lib/types.ts";

function exercise(id: string, patch: Partial<Exercise> = {}): Exercise {
  return { id, codice: id, nome: `Esercizio ${id}`, category_id: 1, subcategory_id: 1, categoria: "Tecnica", sottocategoria: "Tuffo", fase: "Analitico", obiettivo: "Tuffo ripetuto", descrizione: "Il portiere esegue tuffi ripetuti", durata_min: 10, portieri_min: 1, portieri_max: 3, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, tactical_diagram: { version: 1, canvas: { viewType: "front_goal", widthRatio: 16, heightRatio: 10 }, elements: [], actions: [{ id: "a", type: "tuffo", startX: 50, startY: 60, endX: 30, endY: 50, sequence: 1 }] }, diagram_source: null, diagram_updated_at: null, attivo: true, physical_mappings: [], ...patch };
}

function mapping(item: Exercise, patch: Partial<EvaluationMapping> = {}): EvaluationMapping {
  return { id: `T:${item.id}:1`, exercise: item, targetType: "TECHNICAL", targetId: "1", targetCode: "SUB-1", targetName: "Tuffo", aggregateName: "Tecnica", role: "PRIMARY", evaluationSuitability: .74, observabilityWeight: .72, specificityWeight: .68, confidence: "MEDIUM", evidenceNotes: "Focus primario e azione Tactical coerente.", tacticalFamily: "DIVE", complexity: "LOW", ...patch };
}

const target = (patch: Partial<EvaluationEngineTarget> = {}): EvaluationEngineTarget => ({ key: "TECHNICAL:1", targetType: "TECHNICAL", targetId: "1", code: "SUB-1", name: "Tuffo", aggregateName: "Tecnica", health: "ADEQUATE", requiredObservations: 2, requiredDistinctExercises: 2, priority: 4, ...patch });
const coverage = (patch: Partial<ParameterCoverage> = {}): ParameterCoverage => ({ targetType: "TECHNICAL", targetId: "1", code: "SUB-1", name: "Tuffo", aggregateName: "Tecnica", total: 2, evaluable: 2, good: 2, excellent: 0, contexts: ["Analitico"], supportsTwoDistinctExercises: true, health: "ADEQUATE", ...patch });

function report(rows: EvaluationMapping[]): EvaluationMappingAuditReport {
  const c = coverage();
  return { catalogSize: new Set(rows.map(row => row.exercise.id)).size, exercisesAnalyzed: new Set(rows.map(row => row.exercise.id)).size, technicalMappings: rows, physicalMappings: [], allMappings: rows, technicalCoverage: [c], physicalCoverage: [], strongParameters: [], adequateParameters: [c], weakParameters: [], uncoveredParameters: [], dedicatedProtocol: [], highConfidence: rows.filter(row => row.confidence === "HIGH"), mediumConfidence: rows.filter(row => row.confidence === "MEDIUM"), lowConfidence: rows.filter(row => row.confidence === "LOW"), falsePositiveRisks: [], falseNegativeRisks: [], goodMultiTarget: [], overloaded: [], complexity: [], battery: { exercises: [], targets: [], targetsObservedTwice: [], estimatedDuration: 0, gaps: [] }, simulations: [], recommendedThresholds: { evaluable: .5, good: .7, excellent: .85, minimumObservations: 2, minimumDistinctExercises: 2 } };
}

test("candidate discovery limita la review ai target CORE o Targeted", () => {
  const medium = mapping(exercise("M1"));
  const result = buildEvaluationMappingReview(report([medium]), [medium.exercise]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].core, true);
});

test("classificazione approva solo mapping osservabile, specifico, primario e confermato dalla Tactical", () => {
  assert.equal(classifyReviewCandidate(mapping(exercise("A"))).proposal, "RECOMMEND_APPROVE");
  assert.equal(classifyReviewCandidate(mapping(exercise("B"), { role: "SECONDARY" })).proposal, "REVIEW");
});

test("false positive fisico training-only viene raccomandato per il reject", () => {
  const physical = mapping(exercise("P"), { targetType: "PHYSICAL", targetId: "P1", targetName: "Esplosività", role: "Principale", physicalObservability: "TRAINING_ONLY" });
  assert.equal(classifyReviewCandidate(physical).proposal, "RECOMMEND_REJECT");
});

test("review priority privilegia un target scoperto ma non cambia la proposta metodologica", () => {
  const row = mapping(exercise("R"), { role: "SECONDARY" });
  assert.ok(calculateReviewPriority(row, "NOT_COVERED", true, 1, 0) > calculateReviewPriority(row, "COVERED", false, 0, 3));
  assert.equal(classifyReviewCandidate(row).proposal, "REVIEW");
});

test("risoluzione target usa ID reali associati ai nomi trovati", () => {
  const found = findEvaluationTarget([target({ targetId: "real-id", key: "TECHNICAL:real-id", name: "Tuffo laterale" })], "TECHNICAL", "tuffo");
  assert.equal(found?.targetId, "real-id");
});

test("coverage richiede due esercizi distinti sufficientemente affidabili", () => {
  const first = mapping(exercise("C1"));
  assert.equal(coverageStatusForMappings(target(), [first]), "PARTIALLY_COVERED");
  assert.equal(coverageStatusForMappings(target(), [first, mapping(exercise("C2"))]), "COVERED");
  assert.equal(coverageStatusForMappings(target({ feasibility: "REQUIRES_DEDICATED_PROTOCOL" }), [first]), "REQUIRES_PROTOCOL");
});

test("AFTER include esclusivamente gli id esplicitamente approvati, non REVIEW o REJECT", () => {
  const approve = mapping(exercise("AP"));
  const review = mapping(exercise("RV"), { id: "T:RV:1", role: "SECONDARY" });
  const reject = mapping(exercise("RJ"), { id: "T:RJ:1", evaluationSuitability: .42 });
  const decisions = buildApproveOnlyDecisions(report([approve, review, reject]), new Set([approve.id]));
  assert.equal(decisions.find(row => row.mapping.id === approve.id)?.active, true);
  assert.equal(decisions.find(row => row.mapping.id === review.id)?.active, false);
  assert.equal(decisions.find(row => row.mapping.id === reject.id)?.active, false);
});

test("best observations distinguono contesti differenti", () => {
  const one = mapping(exercise("O1"), { confidence: "HIGH", evaluationSuitability: .82 });
  const two = mapping(exercise("O2", { fase: "Disturbo" }), { id: "T:O2:1", confidence: "HIGH", evaluationSuitability: .82 });
  const result = buildEvaluationMappingReview(report([one, two]), [one.exercise, two.exercise]);
  assert.equal(result.coreTargets[0].secondBestObservation?.contextRelation, "different contexts");
});

test("export conserva stato precedente, proposta e decisione umana senza persistenza", () => {
  const row = mapping(exercise("EX"));
  const candidate = buildEvaluationMappingReview(report([row]), [row.exercise]).candidates[0];
  const exported = buildReviewExport(candidate, "APPROVE", "Verificato sul campo");
  assert.equal(exported.previous_status, "needs_review");
  assert.equal(exported.human_decision, "APPROVE");
});

test("pagina DEV è read-only verso Supabase e offre filtri ed export", () => {
  const source = readFileSync(new URL("../app/dev/evaluation-mapping-review/page.tsx", import.meta.url), "utf8");
  assert.match(source, /DEV · READ ONLY · QUALITY/);
  assert.match(source, /Export review decisions/);
  assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
});
