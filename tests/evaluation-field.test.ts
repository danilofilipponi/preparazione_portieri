import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEvaluationResults, buildPresentationDimensions, evaluationLiveSummary, exerciseEvaluationState, reliabilityFor, resolvePhysicalDisplay, type EvaluationFieldPayload, type EvaluationFieldTarget } from "../lib/evaluation-field.ts";
import type { Exercise } from "../lib/types.ts";

function exercise(id: string, phase: Exercise["fase"] = "Analitico"): Exercise {
  return { id, codice: id, nome: `Esercizio ${id}`, category_id: 1, subcategory_id: 1, categoria: "Test", sottocategoria: "Test", fase: phase, obiettivo: "Test", descrizione: "Test", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, attivo: true, physical_mappings: [] };
}

function target(id: string, linkId: string, weight: number, patch: Partial<EvaluationFieldTarget> = {}): EvaluationFieldTarget {
  return { exercise_target_id: linkId, session_target_id: id, target_type: "Technical", parameter_name: "Presa alta", technical_name: "Presa alta", physical_dimension_id: null, physical_dimension_name: null, physical_objective_id: null, fis_code: null, fis_name: null, observability_weight: weight, suitability_weight: 1, evidence_notes: "Mani dietro la palla", coverage_status: "COVERED", ...patch };
}

function payload(): EvaluationFieldPayload {
  return {
    session: { id: "session", training_id: "training", status: "InProgress", evaluation_type: "Targeted", started_at: "2026-08-14T10:00:00Z", completed_at: null, minimum_observations: 2, date: "2026-08-14", goalkeeper_id: "gk", goalkeeper_name: "Marco Rossi" },
    scale_levels: [1,2,3,4,5].map(score => ({ score, label: ["Grave carenza","Sotto livello","Adeguato","Buono","Punto di forza"][score - 1], description: "" })),
    exercises: [
      { training_exercise_id: "te1", position: 0, planned_duration_minutes: 10, exercise: exercise("E1"), targets: [target("st1", "et1", 1)] },
      { training_exercise_id: "te2", position: 1, planned_duration_minutes: 10, exercise: exercise("E2", "Disturbo"), targets: [target("st1", "et2", .5)] },
      { training_exercise_id: "te3", position: 2, planned_duration_minutes: 10, exercise: exercise("E3"), targets: [target("st2", "et3", .9, { target_type: "Physical", parameter_name: "Reazione multidirezionale", technical_name: null, physical_dimension_id: "dim", physical_dimension_name: "Reattivit\u00e0", physical_objective_id: "fis", fis_code: "FIS-001", fis_name: "Reazione multidirezionale" })] },
    ],
    observations: [
      { id: "o1", exercise_target_id: "et1", observation_number: 1, score: 5, observation_status: "OBSERVED", notes: "Nota rapida", confidence: 1, observed_at: "2026-08-14T10:01:00Z" },
      { id: "o2", exercise_target_id: "et2", observation_number: 1, score: 1, observation_status: "OBSERVED", notes: null, confidence: 1, observed_at: "2026-08-14T10:02:00Z" },
      { id: "o3", exercise_target_id: "et1", observation_number: 2, score: null, observation_status: "NOT_OBSERVED", notes: "Azione non avvenuta", confidence: 1, observed_at: "2026-08-14T10:03:00Z" },
      { id: "o4", exercise_target_id: "et3", observation_number: 1, score: null, observation_status: "NOT_OBSERVED", notes: null, confidence: 1, observed_at: "2026-08-14T10:04:00Z" },
    ],
  };
}

test("NOT_OBSERVED resta distinto da 0 e non entra nella media pesata", () => {
  const result = buildEvaluationResults(payload()).find(item => item.sessionTargetId === "st1")!;
  assert.equal(result.validObservations, 2);
  assert.equal(result.notObserved, 1);
  assert.equal(result.weightedScore, 3.667);
  assert.equal(result.normalizedScore, 66.67);
});

test("pi\u00f9 osservazioni dello stesso parametro restano append-only e separate", () => {
  const result = buildEvaluationResults(payload()).find(item => item.sessionTargetId === "st1")!;
  assert.deepEqual(result.observations.map(item => item.id), ["o1", "o2", "o3"]);
  assert.equal(result.distinctExercises, 2);
  assert.equal(result.distinctContexts, 2);
  assert.equal(result.observations[0].notes, "Nota rapida");
});

test("stato esercizio considera NOT_OBSERVED una decisione registrata", () => {
  const data = payload();
  assert.equal(exerciseEvaluationState(data.exercises[0], data.observations), "OBSERVED");
  assert.equal(exerciseEvaluationState(data.exercises[2], data.observations), "OBSERVED");
  assert.equal(exerciseEvaluationState({ ...data.exercises[0], targets: [data.exercises[0].targets[0], target("extra", "missing", 1)] }, data.observations), "PARTIAL");
});

test("coverage live e completion warning distinguono osservati, non osservati e mancanti", () => {
  const data = payload();
  data.exercises.push({ training_exercise_id: "te4", position: 3, planned_duration_minutes: 10, exercise: exercise("E4"), targets: [target("st3", "et4", .8)] });
  const summary = evaluationLiveSummary(data);
  assert.equal(summary.parametersObserved, 1);
  assert.equal(summary.parametersNotObserved, 1);
  assert.equal(summary.parametersUndecided, 1);
  assert.equal(summary.validObservationsTotal, 2);
  assert.equal(summary.notObservedTotal, 2);
});

test("display fisico risolve la dimensione senza modificare le tassonomie", () => {
  assert.deepEqual(resolvePhysicalDisplay({ parameterName: "Controllo dinamico", fisName: "Controllo dinamico" }), {
    dimensionName: "Controllo del movimento",
    fisName: "Controllo dinamico",
    resolved: true,
  });
  assert.deepEqual(resolvePhysicalDisplay({ parameterName: "Qualità fisica speciale", fisName: null }), {
    dimensionName: null,
    fisName: "Qualità fisica speciale",
    resolved: false,
  });
});

test("reliability non inventa precisione statistica", () => {
  assert.equal(reliabilityFor({ validObservations: 0, distinctExercises: 0, distinctContexts: 0, averageWeight: 0 }), "INSUFFICIENT");
  assert.equal(reliabilityFor({ validObservations: 1, distinctExercises: 1, distinctContexts: 1, averageWeight: .9 }), "LIMITED");
  assert.equal(reliabilityFor({ validObservations: 2, distinctExercises: 2, distinctContexts: 1, averageWeight: .8 }), "GOOD");
  assert.equal(reliabilityFor({ validObservations: 3, distinctExercises: 2, distinctContexts: 2, averageWeight: .8 }), "STRONG");
});

test("risultato fisico mostra dimensione scelta e FIS realmente osservato", () => {
  const physical = buildEvaluationResults(payload()).find(item => item.sessionTargetId === "st2")!;
  assert.equal(physical.physicalDimensionName, "Reattivit\u00e0");
  assert.equal(physical.fisName, "Reazione multidirezionale");
  assert.equal(physical.weightedScore, null);
  assert.equal(physical.reliability, "INSUFFICIENT");
});

test("le otto dimensioni sono presentazione applicativa e non producono overall", () => {
  const dimensions = buildPresentationDimensions(buildEvaluationResults(payload()));
  assert.equal(dimensions.length, 8);
  assert.equal(dimensions.find(item => item.name === "Reattivita osservabile")?.score, null);
  assert.ok(dimensions.every(item => !("overall" in item)));
});

test("migration 0033 protegge lifecycle, idempotenza, append-only e completed", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0033_evaluation_field_mode.sql", import.meta.url), "utf8");
  assert.match(sql, /observation_status text not null default 'OBSERVED'/i);
  assert.match(sql, /unique\(owner_id, idempotency_key\)/i);
  assert.match(sql, /create or replace function public\.start_evaluation_session/i);
  assert.match(sql, /create or replace function public\.record_evaluation_observation/i);
  assert.match(sql, /create or replace function public\.complete_evaluation_session/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /if current_status = 'Completed'/i);
  assert.match(sql, /evaluation_scale_levels[\s\S]*score = new\.score/i);
  assert.match(sql, /NOT_OBSERVED richiede score NULL/i);
  assert.match(sql, /revoke all on function public\.get_evaluation_field_session\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.record_evaluation_observation[\s\S]*to authenticated/i);
  assert.match(sql, /revoke update, delete on public\.evaluation_observations from authenticated/i);
  assert.doesNotMatch(sql, /update public\.evaluation_observations/i);
  assert.doesNotMatch(sql, /delete from public\.evaluation_observations/i);
});

test("migration 0035 rende Completed immutabile anche nelle scritture dirette", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0035_evaluation_completed_immutability.sql", import.meta.url), "utf8");
  assert.match(sql, /evaluation_sessions_completed_immutability/i);
  assert.match(sql, /if old\.status = 'Completed'/i);
  assert.match(sql, /status <> 'Completed'/i);
  assert.match(sql, /evaluation_observations_owner_insert_in_progress/i);
  assert.match(sql, /session\.status = 'InProgress'/i);
  assert.doesNotMatch(sql, /insert into|update public|delete from/i);
});

test("Field UI usa scala DB, touch buttons, nuova osservazione e warning completamento", () => {
  const source = readFileSync(new URL("../app/components/evaluation-field-mode.tsx", import.meta.url), "utf8");
  assert.match(source, /payload\.scale_levels\.map/);
  assert.match(source, /Non osservato/);
  assert.match(source, /\+ Nuova osservazione/);
  assert.match(source, /parametersUndecided/);
  assert.match(source, /FIS osservato/);
  assert.match(source, /pendingSelections/);
  assert.match(source, /Selezione non salvata/);
  assert.match(source, /aria-pressed=\{pending/);
  assert.match(source, /aria-controls=\{`evaluation-procedure-/);
  assert.match(source, /target solo non osservati/i);
  assert.match(source, /decisioni non osservato/i);
  assert.match(source, /non potr.*essere modificata/i);
  assert.doesNotMatch(source, /Dimensione:<\\\/b>.*Non specificata/);
  assert.doesNotMatch(source, /overallScore|<h2>Voto generale/i);
});

test("Field UI riposiziona la seduta all'inizio quando cambia esercizio", () => {
  const source = readFileSync(new URL("../app/components/evaluation-field-mode.tsx", import.meta.url), "utf8");
  assert.match(source, /overlayRef\.current\.scrollTop = 0/);
  assert.match(source, /\}, \[index, isMobile\]\);/);
  assert.match(source, /ref=\{overlayRef\}/);
});

test("Field UI mostra frecce e chiusura reali senza escape Unicode visibili", () => {
  const source = readFileSync(new URL("../app/components/evaluation-field-mode.tsx", import.meta.url), "utf8");
  assert.match(source, />←<\/span> Precedente/);
  assert.match(source, /Esercizio successivo <span aria-hidden="true">→<\/span>/);
  assert.match(source, /aria-label="Chiudi e continua[^>]*>×<\/button>/);
  assert.doesNotMatch(source, />\\u(?:2190|2192|00d7)/i);
});
