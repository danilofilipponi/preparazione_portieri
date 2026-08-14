import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { EvaluationMapping } from "../lib/evaluation-mapping-audit.ts";
import { buildProfileDomains, finalDecisionForMapping, selectObservableFisForDimension } from "../lib/complete-evaluation-design.ts";
import type { EvaluationEngineTarget, EvaluationMappingDecision } from "../lib/evaluation-session-engine.ts";
import type { Exercise, PhysicalAssessmentDimension, PhysicalObjective } from "../lib/types.ts";

function exercise(code: string): Exercise {
  return { id: code, codice: code, nome: code, category_id: 1, subcategory_id: 1, categoria: "Tecnica", sottocategoria: "Stimolo percettivo", fase: "Disturbo", obiettivo: "", descrizione: "", durata_min: 10, portieri_min: 1, portieri_max: 3, intensita: "Media", difficolta: 3, materiale: "", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null, schema_step_3: null, schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, attivo: true, physical_mappings: [] };
}

function mapping(code: string, targetName: string, targetType: "TECHNICAL" | "PHYSICAL" = "TECHNICAL"): EvaluationMapping {
  return { id: `${code}:${targetName}`, exercise: exercise(code), targetType, targetId: targetName, targetCode: targetName, targetName, aggregateName: "Test", role: targetType === "TECHNICAL" ? "PRIMARY" : "Principale", evaluationSuitability: .75, observabilityWeight: .73, specificityWeight: .70, confidence: "MEDIUM", evidenceNotes: "", tacticalFamily: "GENERIC", complexity: "MEDIUM" };
}

function target(name: string, type: "TECHNICAL" | "PHYSICAL" = "TECHNICAL", patch: Partial<EvaluationEngineTarget> = {}): EvaluationEngineTarget {
  return { key: `${type}:${name}`, targetType: type, targetId: name, code: name, name, aggregateName: "Test", health: "ADEQUATE", requiredObservations: 2, requiredDistinctExercises: 2, priority: 4, ...patch };
}

test("review finale dei 13 mapping produce 9 approve, 3 review e 1 reject", () => {
  const rows: Array<[string, string, "TECHNICAL" | "PHYSICAL"]> = [
    ["GK-1V1-013", "Stimolo percettivo", "TECHNICAL"], ["GK-1V1-018", "Stimolo percettivo", "TECHNICAL"], ["GK-1V1-020", "Stimolo percettivo", "TECHNICAL"], ["GK-1V1-027", "Stimolo percettivo", "TECHNICAL"], ["GK-1V1-028", "Stimolo percettivo", "TECHNICAL"],
    ["GK-TLR-015", "Disturbo percettivo", "TECHNICAL"], ["GK-TLR-016", "Disturbo percettivo", "TECHNICAL"], ["GK-TLR-021", "Disturbo percettivo", "TECHNICAL"], ["GK-TLR-024", "Disturbo percettivo", "TECHNICAL"],
    ["GK-CA-022", "Riallineamento", "TECHNICAL"], ["GK-CA-023", "Riallineamento", "TECHNICAL"], ["TEC-001", "Presa alta", "TECHNICAL"], ["GK-1V1-027", "Reazione multidirezionale", "PHYSICAL"],
  ];
  const decisions = rows.map(([code, name, type]) => finalDecisionForMapping(mapping(code, name, type))?.decision);
  assert.equal(decisions.filter(value => value === "APPROVE").length, 9);
  assert.equal(decisions.filter(value => value === "KEEP_REVIEW").length, 3);
  assert.equal(decisions.filter(value => value === "REJECT").length, 1);
});

test("GK-1V1-027 non confonde domanda fisica e osservabilità valutativa", () => {
  const rule = finalDecisionForMapping(mapping("GK-1V1-027", "Reazione multidirezionale", "PHYSICAL"));
  assert.equal(rule?.decision, "REJECT");
  assert.match(rule?.risk ?? "", /Decisione.*tecnica 1vs1.*velocità/i);
});

test("dimensioni di profilo sono aggregazioni di presentazione con nomi reali", () => {
  const targets = [target("Presa alta"), target("Centralità e profondità"), target("Controllo orientato"), target("Decisione"), target("Reazione multidirezionale", "PHYSICAL"), target("Controllo dinamico", "PHYSICAL")];
  const domains = buildProfileDomains(targets);
  assert.ok(domains.length >= 6 && domains.length <= 10);
  assert.ok(domains.some(domain => domain.name === "Difesa della porta" && domain.targets.some(row => row.name === "Presa alta")));
  assert.ok(domains.some(domain => domain.profile === "PHYSICAL OBSERVABLE PROFILE"));
});

test("dimension targeting sceglie il FIS osservabile più coperto e non un protocol-only", () => {
  const objectiveA = { id: "A", codice: "FIS-A", obiettivo_fisico: "Reazione affidabile" } as PhysicalObjective;
  const objectiveB = { id: "B", codice: "FIS-B", obiettivo_fisico: "Protocollo" } as PhysicalObjective;
  const dimension = { id: "D", codice: "D", nome: "Reattività", descrizione: "", ordine: 1, attivo: true, objective_mappings: [{ peso: 5, physical_objective: objectiveA }, { peso: 4, physical_objective: objectiveB }] } as PhysicalAssessmentDimension;
  const a = target("Reazione affidabile", "PHYSICAL", { targetId: "A", key: "PHYSICAL:A", health: "STRONG" });
  const b = target("Protocollo", "PHYSICAL", { targetId: "B", key: "PHYSICAL:B", health: "STRONG", feasibility: "REQUIRES_DEDICATED_PROTOCOL" });
  const decision = { mapping: mapping("E", "Reazione affidabile", "PHYSICAL"), mappingStatus: "auto_approved", active: true, reason: "" } as EvaluationMappingDecision;
  decision.mapping.targetId = "A";
  assert.equal(selectObservableFisForDimension(dimension, [a, b], [decision])?.targetId, "A");
});

test("pagina Complete DEV è read-only e non modifica engine o Supabase", () => {
  const page = readFileSync(new URL("../app/dev/complete-evaluation-design/page.tsx", import.meta.url), "utf8");
  assert.match(page, /DEV · READ ONLY · NO DATABASE WRITES/);
  assert.doesNotMatch(page, /\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(|\.rpc\s*\(/);
  const engine = readFileSync(new URL("../lib/evaluation-session-engine.ts", import.meta.url), "utf8");
  assert.match(engine, /coverageGain: \.35/);
  assert.match(engine, /specificity: \.20/);
  assert.match(engine, /observability: \.25/);
});
