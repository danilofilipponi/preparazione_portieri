import { classifyTacticalFamily, type SemanticTacticalFamily } from "./tactical-diagram.ts";
import type { Exercise, ExercisePhysicalObjective, ExerciseSubcategory, PhysicalAssessmentDimension, PhysicalObjective } from "./types.ts";

export type EvaluationTargetType = "TECHNICAL" | "PHYSICAL";
export type MappingConfidence = "HIGH" | "MEDIUM" | "LOW";
export type PhysicalObservability = "HIGHLY_OBSERVABLE" | "OBSERVABLE" | "WEAKLY_OBSERVABLE" | "TRAINING_ONLY" | "NOT_EVALUABLE";
export type ParameterHealth = "STRONG" | "ADEQUATE" | "WEAK" | "UNCOVERED";
export type PhysicalFeasibility = "CATALOG_EVALUABLE" | "REQUIRES_DEDICATED_PROTOCOL";
export type ExerciseComplexity = "LOW" | "MEDIUM" | "HIGH";

export type EvaluationMapping = {
  id: string;
  exercise: Exercise;
  targetType: EvaluationTargetType;
  targetId: string;
  targetCode: string;
  targetName: string;
  aggregateName: string;
  role: "PRIMARY" | "SECONDARY" | ExercisePhysicalObjective["ruolo"];
  evaluationSuitability: number;
  observabilityWeight: number;
  specificityWeight: number;
  confidence: MappingConfidence;
  evidenceNotes: string;
  physicalObservability?: PhysicalObservability;
  physicalFeasibility?: PhysicalFeasibility;
  tacticalFamily: SemanticTacticalFamily;
  complexity: ExerciseComplexity;
};

export type ParameterCoverage = {
  targetType: EvaluationTargetType;
  targetId: string;
  code: string;
  name: string;
  aggregateName: string;
  total: number;
  evaluable: number;
  good: number;
  excellent: number;
  contexts: string[];
  supportsTwoDistinctExercises: boolean;
  health: ParameterHealth;
  feasibility?: PhysicalFeasibility;
};

export type MappingRisk = { exerciseCode: string; target: string; reason: string; severity: "HIGH" | "MEDIUM" };
export type BatteryExercise = { exercise: Exercise; coveredTargets: string[]; newObservations: number };
export type EvaluationBattery = { exercises: BatteryExercise[]; targets: string[]; targetsObservedTwice: string[]; estimatedDuration: number; gaps: string[] };
export type TargetedSimulation = { label: string; technicalQuery: string; physicalQuery: string; resolvedTechnical: string | null; resolvedPhysical: string | null; exercises: BatteryExercise[]; gap: string | null };

export type EvaluationMappingAuditReport = {
  catalogSize: number;
  exercisesAnalyzed: number;
  technicalMappings: EvaluationMapping[];
  physicalMappings: EvaluationMapping[];
  allMappings: EvaluationMapping[];
  technicalCoverage: ParameterCoverage[];
  physicalCoverage: ParameterCoverage[];
  strongParameters: ParameterCoverage[];
  adequateParameters: ParameterCoverage[];
  weakParameters: ParameterCoverage[];
  uncoveredParameters: ParameterCoverage[];
  dedicatedProtocol: ParameterCoverage[];
  highConfidence: EvaluationMapping[];
  mediumConfidence: EvaluationMapping[];
  lowConfidence: EvaluationMapping[];
  falsePositiveRisks: MappingRisk[];
  falseNegativeRisks: MappingRisk[];
  goodMultiTarget: Array<{ exercise: Exercise; mappings: EvaluationMapping[] }>;
  overloaded: Array<{ exercise: Exercise; mappings: EvaluationMapping[]; reason: string }>;
  complexity: Array<{ level: ExerciseComplexity; mappings: number; averageSuitability: number; averageSpecificity: number }>;
  battery: EvaluationBattery;
  simulations: TargetedSimulation[];
  recommendedThresholds: { evaluable: number; good: number; excellent: number; minimumObservations: number; minimumDistinctExercises: number };
};

const round = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
const normalize = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const combinedText = (exercise: Exercise) => normalize([exercise.nome, exercise.obiettivo, exercise.descrizione, exercise.schema_step_1, exercise.schema_step_2, exercise.schema_step_3, exercise.schema_step_4, exercise.schema_step_5, exercise.schema_step_6, exercise.scenario_gara, exercise.numero_azioni, exercise.materiale].filter(Boolean).join(" "));
const actionTypes = (exercise: Exercise) => new Set((exercise.tactical_diagram?.actions ?? []).map(action => action.type));

const PHASE_BASE: Record<string, { observability: number; specificity: number }> = {
  Analitico: { observability: .91, specificity: .94 },
  Disturbo: { observability: .82, specificity: .80 },
  Situazionale: { observability: .73, specificity: .68 },
  "Integrato guidato": { observability: .75, specificity: .69 },
  "Integrato variabile": { observability: .66, specificity: .58 },
  "Situazionale complesso": { observability: .58, specificity: .49 },
  "Scenario aperto": { observability: .48, specificity: .39 },
};

function complexityOf(exercise: Exercise): ExerciseComplexity {
  const actionCount = exercise.tactical_diagram?.actions.length ?? 0;
  const elementCount = exercise.tactical_diagram?.elements.length ?? 0;
  const openPhase = ["Scenario aperto", "Situazionale complesso"].includes(exercise.fase);
  if (openPhase || actionCount >= 6 || elementCount >= 13 || exercise.difficolta >= 5) return "HIGH";
  if (actionCount >= 3 || elementCount >= 8 || exercise.difficolta >= 3 || ["Situazionale", "Integrato variabile"].includes(exercise.fase)) return "MEDIUM";
  return "LOW";
}

function confidenceFor(score: number, hasTacticalEvidence: boolean, complexity: ExerciseComplexity, primary: boolean): MappingConfidence {
  if (score >= .78 && hasTacticalEvidence && (primary || complexity !== "HIGH")) return "HIGH";
  if (score >= .50 && (hasTacticalEvidence || primary)) return "MEDIUM";
  return "LOW";
}

function technicalMapping(exercise: Exercise, target: ExerciseSubcategory, role: "PRIMARY" | "SECONDARY"): EvaluationMapping {
  const phase = PHASE_BASE[exercise.fase] ?? PHASE_BASE.Situazionale;
  const actions = actionTypes(exercise);
  const complexity = complexityOf(exercise);
  const text = combinedText(exercise);
  const targetText = normalize(target.nome);
  const explicit = targetText.length >= 5 && text.includes(targetText);
  const hasTacticalEvidence = actions.size > 0 && [...actions].some(action => text.includes(action));
  const primary = role === "PRIMARY";
  const complexityPenalty = complexity === "HIGH" ? .11 : complexity === "MEDIUM" ? .04 : 0;
  const secondaryPenalty = primary ? 0 : .12;
  const observability = round(phase.observability + (explicit ? .04 : -.03) + (hasTacticalEvidence ? .03 : -.02) - complexityPenalty - secondaryPenalty);
  const specificity = round(phase.specificity + (explicit ? .04 : -.05) - complexityPenalty * 1.25 - secondaryPenalty);
  const suitability = round(observability * .48 + specificity * .42 + (primary ? .10 : .03));
  const confidence = confidenceFor(suitability, hasTacticalEvidence || explicit, complexity, primary);
  const evidence = primary
    ? `${exercise.fase}: la sottocategoria ufficiale è il focus tecnico primario${hasTacticalEvidence ? " e le azioni Tactical ne rendono osservabile l'esecuzione" : ""}.`
    : `Target secondario esplicitamente presente nello svolgimento; osservazione meno isolata rispetto al focus ${exercise.sottocategoria}.`;
  return { id: `T:${exercise.id}:${target.id}`, exercise, targetType: "TECHNICAL", targetId: String(target.id), targetCode: `SUB-${target.id}`, targetName: target.nome, aggregateName: exercise.categoria, role, evaluationSuitability: suitability, observabilityWeight: observability, specificityWeight: specificity, confidence, evidenceNotes: evidence, tacticalFamily: classifyTacticalFamily(exercise), complexity };
}

const ACTION_CUES: Array<[RegExp, string[]]> = [
  [/reatt|reaz|stimolo|decision/, ["tuffo", "tiro", "recupero"]],
  [/esplos|potenza|spinta/, ["tuffo", "corsa", "recupero"]],
  [/rapid|veloc|acceler/, ["corsa", "recupero", "movimento"]],
  [/coordin|agilit|cambio direzione/, ["movimento", "corsa", "recupero", "tuffo"]],
  [/timing|tempo di intervento/, ["cross", "tiro", "passaggio"]],
  [/tecnica di corsa|locomoz/, ["corsa", "movimento"]],
  [/equilibr|stabil/, ["tuffo", "recupero", "movimento"]],
];

function dedicatedProtocol(objective: PhysicalObjective): boolean {
  const text = normalize(`${objective.macro_area} ${objective.obiettivo_fisico} ${objective.descrizione}`);
  return /forza massima|forza generale|mobilita|flessibil|prevenzione|propriocett|asimmetr|aerobica generale|capacita aerobica|recupero rigenerativo/.test(text);
}

function physicalMapping(exercise: Exercise, relation: ExercisePhysicalObjective, aggregateName: string): EvaluationMapping {
  const objective = relation.physical_objective;
  const phase = PHASE_BASE[exercise.fase] ?? PHASE_BASE.Situazionale;
  const complexity = complexityOf(exercise);
  const text = combinedText(exercise);
  const objectiveText = normalize(`${objective.obiettivo_fisico} ${objective.macro_area}`);
  const actions = actionTypes(exercise);
  const cue = ACTION_CUES.find(([regex]) => regex.test(objectiveText));
  const tacticalEvidence = cue ? cue[1].some(action => actions.has(action as never)) : false;
  const textualEvidence = objectiveText.split(" ").filter(token => token.length >= 6).some(token => text.includes(token)) || normalize(relation.motivazione).split(" ").filter(token => token.length >= 6).some(token => text.includes(token));
  const roleBase = relation.ruolo === "Principale" ? .73 : relation.ruolo === "Secondario" ? .58 : .42;
  const weightBonus = (relation.peso - 3) * .035;
  const complexityPenalty = complexity === "HIGH" ? (tacticalEvidence ? .05 : .13) : complexity === "MEDIUM" ? .04 : 0;
  const protocol = dedicatedProtocol(objective);
  const observability = round(roleBase + weightBonus + (tacticalEvidence ? .13 : 0) + (textualEvidence ? .08 : 0) - complexityPenalty - (protocol ? .24 : 0));
  const specificity = round(roleBase + weightBonus + (tacticalEvidence ? .09 : -.04) + (textualEvidence ? .07 : 0) - complexityPenalty * 1.2 - (protocol ? .27 : 0) + (phase.specificity - .68) * .18);
  const suitability = round(observability * .50 + specificity * .40 + (relation.ruolo === "Principale" ? .10 : relation.ruolo === "Secondario" ? .04 : 0) - (protocol ? .06 : 0));
  const physicalObservability: PhysicalObservability = suitability >= .85 ? "HIGHLY_OBSERVABLE" : suitability >= .65 ? "OBSERVABLE" : suitability >= .45 ? "WEAKLY_OBSERVABLE" : suitability >= .25 ? "TRAINING_ONLY" : "NOT_EVALUABLE";
  const evidence = protocol
    ? `Capacità allenata nella seduta, ma una misura affidabile richiede un protocollo fisico dedicato e standardizzato.`
    : tacticalEvidence
      ? `${relation.ruolo} (peso ${relation.peso}/5): le azioni Tactical confermano un comportamento del portiere coerente con ${objective.obiettivo_fisico}.`
      : `${relation.ruolo} (peso ${relation.peso}/5): capacità coinvolta, ma non completamente isolata dalle altre richieste dell'esercizio.`;
  return { id: `P:${exercise.id}:${objective.id}`, exercise, targetType: "PHYSICAL", targetId: objective.id, targetCode: objective.codice, targetName: objective.obiettivo_fisico, aggregateName, role: relation.ruolo, evaluationSuitability: suitability, observabilityWeight: observability, specificityWeight: specificity, confidence: confidenceFor(suitability, tacticalEvidence || textualEvidence, complexity, relation.ruolo === "Principale"), evidenceNotes: evidence, physicalObservability, physicalFeasibility: protocol ? "REQUIRES_DEDICATED_PROTOCOL" : "CATALOG_EVALUABLE", tacticalFamily: classifyTacticalFamily(exercise), complexity };
}

export function classifyParameterHealth(good: number, evaluable: number, contexts: number): ParameterHealth {
  if (good >= 3 && contexts >= 2) return "STRONG";
  if (evaluable >= 2) return "ADEQUATE";
  if (evaluable === 1) return "WEAK";
  return "UNCOVERED";
}

function coverageFor(targetType: EvaluationTargetType, targets: Array<{ id: string; code: string; name: string; aggregateName: string; feasibility?: PhysicalFeasibility }>, mappings: EvaluationMapping[]): ParameterCoverage[] {
  return targets.map(target => {
    const rows = mappings.filter(mapping => mapping.targetId === target.id);
    const evaluableRows = rows.filter(mapping => mapping.evaluationSuitability >= .50);
    const contexts = [...new Set(evaluableRows.map(mapping => mapping.exercise.fase))].sort();
    const good = rows.filter(mapping => mapping.evaluationSuitability >= .70).length;
    return { targetType, targetId: target.id, code: target.code, name: target.name, aggregateName: target.aggregateName, total: new Set(rows.map(mapping => mapping.exercise.id)).size, evaluable: new Set(evaluableRows.map(mapping => mapping.exercise.id)).size, good, excellent: rows.filter(mapping => mapping.evaluationSuitability >= .85).length, contexts, supportsTwoDistinctExercises: new Set(evaluableRows.map(mapping => mapping.exercise.id)).size >= 2, health: classifyParameterHealth(good, new Set(evaluableRows.map(mapping => mapping.exercise.id)).size, contexts.length), feasibility: target.feasibility };
  }).sort((a, b) => a.aggregateName.localeCompare(b.aggregateName) || a.name.localeCompare(b.name));
}

function buildRisks(exercises: Exercise[], allMappings: EvaluationMapping[], objectives: PhysicalObjective[]): { falsePositive: MappingRisk[]; falseNegative: MappingRisk[] } {
  const falsePositive = allMappings.filter(mapping => mapping.targetType === "PHYSICAL" && (mapping.confidence === "LOW" || (mapping.role === "Complementare" && mapping.evaluationSuitability < .50))).map(mapping => ({ exerciseCode: mapping.exercise.codice, target: mapping.targetName, reason: mapping.physicalFeasibility === "REQUIRES_DEDICATED_PROTOCOL" ? "Capacità allenabile ma non misurabile in modo affidabile senza protocollo dedicato." : "Relazione debole o complementare, non confermata in modo sufficiente dalle azioni Tactical.", severity: mapping.evaluationSuitability < .30 ? "HIGH" as const : "MEDIUM" as const }));
  const falseNegative: MappingRisk[] = [];
  for (const exercise of exercises) {
    const mapped = new Set((exercise.physical_mappings ?? []).map(item => item.physical_objective_id));
    const text = combinedText(exercise);
    for (const objective of objectives) {
      if (mapped.has(objective.id) || dedicatedProtocol(objective)) continue;
      const tokens = normalize(objective.obiettivo_fisico).split(" ").filter(token => token.length >= 7);
      if (tokens.length && tokens.some(token => text.includes(token))) falseNegative.push({ exerciseCode: exercise.codice, target: objective.obiettivo_fisico, reason: "Il testo contiene un indizio specifico, ma non esiste una relazione FIS: richiede revisione umana, non correzione automatica.", severity: "MEDIUM" });
    }
  }
  return { falsePositive: falsePositive.slice(0, 120), falseNegative: falseNegative.slice(0, 120) };
}

function greedyBattery(mappings: EvaluationMapping[], coverages: ParameterCoverage[], maxExercises = 14): EvaluationBattery {
  const targetIds = new Set(coverages.filter(row => row.health === "STRONG" && row.feasibility !== "REQUIRES_DEDICATED_PROTOCOL").map(row => `${row.targetType}:${row.targetId}`));
  const candidates = new Map<string, EvaluationMapping[]>();
  for (const mapping of mappings.filter(row => row.evaluationSuitability >= .70 && targetIds.has(`${row.targetType}:${row.targetId}`))) {
    const list = candidates.get(mapping.exercise.id) ?? []; list.push(mapping); candidates.set(mapping.exercise.id, list);
  }
  const observations = new Map<string, number>();
  const chosen: BatteryExercise[] = [];
  while (chosen.length < maxExercises) {
    let best: { exercise: Exercise; rows: EvaluationMapping[]; gain: number } | null = null;
    for (const rows of candidates.values()) {
      if (chosen.some(item => item.exercise.id === rows[0].exercise.id)) continue;
      const gain = rows.reduce((sum, row) => sum + Math.max(0, 2 - (observations.get(`${row.targetType}:${row.targetId}`) ?? 0)) * row.evaluationSuitability, 0);
      if (!best || gain > best.gain || (gain === best.gain && rows[0].exercise.durata_min < best.exercise.durata_min)) best = { exercise: rows[0].exercise, rows, gain };
    }
    if (!best || best.gain <= 0) break;
    const coveredTargets = best.rows.map(row => `${row.targetType === "TECHNICAL" ? "Tecnica" : "Fisico"}: ${row.targetName}`);
    chosen.push({ exercise: best.exercise, coveredTargets, newObservations: best.rows.length });
    for (const row of best.rows) { const key = `${row.targetType}:${row.targetId}`; observations.set(key, (observations.get(key) ?? 0) + 1); }
  }
  const targetNames = coverages.filter(row => targetIds.has(`${row.targetType}:${row.targetId}`)).map(row => `${row.targetType === "TECHNICAL" ? "Tecnica" : "Fisico"}: ${row.name}`);
  const twice = coverages.filter(row => (observations.get(`${row.targetType}:${row.targetId}`) ?? 0) >= 2).map(row => `${row.targetType === "TECHNICAL" ? "Tecnica" : "Fisico"}: ${row.name}`);
  const gaps = coverages.filter(row => targetIds.has(`${row.targetType}:${row.targetId}`) && (observations.get(`${row.targetType}:${row.targetId}`) ?? 0) < 2).map(row => `${row.name}: ${observations.get(`${row.targetType}:${row.targetId}`) ?? 0}/2 osservazioni`);
  return { exercises: chosen, targets: targetNames, targetsObservedTwice: twice, estimatedDuration: chosen.reduce((sum, item) => sum + item.exercise.durata_min, 0), gaps };
}

function simulate(label: string, technicalQuery: string, physicalQuery: string, technical: ParameterCoverage[], physical: ParameterCoverage[], mappings: EvaluationMapping[]): TargetedSimulation {
  const tq = normalize(technicalQuery), pq = normalize(physicalQuery);
  const technicalTarget = technical.find(row => normalize(row.name).includes(tq) || tq.includes(normalize(row.name))) ?? technical.find(row => normalize(row.name).split(" ").some(token => token.length > 3 && tq.includes(token)));
  const physicalTarget = physical.find(row => normalize(row.name).includes(pq) || pq.includes(normalize(row.name))) ?? physical.find(row => normalize(row.aggregateName).includes(pq));
  if (!technicalTarget || !physicalTarget) return { label, technicalQuery, physicalQuery, resolvedTechnical: technicalTarget?.name ?? null, resolvedPhysical: physicalTarget?.name ?? null, exercises: [], gap: "Uno dei parametri richiesti non è stato risolto nella tassonomia reale." };
  const ranked = new Map<string, EvaluationMapping[]>();
  for (const mapping of mappings.filter(row => (row.targetType === "TECHNICAL" && row.targetId === technicalTarget.targetId) || (row.targetType === "PHYSICAL" && row.targetId === physicalTarget.targetId))) { const rows = ranked.get(mapping.exercise.id) ?? []; rows.push(mapping); ranked.set(mapping.exercise.id, rows); }
  const exercises = [...ranked.values()].map(rows => ({ exercise: rows[0].exercise, coveredTargets: rows.map(row => row.targetName), newObservations: rows.length })).sort((a, b) => b.newObservations - a.newObservations || b.coveredTargets.length - a.coveredTargets.length || a.exercise.codice.localeCompare(b.exercise.codice)).slice(0, 4);
  return { label, technicalQuery, physicalQuery, resolvedTechnical: technicalTarget.name, resolvedPhysical: physicalTarget.name, exercises, gap: exercises.some(item => item.coveredTargets.length >= 2) ? null : "Nessun singolo esercizio copre entrambi i target: proposta combinata da validare." };
}

export function buildEvaluationMappingAudit(input: { exercises: Exercise[]; subcategories: ExerciseSubcategory[]; physicalObjectives: PhysicalObjective[]; physicalDimensions?: PhysicalAssessmentDimension[] }): EvaluationMappingAuditReport {
  const { exercises, subcategories, physicalObjectives, physicalDimensions = [] } = input;
  const subcategoryById = new Map(subcategories.map(item => [item.id, item]));
  const dimensionNamesByObjective = new Map<string, string[]>();
  for (const dimension of physicalDimensions) for (const relation of dimension.objective_mappings ?? []) {
    const names = dimensionNamesByObjective.get(relation.physical_objective.id) ?? [];
    if (!names.includes(dimension.nome)) names.push(dimension.nome);
    dimensionNamesByObjective.set(relation.physical_objective.id, names);
  }
  const physicalAggregateName = (objective: PhysicalObjective) => dimensionNamesByObjective.get(objective.id)?.join(" · ") || objective.macro_area;
  const technicalMappings: EvaluationMapping[] = [];
  const physicalMappings: EvaluationMapping[] = [];
  for (const exercise of exercises) {
    const primary = subcategoryById.get(exercise.subcategory_id);
    if (primary) technicalMappings.push(technicalMapping(exercise, primary, "PRIMARY"));
    const text = combinedText(exercise);
    for (const candidate of subcategories) {
      if (candidate.id === exercise.subcategory_id || candidate.category_id !== exercise.category_id) continue;
      const label = normalize(candidate.nome);
      if (label.length >= 7 && text.includes(label)) technicalMappings.push(technicalMapping(exercise, candidate, "SECONDARY"));
    }
    for (const relation of exercise.physical_mappings ?? []) if (relation.attivo && relation.physical_objective) physicalMappings.push(physicalMapping(exercise, relation, physicalAggregateName(relation.physical_objective)));
  }
  const physicalFeasibility = new Map(physicalObjectives.map(item => [item.id, dedicatedProtocol(item) ? "REQUIRES_DEDICATED_PROTOCOL" as const : "CATALOG_EVALUABLE" as const]));
  const technicalCoverage = coverageFor("TECHNICAL", subcategories.map(item => ({ id: String(item.id), code: `SUB-${item.id}`, name: item.nome, aggregateName: exercises.find(exercise => exercise.category_id === item.category_id)?.categoria ?? `Categoria ${item.category_id}` })), technicalMappings);
  const physicalCoverage = coverageFor("PHYSICAL", physicalObjectives.map(item => ({ id: item.id, code: item.codice, name: item.obiettivo_fisico, aggregateName: physicalAggregateName(item), feasibility: physicalFeasibility.get(item.id) })), physicalMappings);
  const allMappings = [...technicalMappings, ...physicalMappings];
  const allCoverage = [...technicalCoverage, ...physicalCoverage];
  const byExercise = new Map<string, EvaluationMapping[]>();
  for (const mapping of allMappings.filter(item => item.evaluationSuitability >= .50)) { const rows = byExercise.get(mapping.exercise.id) ?? []; rows.push(mapping); byExercise.set(mapping.exercise.id, rows); }
  const goodMultiTarget = [...byExercise.values()].filter(rows => rows.filter(item => item.evaluationSuitability >= .70).length >= 2 && rows.length <= 5).map(rows => ({ exercise: rows[0].exercise, mappings: rows.sort((a, b) => b.evaluationSuitability - a.evaluationSuitability) })).sort((a, b) => b.mappings.length - a.mappings.length || a.exercise.codice.localeCompare(b.exercise.codice));
  const overloaded = [...byExercise.values()].filter(rows => rows.length >= 6 || (rows[0].complexity === "HIGH" && rows.length >= 4)).map(rows => ({ exercise: rows[0].exercise, mappings: rows, reason: `${rows.length} target valutabili in un contesto ${rows[0].complexity}: rischio di osservazione dispersa.` })).sort((a, b) => b.mappings.length - a.mappings.length);
  const risks = buildRisks(exercises, allMappings, physicalObjectives);
  const complexity = (["LOW", "MEDIUM", "HIGH"] as const).map(level => { const rows = allMappings.filter(item => item.complexity === level); return { level, mappings: rows.length, averageSuitability: round(rows.reduce((sum, item) => sum + item.evaluationSuitability, 0) / Math.max(1, rows.length)), averageSpecificity: round(rows.reduce((sum, item) => sum + item.specificityWeight, 0) / Math.max(1, rows.length)) }; });
  const battery = greedyBattery(allMappings, allCoverage);
  const simulations = [
    simulate("A", "Tuffo", "Reattività", technicalCoverage, physicalCoverage, allMappings),
    simulate("B", "1vs1", "Esplosività", technicalCoverage, physicalCoverage, allMappings),
    simulate("C", "Uscite alte", "Coordinazione", technicalCoverage, physicalCoverage, allMappings),
    simulate("D", "Gioco di piede", "Rapidità", technicalCoverage, physicalCoverage, allMappings),
    simulate("E", "Parate ravvicinate", "Reattività", technicalCoverage, physicalCoverage, allMappings),
  ];
  return { catalogSize: exercises.length, exercisesAnalyzed: exercises.length, technicalMappings, physicalMappings, allMappings, technicalCoverage, physicalCoverage, strongParameters: allCoverage.filter(item => item.health === "STRONG"), adequateParameters: allCoverage.filter(item => item.health === "ADEQUATE"), weakParameters: allCoverage.filter(item => item.health === "WEAK"), uncoveredParameters: allCoverage.filter(item => item.health === "UNCOVERED"), dedicatedProtocol: physicalCoverage.filter(item => item.feasibility === "REQUIRES_DEDICATED_PROTOCOL"), highConfidence: allMappings.filter(item => item.confidence === "HIGH").sort((a, b) => b.evaluationSuitability - a.evaluationSuitability), mediumConfidence: allMappings.filter(item => item.confidence === "MEDIUM").sort((a, b) => b.evaluationSuitability - a.evaluationSuitability), lowConfidence: allMappings.filter(item => item.confidence === "LOW").sort((a, b) => a.evaluationSuitability - b.evaluationSuitability), falsePositiveRisks: risks.falsePositive, falseNegativeRisks: risks.falseNegative, goodMultiTarget, overloaded, complexity, battery, simulations, recommendedThresholds: { evaluable: .50, good: .70, excellent: .85, minimumObservations: 2, minimumDistinctExercises: 2 } };
}
