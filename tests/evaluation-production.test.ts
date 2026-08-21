import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { finalDecisionForMapping } from "../lib/complete-evaluation-design.ts";
import { buildCustomEvaluation } from "../lib/evaluation-custom.ts";
import { CORE_OPTIONAL_NAMES, CORE_REQUIRED_NAMES, buildProductionTargetCatalog, resolvePhysicalDimensionTargets } from "../lib/evaluation-production.ts";
import type { ProductionEvaluationTarget } from "../lib/evaluation-production.ts";
import type { EvaluationMapping } from "../lib/evaluation-mapping-audit.ts";
import type { EvaluationMappingDecision } from "../lib/evaluation-session-engine.ts";
import type { Exercise, PhysicalAssessmentDimension, PhysicalObjective } from "../lib/types.ts";

function exercise(id: string): Exercise {
  return { id, codice: id, nome: id, category_id: 1, subcategory_id: 1, categoria: "Test", sottocategoria: "Test", fase: "Analitico", obiettivo: "Test", descrizione: "Test", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, attivo: true, physical_mappings: [] };
}

function objective(id: string, code: string, name: string): PhysicalObjective {
  return { id, codice: code, macro_area: "Reattivit\u00e0", obiettivo_fisico: name, descrizione: name, priorita_portiere: "Alta", precampionato: "Alta", periodo_competitivo: "Alta", richiamo_mantenimento: "Media", recupero_rigenerazione: "Bassa", abbinamenti_tecnici: "", note_programmazione: "", attivo: true };
}

function physicalDecision(item: Exercise, target: PhysicalObjective, feasibility: EvaluationMapping["physicalFeasibility"] = "CATALOG_EVALUABLE"): EvaluationMappingDecision {
  return { mapping: { id: `${item.id}:${target.id}`, exercise: item, targetType: "PHYSICAL", targetId: target.id, targetCode: target.codice, targetName: target.obiettivo_fisico, aggregateName: target.macro_area, role: "Principale", evaluationSuitability: .9, observabilityWeight: .9, specificityWeight: .85, confidence: "HIGH", evidenceNotes: "Test", physicalFeasibility: feasibility, tacticalFamily: "REACTION", complexity: "LOW" }, mappingStatus: "auto_approved", active: true, reason: "test" };
}

test("la configurazione Complete conserva esattamente i core approvati", () => {
  assert.deepEqual(CORE_REQUIRED_NAMES, ["Presa alta", "Centralit\u00e0 e profondit\u00e0", "Controllo orientato", "Decisione", "Controllo dinamico", "Arresto e ripartenza"]);
  assert.deepEqual(CORE_OPTIONAL_NAMES, ["Tuffo + spostamento", "Riallineamento", "Doppio intervento", "1vs1 e finalizzazioni", "Uscite alte presa", "Stimolo percettivo", "Disturbo percettivo", "Reazione multidirezionale", "Orientamento spazio-temporale"]);
});

test("le 13 decisioni manuali restano 9 approvate, 3 in review e 1 rejected", () => {
  const rows: Array<[string, string]> = [
    ["GK-1V1-013", "Stimolo percettivo"], ["GK-1V1-018", "Stimolo percettivo"], ["GK-1V1-028", "Stimolo percettivo"],
    ["GK-TLR-015", "Disturbo percettivo"], ["GK-TLR-016", "Disturbo percettivo"], ["GK-TLR-021", "Disturbo percettivo"],
    ["GK-CA-022", "Riallineamento"], ["GK-CA-023", "Riallineamento"], ["TEC-001", "Presa alta"],
    ["GK-1V1-020", "Stimolo percettivo"], ["GK-1V1-027", "Stimolo percettivo"], ["GK-TLR-024", "Disturbo percettivo"],
    ["GK-1V1-027", "Reazione multidirezionale"],
  ];
  const decisions = rows.map(([code, targetName]) => finalDecisionForMapping({ exercise: exercise(code), targetName } as EvaluationMapping)?.decision);
  assert.equal(decisions.filter(value => value === "APPROVE").length, 9);
  assert.equal(decisions.filter(value => value === "KEEP_REVIEW").length, 3);
  assert.equal(decisions.filter(value => value === "REJECT").length, 1);
});

test("la selezione per dimensione distingue coperto, protocollo e non coperto", () => {
  const coveredFis = objective("fis-covered", "FIS-001", "Reazione a stimolo visivo");
  const protocolFis = objective("fis-protocol", "FIS-002", "Test dedicato");
  const missingFis = objective("fis-missing", "FIS-003", "Obiettivo senza mapping");
  const dimensions: PhysicalAssessmentDimension[] = [
    { id: "d1", codice: "DIM-1", nome: "Reattivit\u00e0", descrizione: "", ordine: 1, attivo: true, objective_mappings: [{ peso: 1, physical_objective: coveredFis }] },
    { id: "d2", codice: "DIM-2", nome: "Protocollo", descrizione: "", ordine: 2, attivo: true, objective_mappings: [{ peso: 1, physical_objective: protocolFis }] },
    { id: "d3", codice: "DIM-3", nome: "Scoperta", descrizione: "", ordine: 3, attivo: true, objective_mappings: [{ peso: 1, physical_objective: missingFis }] },
  ];
  const decisions = [physicalDecision(exercise("E1"), coveredFis), physicalDecision(exercise("E2"), coveredFis), physicalDecision(exercise("E3"), protocolFis, "REQUIRES_DEDICATED_PROTOCOL")];
  const catalog = buildProductionTargetCatalog(decisions, [], [coveredFis, protocolFis, missingFis]);
  const result = resolvePhysicalDimensionTargets(dimensions, catalog, decisions, dimensions.map(item => item.id));
  assert.deepEqual(result.map(item => item.status), ["COVERED", "REQUIRES_PROTOCOL", "NOT_COVERED"]);
  assert.deepEqual(result[0].selectedFis.map(item => item.code), ["FIS-001"]);
  assert.equal(result[1].selectedFis.length, 0);
  assert.equal(result[2].selectedFis.length, 0);
});

test("la RPC production crea la seduta in transazione senza creare osservazioni", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0032_evaluation_session_production.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.create_evaluation_training/i);
  assert.match(sql, /current_owner uuid := auth\.uid\(\)/i);
  assert.match(sql, /if current_owner is null/i);
  assert.match(sql, /insert into public\.evaluation_sessions/i);
  assert.match(sql, /insert into public\.training_exercises/i);
  assert.match(sql, /insert into public\.evaluation_exercise_targets/i);
  assert.doesNotMatch(sql, /insert into public\.evaluation_observations/i);
});

test("il bootstrap idempotente protegge le decisioni manuali", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0032_evaluation_session_production.sql", import.meta.url), "utf8");
  assert.match(sql, /on conflict \(exercise_id, technical_subcategory_id\)[\s\S]*do update/i);
  assert.match(sql, /on conflict \(exercise_id, physical_objective_id\)[\s\S]*do update/i);
  assert.match(sql, /where public\.exercise_evaluation_targets\.decision_source = 'bootstrap'/i);
  assert.match(sql, /decision_source = 'manual'/i);
});

test("Personalizzata conserva esattamente gli esercizi scelti e deriva i target approvati", () => {
  const first = exercise("CUSTOM-1"), second = exercise("CUSTOM-2"), ignored = exercise("CUSTOM-3");
  const makeDecision = (item: Exercise): EvaluationMappingDecision => ({ mapping: { id: `mapping-${item.id}`, exercise: item, targetType: "TECHNICAL", targetId: "7", targetCode: "SUB-7", targetName: "Presa alta", aggregateName: "Tecnica", role: "PRIMARY", evaluationSuitability: .9, observabilityWeight: .9, specificityWeight: .9, confidence: "HIGH", evidenceNotes: "Test", tacticalFamily: "SHOT_SAVE", complexity: "LOW" }, mappingStatus: "auto_approved", active: true, reason: "test" });
  const target: ProductionEvaluationTarget = { key: "TECHNICAL:7", targetType: "TECHNICAL", targetId: "7", code: "SUB-7", name: "Presa alta", aggregateName: "Tecnica", health: "STRONG", requiredObservations: 2, requiredDistinctExercises: 2, priority: 5, technicalSubcategoryId: 7, physicalObjectiveId: null, physicalDimensionId: null, physicalDimensionName: null };
  const custom = buildCustomEvaluation({ exerciseIds: [second.id, first.id], exercises: [first, second, ignored], decisions: [makeDecision(first), makeDecision(second)], targets: [target], duration: 45, minimumObservations: 2 });
  assert.equal(custom.result.evaluationType, "Custom");
  assert.deepEqual(custom.result.selectedExercises.map(item => item.exercise.id), [second.id, first.id]);
  assert.equal(custom.result.selectedExercises.some(item => item.exercise.id === ignored.id), false);
  assert.deepEqual(custom.targets.map(item => item.key), ["TECHNICAL:7"]);
  assert.equal(custom.result.coverageMatrix[0].status, "COVERED");
});

test("migration Personalizzata riusa la RPC protetta senza alterare RLS", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0036_custom_evaluation_sessions.sql", import.meta.url), "utf8");
  assert.match(sql, /check \(evaluation_type in \('Complete','Targeted','Custom','Reassessment'\)\)/i);
  assert.match(sql, /current_owner uuid := auth\.uid\(\)/i);
  assert.match(sql, /public\.create_evaluation_training\([\s\S]*'Targeted'/i);
  assert.match(sql, /grant execute on function public\.create_custom_evaluation_training[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /create policy|alter policy|disable row level security/i);
});

test("un nuovo esercizio puo essere abilitato esplicitamente per le valutazioni", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0038_new_exercise_evaluation_eligibility.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  assert.match(app, /Usa questo esercizio nelle valutazioni/);
  assert.match(app, /set_exercise_evaluation_eligibility/);
  assert.match(sql, /if not public\.is_catalog_admin\(\)/i);
  assert.match(sql, /target_type[\s\S]*'Technical'/i);
  assert.match(sql, /mapping_status[\s\S]*'auto_approved'/i);
  assert.match(sql, /decision_source[\s\S]*'manual'/i);
  assert.match(sql, /on conflict \(exercise_id, technical_subcategory_id\)/i);
  assert.match(sql, /revoke all on function public\.set_exercise_evaluation_eligibility[\s\S]*from public, anon/i);
  assert.doesNotMatch(sql, /create policy|alter policy|disable row level security/i);
});

test("un esercizio esistente carica e aggiorna lo stato valutativo senza scritture implicite", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0039_existing_exercise_evaluation_eligibility.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app/keeper-app.tsx", import.meta.url), "utf8");
  assert.match(app, /evaluation_mappings:exercise_evaluation_targets/);
  assert.match(app, /activeTechnicalEvaluationMapping/);
  assert.match(app, /existing && evaluationEligibility\.dirty/);
  assert.match(app, /dirty: true/);
  assert.match(sql, /update public\.exercise_evaluation_targets[\s\S]*target_type = 'Technical'/i);
  assert.match(sql, /not requested_enabled[\s\S]*technical_subcategory_id <> requested_technical_subcategory_id/i);
  assert.match(sql, /if not public\.is_catalog_admin\(\)/i);
  assert.doesNotMatch(sql, /create policy|alter policy|disable row level security/i);
});
