import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEvaluationMappingAudit, classifyParameterHealth } from "../lib/evaluation-mapping-audit.ts";
import type { Exercise, ExercisePhysicalObjective, ExerciseSubcategory, PhysicalObjective } from "../lib/types.ts";

const subcategories: ExerciseSubcategory[] = [
  { id: 1, category_id: 1, nome: "Tuffo laterale", fase: "Analitico", attivo: true },
  { id: 2, category_id: 1, nome: "Presa alta", fase: "Analitico", attivo: true },
];

const reactivity: PhysicalObjective = { id: "fis-react", codice: "FIS-001", macro_area: "Reattività", obiettivo_fisico: "Reazione multidirezionale", descrizione: "Reazione a stimoli", priorita_portiere: "Alta", precampionato: "Alta", periodo_competitivo: "Alta", richiamo_mantenimento: "Media", recupero_rigenerazione: "Bassa", abbinamenti_tecnici: "Tuffo", note_programmazione: "", attivo: true };
const mobility: PhysicalObjective = { ...reactivity, id: "fis-mob", codice: "FIS-002", macro_area: "Mobilità", obiettivo_fisico: "Mobilità articolare", descrizione: "Flessibilità e mobilità" };

function relation(exerciseId: string, objective: PhysicalObjective, patch: Partial<ExercisePhysicalObjective> = {}): ExercisePhysicalObjective {
  return { id: `${exerciseId}:${objective.id}`, exercise_id: exerciseId, physical_objective_id: objective.id, ruolo: "Principale", peso: 5, motivazione: "Reazione allo stimolo e tuffo", attivo: true, physical_objective: objective, ...patch };
}

function exercise(id: string, patch: Partial<Exercise> = {}): Exercise {
  return { id, codice: id, nome: "Tuffo laterale su stimolo", category_id: 1, subcategory_id: 1, categoria: "Difesa della porta", sottocategoria: "Tuffo laterale", fase: "Analitico", obiettivo: "Valutare il tuffo laterale", descrizione: "Il portiere reagisce al tiro e compie un tuffo laterale", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: "Stimolo del preparatore", schema_step_2: "Tuffo laterale", schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: "2", tactical_diagram: { version: 1, canvas: { viewType: "front_goal", widthRatio: 16, heightRatio: 10 }, elements: [], actions: [{ id: "a1", type: "tiro", startX: 50, startY: 80, endX: 50, endY: 20, sequence: 1 }, { id: "a2", type: "tuffo", startX: 50, startY: 22, endX: 35, endY: 20, sequence: 2 }] }, attivo: true, physical_mappings: [relation(id, reactivity)], ...patch };
}

test("il target tecnico primario usa esclusivamente la sottocategoria ufficiale", () => {
  const report = buildEvaluationMappingAudit({ exercises: [exercise("E1")], subcategories, physicalObjectives: [reactivity, mobility] });
  assert.equal(report.technicalMappings[0].targetId, "1");
  assert.equal(report.technicalMappings[0].targetName, "Tuffo laterale");
  assert.equal(report.technicalMappings[0].role, "PRIMARY");
  assert.ok(report.technicalMappings.every(mapping => subcategories.some(item => String(item.id) === mapping.targetId)));
});

test("una relazione fisica allenante non viene promossa automaticamente a valutazione forte", () => {
  const weak = exercise("E2", { fase: "Scenario aperto", descrizione: "Partita libera con molte decisioni", obiettivo: "Tema libero", tactical_diagram: { version: 1, canvas: { viewType: "half_pitch", widthRatio: 16, heightRatio: 10 }, elements: [], actions: [{ id: "a", type: "passaggio", startX: 20, startY: 80, endX: 80, endY: 30, sequence: 1 }] }, physical_mappings: [relation("E2", reactivity, { ruolo: "Complementare", peso: 1, motivazione: null })] });
  const report = buildEvaluationMappingAudit({ exercises: [weak], subcategories, physicalObjectives: [reactivity] });
  assert.notEqual(report.physicalMappings[0].physicalObservability, "HIGHLY_OBSERVABLE");
  assert.ok(report.physicalMappings[0].evaluationSuitability < .70);
});

test("mobilità e prevenzione richiedono un protocollo dedicato", () => {
  const item = exercise("E3", { physical_mappings: [relation("E3", mobility)] });
  const report = buildEvaluationMappingAudit({ exercises: [item], subcategories, physicalObjectives: [mobility] });
  assert.equal(report.physicalMappings[0].physicalFeasibility, "REQUIRES_DEDICATED_PROTOCOL");
  assert.equal(report.physicalCoverage[0].feasibility, "REQUIRES_DEDICATED_PROTOCOL");
});

test("i FIS sono aggregati tramite physical_assessment_dimensions quando disponibili", () => {
  const report = buildEvaluationMappingAudit({ exercises: [exercise("E-DIM")], subcategories, physicalObjectives: [reactivity], physicalDimensions: [{ id: "dim-1", codice: "DIM-1", nome: "Reattività applicata", descrizione: "", ordine: 1, attivo: true, objective_mappings: [{ peso: 5, physical_objective: reactivity }] }] });
  assert.equal(report.physicalCoverage[0].aggregateName, "Reattività applicata");
  assert.equal(report.physicalMappings[0].aggregateName, "Reattività applicata");
});

test("la salute del parametro rispetta le soglie diagnostiche approvate", () => {
  assert.equal(classifyParameterHealth(3, 3, 2), "STRONG");
  assert.equal(classifyParameterHealth(1, 2, 1), "ADEQUATE");
  assert.equal(classifyParameterHealth(1, 1, 1), "WEAK");
  assert.equal(classifyParameterHealth(0, 0, 0), "UNCOVERED");
});

test("l'audit è puro e non modifica esercizi o tactical_diagram", () => {
  const records = [exercise("E4")];
  const before = JSON.stringify(records);
  buildEvaluationMappingAudit({ exercises: records, subcategories, physicalObjectives: [reactivity] });
  assert.equal(JSON.stringify(records), before);
});

test("la pagina DEV è read-only e non contiene operazioni Supabase di scrittura", () => {
  const source = readFileSync(new URL("../app/dev/evaluation-mapping-audit/page.tsx", import.meta.url), "utf8");
  assert.match(source, /DEV · READ ONLY · IN MEMORY/);
  assert.doesNotMatch(source, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
});
