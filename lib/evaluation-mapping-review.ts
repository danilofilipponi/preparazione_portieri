import type { EvaluationMapping, EvaluationMappingAuditReport, EvaluationTargetType, ParameterCoverage } from "./evaluation-mapping-audit.ts";
import { bootstrapEvaluationMappings, coverageToEngineTargets, planEvaluationSession, proposeCoreEvaluationTargets, targetKey, type CoverageStatus, type EvaluationEngineResult, type EvaluationEngineTarget, type EvaluationMappingDecision } from "./evaluation-session-engine.ts";
import type { Exercise } from "./types.ts";

export type ReviewProposal = "RECOMMEND_APPROVE" | "REVIEW" | "RECOMMEND_REJECT";
export type HumanReviewDecision = "APPROVE" | "KEEP_REVIEW" | "REJECT";

export const TARGETED_EVALUATION_REQUESTS = Object.freeze([
  { label: "Tuffo + Reattività", technicalQuery: "tuffo", physicalQuery: "reatt" },
  { label: "1vs1 + Esplosività", technicalQuery: "1vs1", physicalQuery: "esplos" },
  { label: "Uscite alte + Coordinazione", technicalQuery: "uscite alte", physicalQuery: "coordin" },
  { label: "Gioco di piede + Rapidità", technicalQuery: "cambio gioco", physicalQuery: "rapid" },
  { label: "Parate ravvicinate + Reattività", technicalQuery: "combo tecniche", physicalQuery: "reatt" },
]);

export type MappingReviewCandidate = {
  mapping: EvaluationMapping;
  target: EvaluationEngineTarget;
  coverageBefore: CoverageStatus;
  proposal: ReviewProposal;
  reviewPriority: number;
  rationale: string[];
  risks: string[];
  core: boolean;
  targetedLabels: string[];
};

export type ObservationSummary = {
  mapping: EvaluationMapping;
  contextRelation: "same context" | "different contexts" | "single observation";
};

export type CoreTargetReview = {
  target: EvaluationEngineTarget;
  coverage: ParameterCoverage;
  coverageBefore: CoverageStatus;
  autoApprovedMappings: EvaluationMapping[];
  mediumCandidates: MappingReviewCandidate[];
  reliableExercises: Exercise[];
  observations: number;
  distinctExercises: number;
  distinctContexts: string[];
  bestObservation: ObservationSummary | null;
  secondBestObservation: ObservationSummary | null;
  coreRecommendation: "CORE_KEEP" | "CORE_REPLACE" | "CORE_PROTOCOL" | "CORE_OPTIONAL";
  recommendationReason: string;
};

export type SimulationMetrics = {
  exercises: number;
  exerciseCodes: string[];
  estimatedDuration: number;
  fullyCovered: number;
  partiallyCovered: number;
  uncovered: number;
  protocolOnly: number;
  parametersWithTwoObservations: number;
  parametersWithTwoDistinctExercises: number;
  variety: number;
  redundancy: number;
  averageSuitability: number;
  averageObservability: number;
};

export type BeforeAfterSimulation = {
  label: string;
  targets: EvaluationEngineTarget[];
  before: EvaluationEngineResult;
  after: EvaluationEngineResult;
  beforeMetrics: SimulationMetrics;
  afterMetrics: SimulationMetrics;
};

export type EvaluationMappingReviewReport = {
  coreTargets: CoreTargetReview[];
  targetedTargets: EvaluationEngineTarget[];
  candidates: MappingReviewCandidate[];
  counts: { analyzed: number; recommendApprove: number; review: number; recommendReject: number };
  complete: BeforeAfterSimulation;
  extended: BeforeAfterSimulation;
  targeted: BeforeAfterSimulation[];
  remainingGaps: CoreTargetReview[];
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function findEvaluationTarget(targets: EvaluationEngineTarget[], type: EvaluationTargetType, query: string) {
  const needle = normalize(query);
  const rows = targets.filter(target => target.targetType === type);
  return rows.find(target => normalize(target.name).includes(needle))
    ?? rows.find(target => normalize(target.aggregateName).includes(needle))
    ?? rows.find(target => normalize(target.name).split(/\s+/).some(token => token.length > 4 && needle.includes(token)))
    ?? null;
}

function actionEvidence(mapping: EvaluationMapping) {
  const actions = mapping.exercise.tactical_diagram?.actions ?? [];
  if (!actions.length) return false;
  const text = normalize(`${mapping.targetName} ${mapping.aggregateName}`);
  const types = new Set(actions.map(action => normalize(action.type)));
  const cues: Array<[RegExp, string[]]> = [
    [/tuff|presa|parate|intervento/, ["tuffo", "tiro", "recupero"]],
    [/uscit|cross/, ["cross", "movimento", "presa"]],
    [/piede|passagg|rilancio|cambio gioco/, ["passaggio", "conduzione", "rilancio"]],
    [/1vs1|duello|ravvicinat/, ["tiro", "uscita", "movimento"]],
    [/reatt|rapid|veloc|esplos|coordin|agilit/, ["tuffo", "tiro", "movimento", "corsa", "recupero"]],
  ];
  const cue = cues.find(([regex]) => regex.test(text));
  return cue ? cue[1].some(type => types.has(type)) : actions.length >= 2;
}

export function classifyReviewCandidate(mapping: EvaluationMapping): { proposal: ReviewProposal; rationale: string[]; risks: string[] } {
  const rationale: string[] = [];
  const risks: string[] = [];
  const tactical = actionEvidence(mapping);
  const primary = mapping.role === "PRIMARY" || mapping.role === "Principale";
  const physical = mapping.targetType === "PHYSICAL";

  if (mapping.physicalFeasibility === "REQUIRES_DEDICATED_PROTOCOL") {
    return { proposal: "RECOMMEND_REJECT", rationale: ["La capacità richiede un protocollo fisico dedicato."], risks: ["La domanda fisica non equivale a osservabilità valutativa."] };
  }
  if (mapping.evaluationSuitability < .50 || mapping.observabilityWeight < .48 || mapping.specificityWeight < .44) {
    return { proposal: "RECOMMEND_REJECT", rationale: ["Non raggiunge la soglia minima di valutabilità affidabile."], risks: ["Possibile relazione training-only o parametro solo citato."] };
  }
  if (physical && ["TRAINING_ONLY", "NOT_EVALUABLE"].includes(mapping.physicalObservability ?? "")) {
    return { proposal: "RECOMMEND_REJECT", rationale: ["La capacità è richiesta dall’esercizio ma non è misurabile con sufficiente affidabilità."], risks: ["Falso positivo tra physical demand e physical observability."] };
  }
  if (!primary) risks.push("Il parametro non è il focus primario dell’esercizio.");
  if (mapping.complexity === "HIGH") risks.push("Il contesto complesso riduce l’isolabilità del parametro.");
  if (!tactical) risks.push("La Tactical Board non conferma in modo esplicito l’azione associata.");
  if (mapping.specificityWeight < .62) risks.push("Specificità limitata rispetto al target.");
  if (mapping.observabilityWeight < .65) risks.push("Osservabilità sul campo non pienamente robusta.");

  const approve = mapping.evaluationSuitability >= .70
    && mapping.observabilityWeight >= .68
    && mapping.specificityWeight >= .62
    && primary
    && tactical
    && mapping.complexity !== "HIGH"
    && (!physical || ["OBSERVABLE", "HIGHLY_OBSERVABLE"].includes(mapping.physicalObservability ?? ""));

  if (approve) {
    rationale.push("Target direttamente osservabile e ripetibile in un setup coerente.");
    rationale.push("Suitability, osservabilità e specificità superano le soglie conservative della review.");
    return { proposal: "RECOMMEND_APPROVE", rationale, risks };
  }
  rationale.push("Relazione plausibile, ma non sufficientemente isolata per una promozione automatica.");
  return { proposal: "REVIEW", rationale, risks };
}

export function coverageStatusForMappings(target: EvaluationEngineTarget, mappings: EvaluationMapping[]): CoverageStatus {
  if (target.feasibility === "REQUIRES_DEDICATED_PROTOCOL") return "REQUIRES_PROTOCOL";
  const reliable = mappings.filter(mapping => mapping.evaluationSuitability >= .50 && mapping.observabilityWeight >= .50 && mapping.specificityWeight >= .48);
  const distinct = new Set(reliable.map(mapping => mapping.exercise.id)).size;
  return distinct >= target.requiredDistinctExercises ? "COVERED" : distinct ? "PARTIALLY_COVERED" : "NOT_COVERED";
}

export function calculateReviewPriority(mapping: EvaluationMapping, status: CoverageStatus, core: boolean, targetedCount: number, alternatives: number) {
  const gapImpact = status === "NOT_COVERED" ? 1 : status === "PARTIALLY_COVERED" ? .72 : .2;
  const scarcity = 1 / Math.max(1, alternatives);
  const score = 100 * (
    gapImpact * .28
    + mapping.evaluationSuitability * .18
    + mapping.observabilityWeight * .17
    + mapping.specificityWeight * .14
    + (core ? 1 : 0) * .12
    + Math.min(1, targetedCount) * .07
    + scarcity * .04
  );
  return round(score, 1);
}

export function buildApproveOnlyDecisions(audit: EvaluationMappingAuditReport, approved: Set<string>): EvaluationMappingDecision[] {
  const bootstrap = bootstrapEvaluationMappings(audit);
  return bootstrap.decisions.map(decision => approved.has(decision.mapping.id)
    ? { ...decision, mappingStatus: "auto_approved", active: true, reason: "Incluso esclusivamente nella simulazione RECOMMEND_APPROVE." }
    : decision);
}

export function summarizeSimulation(result: EvaluationEngineResult): SimulationMetrics {
  const mappings = result.selectedExercises.flatMap(row => row.mappings);
  const contexts = new Set(result.selectedExercises.map(row => `${row.exercise.categoria}:${row.exercise.fase}`));
  const representedTargets = new Map<string, number>();
  for (const row of mappings) {
    const key = targetKey(row.mapping.targetType, row.mapping.targetId);
    representedTargets.set(key, (representedTargets.get(key) ?? 0) + 1);
  }
  const redundant = [...representedTargets.values()].reduce((sum, value) => sum + Math.max(0, value - 2), 0);
  return {
    exercises: result.selectedExercises.length,
    exerciseCodes: result.selectedExercises.map(row => row.exercise.codice),
    estimatedDuration: result.estimatedDuration,
    fullyCovered: result.coverageMatrix.filter(row => row.status === "COVERED").length,
    partiallyCovered: result.coverageMatrix.filter(row => row.status === "PARTIALLY_COVERED").length,
    uncovered: result.coverageMatrix.filter(row => row.status === "NOT_COVERED").length,
    protocolOnly: result.coverageMatrix.filter(row => row.status === "REQUIRES_PROTOCOL").length,
    parametersWithTwoObservations: result.coverageMatrix.filter(row => row.observationCount >= 2).length,
    parametersWithTwoDistinctExercises: result.coverageMatrix.filter(row => row.distinctExercises >= 2).length,
    variety: contexts.size,
    redundancy: redundant,
    averageSuitability: round(mappings.reduce((sum, row) => sum + row.mapping.evaluationSuitability, 0) / Math.max(1, mappings.length)),
    averageObservability: round(mappings.reduce((sum, row) => sum + row.mapping.observabilityWeight, 0) / Math.max(1, mappings.length)),
  };
}

function simulate(label: string, exercises: Exercise[], beforeDecisions: EvaluationMappingDecision[], afterDecisions: EvaluationMappingDecision[], targets: EvaluationEngineTarget[], maximumDuration: number, maximumExercises: number): BeforeAfterSimulation {
  const evaluationType = label.startsWith("Complete") ? "Complete" as const : "Targeted" as const;
  const before = planEvaluationSession({ evaluationType, exercises, mappingDecisions: beforeDecisions, selectedTargets: targets, maximumDuration, maximumExercises });
  const after = planEvaluationSession({ evaluationType, exercises, mappingDecisions: afterDecisions, selectedTargets: targets, maximumDuration, maximumExercises });
  return { label, targets, before, after, beforeMetrics: summarizeSimulation(before), afterMetrics: summarizeSimulation(after) };
}

export function buildEvaluationMappingReview(audit: EvaluationMappingAuditReport, exercises: Exercise[]): EvaluationMappingReviewReport {
  const allTargets = coverageToEngineTargets([...audit.technicalCoverage, ...audit.physicalCoverage]);
  const coreTargets = proposeCoreEvaluationTargets(audit);
  const coreKeys = new Set(coreTargets.map(target => target.key));
  const targetedGroups = TARGETED_EVALUATION_REQUESTS.map(request => ({
    ...request,
    targets: [findEvaluationTarget(allTargets, "TECHNICAL", request.technicalQuery), findEvaluationTarget(allTargets, "PHYSICAL", request.physicalQuery)].filter(Boolean) as EvaluationEngineTarget[],
  }));
  const targetedLabelsByKey = new Map<string, string[]>();
  for (const group of targetedGroups) for (const target of group.targets) targetedLabelsByKey.set(target.key, [...(targetedLabelsByKey.get(target.key) ?? []), group.label]);
  const priorityKeys = new Set([...coreKeys, ...targetedLabelsByKey.keys()]);
  const bootstrap = bootstrapEvaluationMappings(audit);
  const approvedByTarget = new Map<string, EvaluationMapping[]>();
  for (const decision of bootstrap.decisions.filter(row => row.active)) {
    const key = targetKey(decision.mapping.targetType, decision.mapping.targetId);
    approvedByTarget.set(key, [...(approvedByTarget.get(key) ?? []), decision.mapping]);
  }
  const mediumByTarget = new Map<string, EvaluationMapping[]>();
  for (const mapping of audit.mediumConfidence.filter(row => priorityKeys.has(targetKey(row.targetType, row.targetId)))) {
    const key = targetKey(mapping.targetType, mapping.targetId);
    mediumByTarget.set(key, [...(mediumByTarget.get(key) ?? []), mapping]);
  }
  const candidates: MappingReviewCandidate[] = [];
  for (const target of allTargets.filter(row => priorityKeys.has(row.key))) {
    const current = approvedByTarget.get(target.key) ?? [];
    const status = coverageStatusForMappings(target, current);
    for (const mapping of mediumByTarget.get(target.key) ?? []) {
      const classification = classifyReviewCandidate(mapping);
      candidates.push({ mapping, target, coverageBefore: status, proposal: classification.proposal, reviewPriority: calculateReviewPriority(mapping, status, coreKeys.has(target.key), targetedLabelsByKey.get(target.key)?.length ?? 0, current.length), rationale: classification.rationale, risks: classification.risks, core: coreKeys.has(target.key), targetedLabels: targetedLabelsByKey.get(target.key) ?? [] });
    }
  }
  const coverageRank: Record<CoverageStatus, number> = { NOT_COVERED: 0, PARTIALLY_COVERED: 1, REQUIRES_PROTOCOL: 2, COVERED: 3 };
  candidates.sort((a, b) => coverageRank[a.coverageBefore] - coverageRank[b.coverageBefore] || b.reviewPriority - a.reviewPriority || a.mapping.exercise.codice.localeCompare(b.mapping.exercise.codice));
  const approveIds = new Set(candidates.filter(candidate => candidate.proposal === "RECOMMEND_APPROVE").map(candidate => candidate.mapping.id));
  const beforeDecisions = bootstrap.decisions;
  const afterDecisions = buildApproveOnlyDecisions(audit, approveIds);
  const coverageByKey = new Map([...audit.technicalCoverage, ...audit.physicalCoverage].map(row => [targetKey(row.targetType, row.targetId), row]));
  const coreReview: CoreTargetReview[] = coreTargets.map(target => {
    const auto = approvedByTarget.get(target.key) ?? [];
    const medium = candidates.filter(candidate => candidate.target.key === target.key);
    const status = coverageStatusForMappings(target, auto);
    const ranked = [...auto].sort((a, b) => b.evaluationSuitability - a.evaluationSuitability || b.observabilityWeight - a.observabilityWeight);
    const contexts = [...new Set(auto.map(mapping => mapping.exercise.fase))];
    const contextRelation = ranked.length < 2 ? "single observation" as const : ranked[0].exercise.fase === ranked[1].exercise.fase ? "same context" as const : "different contexts" as const;
    const proposalCount = medium.filter(row => row.proposal === "RECOMMEND_APPROVE").length;
    const recommendation = target.feasibility === "REQUIRES_DEDICATED_PROTOCOL" ? "CORE_PROTOCOL" as const : status === "COVERED" ? "CORE_KEEP" as const : proposalCount ? "CORE_KEEP" as const : status === "PARTIALLY_COVERED" ? "CORE_OPTIONAL" as const : "CORE_REPLACE" as const;
    return { target, coverage: coverageByKey.get(target.key)!, coverageBefore: status, autoApprovedMappings: auto, mediumCandidates: medium, reliableExercises: [...new Map(auto.map(mapping => [mapping.exercise.id, mapping.exercise])).values()], observations: auto.length, distinctExercises: new Set(auto.map(mapping => mapping.exercise.id)).size, distinctContexts: contexts, bestObservation: ranked[0] ? { mapping: ranked[0], contextRelation } : null, secondBestObservation: ranked[1] ? { mapping: ranked[1], contextRelation } : null, coreRecommendation: recommendation, recommendationReason: recommendation === "CORE_KEEP" ? "Copertura già credibile o migliorabile con candidati rigorosi." : recommendation === "CORE_PROTOCOL" ? "La misura richiede un protocollo dedicato." : recommendation === "CORE_OPTIONAL" ? "Parametro utile ma non abbastanza robusto per il nucleo obbligatorio." : "Il catalogo non offre osservazioni abbastanza affidabili senza forzare i mapping." };
  });
  const complete = simulate("Complete Standard", exercises, beforeDecisions, afterDecisions, coreTargets, 80, 8);
  const extended = simulate("Complete Extended", exercises, beforeDecisions, afterDecisions, coreTargets, 90, 9);
  const targeted = targetedGroups.map(group => simulate(group.label, exercises, beforeDecisions, afterDecisions, group.targets, 60, 6));
  return {
    coreTargets: coreReview,
    targetedTargets: [...new Map(targetedGroups.flatMap(group => group.targets).map(target => [target.key, target])).values()],
    candidates,
    counts: { analyzed: candidates.length, recommendApprove: candidates.filter(row => row.proposal === "RECOMMEND_APPROVE").length, review: candidates.filter(row => row.proposal === "REVIEW").length, recommendReject: candidates.filter(row => row.proposal === "RECOMMEND_REJECT").length },
    complete,
    extended,
    targeted,
    remainingGaps: coreReview.filter(row => row.coverageBefore !== "COVERED" && !row.mediumCandidates.some(candidate => candidate.proposal === "RECOMMEND_APPROVE")),
  };
}

export function buildReviewExport(candidate: MappingReviewCandidate, humanDecision: HumanReviewDecision, reviewNotes = "") {
  return { exercise_id: candidate.mapping.exercise.id, exercise_code: candidate.mapping.exercise.codice, target_type: candidate.mapping.targetType, target_id: candidate.mapping.targetId, target_name: candidate.mapping.targetName, previous_status: "needs_review", proposed_status: candidate.proposal, human_decision: humanDecision, suitability: candidate.mapping.evaluationSuitability, observability: candidate.mapping.observabilityWeight, specificity: candidate.mapping.specificityWeight, evidence: candidate.mapping.evidenceNotes, review_notes: reviewNotes };
}
