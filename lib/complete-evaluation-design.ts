import type { EvaluationMapping, EvaluationMappingAuditReport, ParameterCoverage } from "./evaluation-mapping-audit.ts";
import { bootstrapEvaluationMappings, coverageToEngineTargets, planEvaluationSession, proposeCoreEvaluationTargets, targetKey, type EvaluationEngineResult, type EvaluationEngineTarget, type EvaluationMappingDecision } from "./evaluation-session-engine.ts";
import { buildApproveOnlyDecisions, buildEvaluationMappingReview, findEvaluationTarget, summarizeSimulation, TARGETED_EVALUATION_REQUESTS, type MappingReviewCandidate, type SimulationMetrics } from "./evaluation-mapping-review.ts";
import type { Exercise, PhysicalAssessmentDimension } from "./types.ts";

export type FinalMappingDecision = "APPROVE" | "KEEP_REVIEW" | "REJECT";
export type CompleteCoreRole = "CORE_REQUIRED" | "CORE_OPTIONAL" | "TARGETED_ONLY" | "PROTOCOL_ONLY";

export type FinalMappingReview = {
  candidate: MappingReviewCandidate;
  decision: FinalMappingDecision;
  methodologicalRisk: string;
  reason: string;
};

export type ProfileDomain = {
  code: string;
  name: string;
  profile: "TECHNICAL PROFILE" | "PERCEPTUAL / DECISIONAL PROFILE" | "PHYSICAL OBSERVABLE PROFILE";
  role: CompleteCoreRole;
  targets: EvaluationEngineTarget[];
  reason: string;
};

export type DesignedSession = {
  label: string;
  result: EvaluationEngineResult;
  metrics: SimulationMetrics;
  domainsCovered: string[];
  domainsMissing: string[];
  parametersObserved: string[];
  contexts: string[];
  repeatedParameters: string[];
};

export type DimensionTargetedComparison = {
  label: string;
  technicalTarget: EvaluationEngineTarget | null;
  currentPhysicalTarget: EvaluationEngineTarget | null;
  dimension: PhysicalAssessmentDimension | null;
  selectedDimensionFis: EvaluationEngineTarget | null;
  current: DesignedSession;
  dimensionBased: DesignedSession;
  diagnosis: "MISSING_MAPPING" | "WRONG_GRANULARITY" | "PHYSICAL_NOT_DIRECTLY_EVALUABLE" | "DEDICATED_PROTOCOL" | "TAXONOMY_MISMATCH";
  explanation: string;
};

export type CompleteEvaluationDesignReport = {
  finalMappingReviews: FinalMappingReview[];
  finalCounts: { approve: number; keepReview: number; reject: number };
  domains: ProfileDomain[];
  coreRequired: EvaluationEngineTarget[];
  coreOptional: EvaluationEngineTarget[];
  targetedOnly: EvaluationEngineTarget[];
  protocolOnly: ParameterCoverage[];
  currentCore: DesignedSession;
  redesignedSingle: DesignedSession;
  sessionA: DesignedSession;
  sessionB: DesignedSession;
  dimensionComparisons: DimensionTargetedComparison[];
};

const FINAL_DECISIONS: Record<string, { decision: FinalMappingDecision; risk: string; reason: string }> = Object.freeze({
  "GK-1V1-013|Stimolo percettivo": { decision: "APPROVE", risk: "Lo stimolo modifica anche la decisione di uscita.", reason: "Vincolo colore esplicito, ripetibile e focus percettivo direttamente osservabile." },
  "GK-1V1-018|Stimolo percettivo": { decision: "APPROVE", risk: "La risposta include una componente motoria laterale.", reason: "Segnale sonoro controllato e ripetibile con relazione chiara stimolo-risposta." },
  "GK-1V1-020|Stimolo percettivo": { decision: "KEEP_REVIEW", risk: "Occlusione, lettura dell’attaccante e tecnica 1vs1 sono difficili da separare.", reason: "Il target è plausibile, ma il contesto non isola abbastanza lo stimolo percettivo." },
  "GK-1V1-027|Stimolo percettivo": { decision: "KEEP_REVIEW", risk: "Scelta, velocità avversaria e linea di chiusura influenzano fortemente l’esito.", reason: "Lo stimolo è presente, ma la prestazione osservata è multidimensionale." },
  "GK-1V1-028|Stimolo percettivo": { decision: "APPROVE", risk: "La disposizione dei palloni deve essere standardizzata.", reason: "Riconoscimento del pallone attivo esplicito, ripetibile e confrontabile." },
  "GK-TLR-015|Disturbo percettivo": { decision: "APPROVE", risk: "La qualità del tiro deve rimanere controllata.", reason: "Occlusione visiva funzionale e riacquisizione del pallone direttamente osservabile." },
  "GK-TLR-016|Disturbo percettivo": { decision: "APPROVE", risk: "La velocità motoria può influire sul risultato.", reason: "Stimolo colore e risposta laterale sono strutturati e ripetibili." },
  "GK-TLR-021|Disturbo percettivo": { decision: "APPROVE", risk: "Il timing dell’occlusione deve essere standardizzato.", reason: "Il disturbo tardivo è parte esplicita del setup e produce opportunità ripetute." },
  "GK-TLR-024|Disturbo percettivo": { decision: "KEEP_REVIEW", risk: "Rotazione, orientamento e riallineamento dominano il compito percettivo.", reason: "Utile per allenare il comportamento, meno solido per isolare il disturbo percettivo." },
  "GK-CA-022|Riallineamento": { decision: "APPROVE", risk: "La precisione del passaggio laterale può alterare la difficoltà.", reason: "Spostamento con la palla e arresto prima del tiro rendono il riallineamento osservabile." },
  "GK-CA-023|Riallineamento": { decision: "APPROVE", risk: "Il cut-back introduce una componente decisionale.", reason: "Distanza e angolo vengono ricalcolati in una sequenza ripetibile." },
  "TEC-001|Presa alta": { decision: "APPROVE", risk: "Protocollo semplice: verificare volume sufficiente di ripetizioni.", reason: "Contesto analitico, focus primario e gesto tecnico facilmente osservabile." },
  "GK-1V1-027|Reazione multidirezionale": { decision: "REJECT", risk: "Decisione, tecnica 1vs1, velocità dell’avversario e situazione impediscono una misura fisica isolata.", reason: "L’esercizio richiede reazione multidirezionale, ma non permette di valutarla fisicamente con affidabilità." },
});

export function finalDecisionForMapping(mapping: EvaluationMapping) {
  return FINAL_DECISIONS[`${mapping.exercise.codice}|${mapping.targetName}`] ?? null;
}

const uniq = <T,>(values: T[]) => [...new Set(values)];
const healthRank: Record<ParameterCoverage["health"], number> = { STRONG: 4, ADEQUATE: 3, WEAK: 2, UNCOVERED: 1 };

function targetByQueries(targets: EvaluationEngineTarget[], type: "TECHNICAL" | "PHYSICAL", queries: string[]) {
  for (const query of queries) {
    const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const exact = targets.filter(target => target.targetType === type).find(target => target.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized);
    const result = exact ?? findEvaluationTarget(targets, type, query);
    if (result) return result;
  }
  return null;
}

function withRequirement(target: EvaluationEngineTarget, observations: 1 | 2) {
  return { ...target, requiredObservations: observations, requiredDistinctExercises: observations };
}

export function buildProfileDomains(targets: EvaluationEngineTarget[]): ProfileDomain[] {
  const groups: Array<Omit<ProfileDomain, "targets"> & { targetSpecs: Array<["TECHNICAL" | "PHYSICAL", string[]]> }> = [
    { code: "GOAL_DEFENSE", name: "Difesa della porta", profile: "TECHNICAL PROFILE", role: "CORE_REQUIRED", reason: "Gesto di presa e intervento costituiscono la base tecnica osservabile.", targetSpecs: [["TECHNICAL", ["presa alta"]], ["TECHNICAL", ["tuffo + spostamento", "tuffo"]], ["TECHNICAL", ["doppio intervento"]]] },
    { code: "SPACE", name: "Gestione dello spazio", profile: "TECHNICAL PROFILE", role: "CORE_REQUIRED", reason: "Posizione, profondità e riallineamento descrivono il rapporto portiere-palla-porta.", targetSpecs: [["TECHNICAL", ["centralità e profondità"]], ["TECHNICAL", ["riallineamento"]], ["TECHNICAL", ["uscite alte presa"]]] },
    { code: "ONE_V_ONE", name: "Gestione 1vs1", profile: "TECHNICAL PROFILE", role: "CORE_OPTIONAL", reason: "Fondamentale ma costoso; può ruotare tra Complete o diventare Targeted.", targetSpecs: [["TECHNICAL", ["1vs1 e finalizzazioni", "1vs1"]]] },
    { code: "FOOTWORK", name: "Gioco di piede", profile: "TECHNICAL PROFILE", role: "CORE_REQUIRED", reason: "Controllo e trasmissione sono osservabili in condizioni standardizzate.", targetSpecs: [["TECHNICAL", ["controllo orientato"]], ["TECHNICAL", ["cambio gioco"]]] },
    { code: "AERIAL", name: "Palle alte", profile: "TECHNICAL PROFILE", role: "CORE_OPTIONAL", reason: "Importante, ma richiede spazio, servizio coerente e tempo dedicato.", targetSpecs: [["TECHNICAL", ["uscite alte presa"]], ["TECHNICAL", ["presa alta"]]] },
    { code: "PERCEPTION", name: "Percezione e decisione", profile: "PERCEPTUAL / DECISIONAL PROFILE", role: "CORE_REQUIRED", reason: "Decisione e gestione dell’informazione completano il profilo tecnico.", targetSpecs: [["TECHNICAL", ["decisione"]], ["TECHNICAL", ["stimolo percettivo"]], ["TECHNICAL", ["disturbo percettivo"]]] },
    { code: "REACTION", name: "Reattività osservabile", profile: "PHYSICAL OBSERVABLE PROFILE", role: "CORE_OPTIONAL", reason: "Va descritta come comportamento osservabile, non come misura atletica assoluta.", targetSpecs: [["PHYSICAL", ["reazione multidirezionale"]], ["PHYSICAL", ["reazione + accelerazione"]]] },
    { code: "MOVEMENT_CONTROL", name: "Controllo del movimento", profile: "PHYSICAL OBSERVABLE PROFILE", role: "CORE_REQUIRED", reason: "Controllo dinamico e arresto/ripartenza sono visibili durante compiti tecnici ripetuti.", targetSpecs: [["PHYSICAL", ["controllo dinamico"]], ["PHYSICAL", ["arresto e ripartenza"]], ["PHYSICAL", ["orientamento spazio-temporale"]]] },
  ];
  return groups.map(group => ({ ...group, targets: uniq(group.targetSpecs.map(([type, queries]) => targetByQueries(targets, type, queries)).filter(Boolean) as EvaluationEngineTarget[]) }));
}

function sessionSummary(label: string, result: EvaluationEngineResult, domains: ProfileDomain[]): DesignedSession {
  const observedKeys = new Set(result.coverageMatrix.filter(row => row.distinctExercises > 0).map(row => row.parameter.key));
  const covered = domains.filter(domain => domain.targets.some(target => observedKeys.has(target.key))).map(domain => domain.name);
  return { label, result, metrics: summarizeSimulation(result), domainsCovered: covered, domainsMissing: domains.filter(domain => !covered.includes(domain.name)).map(domain => domain.name), parametersObserved: result.coverageMatrix.filter(row => row.distinctExercises > 0).map(row => row.parameter.name), contexts: uniq(result.selectedExercises.map(row => row.exercise.fase)), repeatedParameters: result.coverageMatrix.filter(row => row.distinctExercises >= 2).map(row => row.parameter.name) };
}

function planDesigned(label: string, exercises: Exercise[], decisions: EvaluationMappingDecision[], targets: EvaluationEngineTarget[], domains: ProfileDomain[], duration: number, maximumExercises: number): DesignedSession {
  return sessionSummary(label, planEvaluationSession({ evaluationType: "Complete", exercises, mappingDecisions: decisions, selectedTargets: targets, maximumDuration: duration, maximumExercises }), domains);
}

export function selectObservableFisForDimension(dimension: PhysicalAssessmentDimension | null, targets: EvaluationEngineTarget[], decisions: EvaluationMappingDecision[]) {
  if (!dimension) return null;
  const objectiveIds = new Set((dimension.objective_mappings ?? []).map(row => row.physical_objective.id));
  const counts = new Map<string, number>();
  for (const decision of decisions.filter(row => row.active && row.mapping.targetType === "PHYSICAL")) counts.set(decision.mapping.targetId, (counts.get(decision.mapping.targetId) ?? 0) + 1);
  return targets.filter(target => target.targetType === "PHYSICAL" && objectiveIds.has(target.targetId) && target.feasibility !== "REQUIRES_DEDICATED_PROTOCOL")
    .sort((a, b) => healthRank[b.health] - healthRank[a.health] || (counts.get(b.targetId) ?? 0) - (counts.get(a.targetId) ?? 0) || a.name.localeCompare(b.name))[0] ?? null;
}

function dimensionFor(dimensions: PhysicalAssessmentDimension[], query: string) {
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return dimensions.find(dimension => dimension.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized)) ?? null;
}

export function buildCompleteEvaluationDesign(input: { audit: EvaluationMappingAuditReport; exercises: Exercise[]; dimensions: PhysicalAssessmentDimension[] }): CompleteEvaluationDesignReport {
  const { audit, exercises, dimensions } = input;
  const mappingReview = buildEvaluationMappingReview(audit, exercises);
  const finalMappingReviews = mappingReview.candidates.map(candidate => {
    const rule = finalDecisionForMapping(candidate.mapping);
    return rule ? { candidate, decision: rule.decision, methodologicalRisk: rule.risk, reason: rule.reason } : null;
  }).filter(Boolean) as FinalMappingReview[];
  const approvedIds = new Set(finalMappingReviews.filter(row => row.decision === "APPROVE").map(row => row.candidate.mapping.id));
  const decisions = buildApproveOnlyDecisions(audit, approvedIds);
  const beforeDecisions = bootstrapEvaluationMappings(audit).decisions;
  const allTargets = coverageToEngineTargets([...audit.technicalCoverage, ...audit.physicalCoverage]);
  const domains = buildProfileDomains(allTargets);
  const coreRequiredNames = ["presa alta", "centralità e profondità", "controllo orientato", "decisione", "controllo dinamico", "arresto e ripartenza"];
  const coreOptionalNames = ["tuffo + spostamento", "riallineamento", "doppio intervento", "1vs1 e finalizzazioni", "uscite alte presa", "stimolo percettivo", "disturbo percettivo", "reazione multidirezionale", "orientamento spazio-temporale"];
  const coreRequired = coreRequiredNames.map(name => targetByQueries(allTargets, name === "controllo dinamico" || name === "arresto e ripartenza" ? "PHYSICAL" : "TECHNICAL", [name])).filter(Boolean).map(target => withRequirement(target!, ["presa alta", "centralità e profondità", "decisione"].includes(target!.name.toLowerCase()) ? 2 : 1));
  const coreOptional = coreOptionalNames.map(name => targetByQueries(allTargets, ["reazione multidirezionale", "orientamento spazio-temporale"].includes(name) ? "PHYSICAL" : "TECHNICAL", [name])).filter(Boolean).map(target => withRequirement(target!, 1));
  const targetedOnly = allTargets.filter(target => !new Set([...coreRequired, ...coreOptional].map(row => row.key)).has(target.key) && target.feasibility !== "REQUIRES_DEDICATED_PROTOCOL");
  const redesignedTargets = [...coreRequired, ...coreOptional.filter(target => ["tuffo + spostamento", "riallineamento", "uscite alte presa"].some(name => target.name.toLowerCase().includes(name)))].slice(0, 9);
  const sessionATargets = ["presa alta", "tuffo + spostamento", "controllo orientato", "uscite alte presa", "controllo dinamico", "arresto e ripartenza"].map(name => targetByQueries(allTargets, ["controllo dinamico", "arresto e ripartenza"].includes(name) ? "PHYSICAL" : "TECHNICAL", [name])).filter(Boolean).map(target => withRequirement(target!, ["presa alta", "tuffo + spostamento"].some(name => target!.name.toLowerCase().includes(name)) ? 2 : 1));
  const sessionBTargets = ["centralità e profondità", "riallineamento", "1vs1 e finalizzazioni", "decisione", "stimolo percettivo", "disturbo percettivo", "orientamento spazio-temporale"].map(name => targetByQueries(allTargets, name === "orientamento spazio-temporale" ? "PHYSICAL" : "TECHNICAL", [name])).filter(Boolean).map(target => withRequirement(target!, ["centralità e profondità", "decisione"].includes(target!.name.toLowerCase()) ? 2 : 1));
  const currentCore = planDesigned("Current 12 CORE", exercises, beforeDecisions, proposeCoreEvaluationTargets(audit), domains, 80, 8);
  const redesignedSingle = planDesigned("Redesigned CORE · Single Session", exercises, decisions, redesignedTargets, domains, 80, 8);
  const sessionA = planDesigned("Complete · Session A", exercises, decisions, sessionATargets, domains, 80, 8);
  const sessionB = planDesigned("Complete · Session B", exercises, decisions, sessionBTargets, domains, 80, 8);
  const comparisons = TARGETED_EVALUATION_REQUESTS.map(request => {
    const technical = targetByQueries(allTargets, "TECHNICAL", [request.technicalQuery]);
    const currentPhysical = targetByQueries(allTargets, "PHYSICAL", [request.physicalQuery]);
    const dimension = dimensionFor(dimensions, request.physicalQuery);
    const selectedFis = selectObservableFisForDimension(dimension, allTargets, decisions);
    const currentTargets = [technical, currentPhysical].filter(Boolean).map(target => withRequirement(target!, 2));
    const dimensionTargets = [technical, selectedFis].filter(Boolean).map(target => withRequirement(target!, 2));
    const current = planDesigned(`${request.label} · Current FIS`, exercises, decisions, currentTargets, domains, 60, 6);
    const dimensionBased = planDesigned(`${request.label} · Dimension`, exercises, decisions, dimensionTargets, domains, 60, 6);
    const taxonomyMismatch = !technical;
    const noPhysical = !currentPhysical || !dimension;
    const technicalDimensionRow = technical ? dimensionBased.result.coverageMatrix.find(row => row.parameter.key === technical.key) : null;
    const technicalMappingMissing = Boolean(technical && (!technicalDimensionRow || technicalDimensionRow.status === "NOT_COVERED"));
    const diagnosis = taxonomyMismatch ? "TAXONOMY_MISMATCH" as const : technicalMappingMissing ? "MISSING_MAPPING" as const : noPhysical ? "WRONG_GRANULARITY" as const : selectedFis?.feasibility === "REQUIRES_DEDICATED_PROTOCOL" ? "DEDICATED_PROTOCOL" as const : dimensionBased.metrics.fullyCovered > current.metrics.fullyCovered ? "WRONG_GRANULARITY" as const : current.metrics.uncovered > 0 ? "PHYSICAL_NOT_DIRECTLY_EVALUABLE" as const : "MISSING_MAPPING" as const;
    const explanation = taxonomyMismatch ? "Il termine tecnico umano non risolve un target tassonomico sufficientemente coerente." : technicalMappingMissing ? "Il target tecnico reale esiste, ma non dispone di mapping valutativi attivi sufficienti; cambiare granularità fisica non risolve questo gap." : noPhysical ? "La richiesta utente è più ampia o diversa dal singolo FIS risolto." : dimensionBased.metrics.fullyCovered > current.metrics.fullyCovered ? "La dimensione consente al motore di scegliere un FIS sottostante più osservabile." : "La dimensione migliora la comprensione della richiesta, ma non crea automaticamente osservabilità mancante.";
    return { label: request.label, technicalTarget: technical, currentPhysicalTarget: currentPhysical, dimension, selectedDimensionFis: selectedFis, current, dimensionBased, diagnosis, explanation };
  });
  return { finalMappingReviews, finalCounts: { approve: finalMappingReviews.filter(row => row.decision === "APPROVE").length, keepReview: finalMappingReviews.filter(row => row.decision === "KEEP_REVIEW").length, reject: finalMappingReviews.filter(row => row.decision === "REJECT").length }, domains, coreRequired, coreOptional, targetedOnly, protocolOnly: audit.dedicatedProtocol, currentCore, redesignedSingle, sessionA, sessionB, dimensionComparisons: comparisons };
}
