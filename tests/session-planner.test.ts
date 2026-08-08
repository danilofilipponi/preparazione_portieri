import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionBlocks, buildSessionProfile, groupWeakness, individualWeakness, maintenanceScore, rankPhysicalPriorities, rankTechnicalPriorities } from "../lib/session-planner/index.ts";
import type { ExerciseCategory, Goalkeeper, PhysicalAssessmentDimension } from "../lib/types.ts";

function goalkeeper(id: string, technical: Array<[number, number]> = [], physical: Array<[string, number]> = []): Goalkeeper {
  return { id, nome: id, cognome: "Test", data_nascita: null, attivo: true, note: null, created_at: "", updated_at: "", assessments: [{ id: `${id}-a`, goalkeeper_id: id, data_valutazione: "2026-08-01", note_generali: null, created_at: "", items: [
    ...technical.map(([category, score], index) => ({ id: `${id}-t${index}`, assessment_id: `${id}-a`, tipo: "Tecnica" as const, exercise_category_id: category, physical_dimension_id: null, score, nota: null })),
    ...physical.map(([dimension, score], index) => ({ id: `${id}-p${index}`, assessment_id: `${id}-a`, tipo: "Fisica" as const, exercise_category_id: null, physical_dimension_id: dimension, score, nota: null })),
  ] }] };
}

const categories: ExerciseCategory[] = [{ id: 1, nome: "Tecnica di presa", attivo: true }, { id: 2, nome: "Reattività e posizionamento", attivo: true }];
const dimensions: PhysicalAssessmentDimension[] = [
  { id: "force", codice: "PHY-FORZA", nome: "Forza", descrizione: "", ordine: 1, attivo: true },
  { id: "reaction", codice: "PHY-REA", nome: "Reattività", descrizione: "", ordine: 2, attivo: true },
];

test("caso A: una carenza condivisa diventa priorità tecnica di gruppo", () => {
  const weakness = groupWeakness([4.3, 5.4, 7.8], 3);
  assert.ok(weakness >= 40 && weakness <= 46, `punteggio inatteso: ${weakness}`);
  const result = rankTechnicalPriorities({ categories, goalkeepers: [goalkeeper("A", [[1,4.3]]), goalkeeper("B", [[1,5.4]]), goalkeeper("C", [[1,7.8]])], matchDayOffset: -4 });
  assert.equal(result[0].id, "1");
});

test("caso B: una carenza isolata resta individuale e non domina il gruppo", () => {
  const group = groupWeakness([4.1, 8.3, 8.1], 3);
  assert.ok(group >= 20 && group <= 30, `punteggio inatteso: ${group}`);
  assert.ok(individualWeakness(4.1) > group);
});

test("caso C: senza valutazioni il ranking usa manutenzione, rotazione e Match Day", () => {
  const ranking = rankTechnicalPriorities({ categories, goalkeepers: [], matchDayOffset: -4, daysSinceUse: { 1: 35, 2: 2 }, usage: { 1: 0, 2: 4 } });
  assert.equal(ranking[0].id, "1");
  assert.equal(ranking[0].assessed, 0);
  assert.ok(maintenanceScore(35) > maintenanceScore(2));
});

test("caso D: a MD-2 una forte carenza di forza non supera da sola la reattività", () => {
  const keepers = [goalkeeper("A", [], [["force",2], ["reaction",8]]), goalkeeper("B", [], [["force",2], ["reaction",8]])];
  const ranking = rankPhysicalPriorities({ dimensions, goalkeepers: keepers, matchDayOffset: -2 });
  assert.equal(ranking[0].id, "reaction");
});

test("caso E: crea sempre quattro blocchi con durata totale esatta", () => {
  for (const duration of [60, 65, 70, 75, 90]) {
    const profile = buildSessionProfile({ matchDayOffset: -2, duration });
    const blocks = buildSessionBlocks(profile, 1, "reaction");
    assert.equal(blocks.length, 4);
    assert.equal(blocks.reduce((sum, block) => sum + block.durata_target, 0), duration);
  }
});
