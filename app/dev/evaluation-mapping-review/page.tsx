"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "../../auth-gate";
import { ExerciseTacticalBoard } from "../../components/exercise-tactical-board";
import { buildEvaluationMappingAudit } from "../../../lib/evaluation-mapping-audit";
import { buildEvaluationMappingReview, buildReviewExport, type HumanReviewDecision, type MappingReviewCandidate, type ReviewProposal, type SimulationMetrics } from "../../../lib/evaluation-mapping-review";
import { supabase } from "../../../lib/supabase";
import type { CatalogPhase, Exercise, ExercisePhysicalObjective, ExerciseSubcategory, PhysicalAssessmentDimension, PhysicalObjective } from "../../../lib/types";
import styles from "./evaluation-mapping-review.module.css";

type Row = Record<string, unknown>;
type ScopeFilter = "ALL" | "CORE" | "TARGETED";
type TypeFilter = "ALL" | "TECHNICAL" | "PHYSICAL";
type ProposalFilter = "ALL" | ReviewProposal;
type ReviewState = Record<string, { decision: HumanReviewDecision; notes: string }>;

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizeExercise(row: Row): Exercise {
  const category = (row.category ?? {}) as Row;
  const subcategory = (row.subcategory ?? {}) as Row;
  const physicalMappings = Array.isArray(row.physical_mappings) ? row.physical_mappings.map(value => {
    const mapping = value as Row;
    const objective = Array.isArray(mapping.physical_objective) ? mapping.physical_objective[0] : mapping.physical_objective;
    return { ...mapping, peso: number(mapping.peso), physical_objective: objective } as ExercisePhysicalObjective;
  }).filter(mapping => mapping.attivo && mapping.physical_objective) : [];
  return { ...row, id: text(row.id), codice: text(row.codice), nome: text(row.nome), category_id: number(row.category_id), subcategory_id: number(row.subcategory_id), categoria: text(row.categoria, text(category.nome)), sottocategoria: text(row.sottocategoria, text(subcategory.nome)), fase: text(row.fase, "Analitico") as CatalogPhase, obiettivo: text(row.obiettivo), descrizione: text(row.descrizione), durata_min: number(row.durata_min), portieri_min: number(row.portieri_min, 1), portieri_max: number(row.portieri_max, 1), intensita: text(row.intensita, "Media") as Exercise["intensita"], difficolta: number(row.difficolta, 1) as Exercise["difficolta"], materiale: text(row.materiale), variante: row.variante ? text(row.variante) : null, coaching_points: text(row.coaching_points), errori_comuni: text(row.errori_comuni), schema_step_1: row.schema_step_1 ? text(row.schema_step_1) : null, schema_step_2: row.schema_step_2 ? text(row.schema_step_2) : null, schema_step_3: row.schema_step_3 ? text(row.schema_step_3) : null, schema_step_4: row.schema_step_4 ? text(row.schema_step_4) : null, schema_step_5: row.schema_step_5 ? text(row.schema_step_5) : null, schema_step_6: row.schema_step_6 ? text(row.schema_step_6) : null, scenario_gara: row.scenario_gara ? text(row.scenario_gara) : null, numero_azioni: row.numero_azioni ? text(row.numero_azioni) : null, tactical_diagram: (row.tactical_diagram ?? null) as Exercise["tactical_diagram"], diagram_source: (row.diagram_source ?? null) as Exercise["diagram_source"], diagram_updated_at: row.diagram_updated_at ? text(row.diagram_updated_at) : null, attivo: row.attivo !== false, physical_mappings: physicalMappings } as Exercise;
}

function LazyBoard({ exercise }: { exercise: Exercise }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={styles.board}>{visible && exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={exercise.tactical_diagram} rendererVersion="v2-final"/> : <span>Tactical Board V2</span>}</div>;
}

function MetricComparison({ before, after }: { before: SimulationMetrics; after: SimulationMetrics }) {
  const rows: Array<[string, number | string, number | string]> = [
    ["Esercizi", before.exercises, after.exercises], ["Durata", `${before.estimatedDuration} min`, `${after.estimatedDuration} min`], ["Full", before.fullyCovered, after.fullyCovered], ["Partial", before.partiallyCovered, after.partiallyCovered], ["Uncovered", before.uncovered, after.uncovered], ["≥2 osservazioni", before.parametersWithTwoObservations, after.parametersWithTwoObservations], ["≥2 esercizi distinti", before.parametersWithTwoDistinctExercises, after.parametersWithTwoDistinctExercises], ["Varietà", before.variety, after.variety], ["Ridondanza", before.redundancy, after.redundancy], ["Suitability media", before.averageSuitability.toFixed(2), after.averageSuitability.toFixed(2)], ["Observability media", before.averageObservability.toFixed(2), after.averageObservability.toFixed(2)],
  ];
  return <div className={styles.compare}><div><b>Metrica</b><b>Before</b><b>After</b></div>{rows.map(([label, oldValue, newValue]) => <div key={label}><span>{label}</span><span>{oldValue}</span><strong>{newValue}</strong></div>)}<footer><span>BEFORE: {before.exerciseCodes.join(" · ") || "—"}</span><span>AFTER: {after.exerciseCodes.join(" · ") || "—"}</span></footer></div>;
}

function CandidateCard({ candidate, localReview, onReview }: { candidate: MappingReviewCandidate; localReview?: { decision: HumanReviewDecision; notes: string }; onReview: (decision: HumanReviewDecision, notes?: string) => void }) {
  const mapping = candidate.mapping;
  return <article className={styles.candidate} data-proposal={candidate.proposal}>
    <header><div><span>{candidate.target.targetType === "TECHNICAL" ? "TECHNICAL" : "PHYSICAL"} · {candidate.target.health}</span><h2>{candidate.target.name}</h2><p>{candidate.target.aggregateName} · {candidate.coverageBefore.replaceAll("_", " ")}</p></div><strong>{candidate.proposal.replaceAll("_", " ")}</strong></header>
    <section className={styles.exercise}><div><b>{mapping.exercise.codice}</b><h3>{mapping.exercise.nome}</h3><p>{mapping.exercise.categoria} › {mapping.exercise.sottocategoria}</p><small>{mapping.exercise.fase} · {mapping.exercise.durata_min} min · difficoltà {mapping.exercise.difficolta} · {mapping.tacticalFamily}</small></div><LazyBoard exercise={mapping.exercise}/></section>
    <section className={styles.metrics}><span>Suitability <b>{mapping.evaluationSuitability.toFixed(2)}</b></span><span>Observability <b>{mapping.observabilityWeight.toFixed(2)}</b></span><span>Specificity <b>{mapping.specificityWeight.toFixed(2)}</b></span><span>Confidence <b>{mapping.confidence}</b></span><span>Priority <b>{candidate.reviewPriority.toFixed(1)}</b></span></section>
    <div className={styles.notes}><section><h4>Evidence</h4><p>{mapping.evidenceNotes}</p><p><b>Ruolo:</b> {mapping.role} · <b>Complessità:</b> {mapping.complexity}</p><p><b>Obiettivo:</b> {mapping.exercise.obiettivo}</p><p><b>Svolgimento:</b> {[mapping.exercise.schema_step_1, mapping.exercise.schema_step_2, mapping.exercise.schema_step_3].filter(Boolean).join(" ") || mapping.exercise.descrizione}</p></section><section><h4>Valutazione</h4>{candidate.rationale.map(reason => <p key={reason}>✓ {reason}</p>)}{candidate.risks.length ? candidate.risks.map(risk => <p className={styles.risk} key={risk}>⚠ {risk}</p>) : <p>Nessun rischio evidente rilevato.</p>}</section></div>
    <div className={styles.localReview}><span>Decisione DEV locale</span>{(["APPROVE", "KEEP_REVIEW", "REJECT"] as HumanReviewDecision[]).map(decision => <button type="button" key={decision} aria-pressed={localReview?.decision === decision} onClick={() => onReview(decision)}>{decision.replace("_", " ")}</button>)}<label>Note revisore<input value={localReview?.notes ?? ""} onChange={event => onReview(localReview?.decision ?? "KEEP_REVIEW", event.target.value)} placeholder="Nota locale, non salvata su Supabase"/></label></div>
  </article>;
}

function ReviewPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [subcategories, setSubcategories] = useState<ExerciseSubcategory[]>([]);
  const [objectives, setObjectives] = useState<PhysicalObjective[]>([]);
  const [dimensions, setDimensions] = useState<PhysicalAssessmentDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [type, setType] = useState<TypeFilter>("ALL");
  const [proposal, setProposal] = useState<ProposalFilter>("ALL");
  const [target, setTarget] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [phase, setPhase] = useState("ALL");
  const [health, setHealth] = useState("ALL");
  const [reviews, setReviews] = useState<ReviewState>({});

  useEffect(() => {
    try { setReviews(JSON.parse(localStorage.getItem("evaluation-mapping-review-v1") ?? "{}") as ReviewState); } catch { setReviews({}); }
  }, []);
  useEffect(() => { localStorage.setItem("evaluation-mapping-review-v1", JSON.stringify(reviews)); }, [reviews]);
  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError("Supabase non configurato"); setLoading(false); return; }
      const [exerciseResult, subcategoryResult, objectiveResult, dimensionResult] = await Promise.all([
        supabase.from("exercises").select("*, category:exercise_categories(id,nome,attivo), subcategory:exercise_subcategories(id,category_id,nome,fase,attivo), physical_mappings:exercise_physical_objectives(id,exercise_id,physical_objective_id,ruolo,peso,motivazione,attivo,physical_objective:physical_objectives(*))").order("codice"),
        supabase.from("exercise_subcategories").select("id,category_id,nome,fase,attivo").eq("attivo", true).order("id"),
        supabase.from("physical_objectives").select("*").eq("attivo", true).order("codice"),
        supabase.from("physical_assessment_dimensions").select("*, objective_mappings:physical_assessment_dimension_objectives(peso,physical_objective:physical_objectives(*))").eq("attivo", true).order("ordine"),
      ]);
      if (!active) return;
      const failure = exerciseResult.error ?? subcategoryResult.error ?? objectiveResult.error ?? dimensionResult.error;
      if (failure) setError(failure.message);
      else {
        setExercises((exerciseResult.data ?? []).map(row => normalizeExercise(row as Row)));
        setSubcategories((subcategoryResult.data ?? []) as ExerciseSubcategory[]);
        setObjectives((objectiveResult.data ?? []) as PhysicalObjective[]);
        setDimensions((dimensionResult.data ?? []) as PhysicalAssessmentDimension[]);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const audit = useMemo(() => exercises.length && subcategories.length ? buildEvaluationMappingAudit({ exercises, subcategories, physicalObjectives: objectives, physicalDimensions: dimensions }) : null, [exercises, subcategories, objectives, dimensions]);
  const report = useMemo(() => audit ? buildEvaluationMappingReview(audit, exercises) : null, [audit, exercises]);
  const filtered = useMemo(() => report?.candidates.filter(candidate => (scope === "ALL" || (scope === "CORE" ? candidate.core : candidate.targetedLabels.length > 0)) && (type === "ALL" || candidate.mapping.targetType === type) && (proposal === "ALL" || candidate.proposal === proposal) && (target === "ALL" || candidate.target.key === target) && (category === "ALL" || candidate.mapping.exercise.categoria === category) && (phase === "ALL" || candidate.mapping.exercise.fase === phase) && (health === "ALL" || candidate.target.health === health)) ?? [], [report, scope, type, proposal, target, category, phase, health]);
  const updateReview = (id: string, decision: HumanReviewDecision, notes?: string) => setReviews(current => ({ ...current, [id]: { decision, notes: notes ?? current[id]?.notes ?? "" } }));
  const exportReviews = () => {
    if (!report) return;
    const payload = report.candidates.filter(candidate => reviews[candidate.mapping.id]).map(candidate => buildReviewExport(candidate, reviews[candidate.mapping.id].decision, reviews[candidate.mapping.id].notes));
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "evaluation-mapping-review-decisions.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  if (loading) return <main className={styles.page}><p>Analisi mirata dei mapping MEDIUM…</p></main>;
  if (error || !report) return <main className={styles.page}><p>Review non disponibile: {error || "dati incompleti"}</p></main>;
  const targets = [...new Map(report.candidates.map(candidate => [candidate.target.key, candidate.target])).values()];
  const categories = [...new Set(report.candidates.map(candidate => candidate.mapping.exercise.categoria))].sort();
  const phases = [...new Set(report.candidates.map(candidate => candidate.mapping.exercise.fase))].sort();
  return <main className={styles.page}>
    <header className={styles.hero}><span>DEV · READ ONLY · QUALITY &gt; COVERAGE</span><h1>Core Evaluation Mapping Review</h1><p>Revisione conservativa dei soli mapping MEDIUM rilevanti per i 12 CORE target e le cinque Targeted Evaluation. Nessuna decisione viene scritta su Supabase.</p><button type="button" onClick={exportReviews} disabled={!Object.keys(reviews).length}>Export review decisions ({Object.keys(reviews).length})</button></header>
    <textarea hidden readOnly data-testid="evaluation-mapping-review-json" value={JSON.stringify({ counts: report.counts, complete: { before: report.complete.beforeMetrics, after: report.complete.afterMetrics }, extended: { before: report.extended.beforeMetrics, after: report.extended.afterMetrics }, targeted: report.targeted.map(row => ({ label: row.label, before: row.beforeMetrics, after: row.afterMetrics })), core: report.coreTargets.map(row => ({ name: row.target.name, type: row.target.targetType, health: row.target.health, coverage: row.coverageBefore, autoApproved: row.autoApprovedMappings.length, medium: row.mediumCandidates.length, approve: row.mediumCandidates.filter(candidate => candidate.proposal === "RECOMMEND_APPROVE").length, review: row.mediumCandidates.filter(candidate => candidate.proposal === "REVIEW").length, reject: row.mediumCandidates.filter(candidate => candidate.proposal === "RECOMMEND_REJECT").length, recommendation: row.coreRecommendation })) })}/>
    <section className={styles.kpis}><div><span>MEDIUM analizzati</span><strong>{report.counts.analyzed}</strong></div><div><span>Recommend approve</span><strong>{report.counts.recommendApprove}</strong></div><div><span>Review</span><strong>{report.counts.review}</strong></div><div><span>Recommend reject</span><strong>{report.counts.recommendReject}</strong></div><div><span>Gap CORE residui</span><strong>{report.remainingGaps.length}</strong></div></section>
    <section className={styles.core}><h2>12 CORE targets</h2><div className={styles.coreGrid}>{report.coreTargets.map(row => <article key={row.target.key} data-status={row.coverageBefore}><header><span>{row.target.targetType}</span><b>{row.target.health}</b></header><h3>{row.target.name}</h3><p>{row.target.aggregateName}</p><dl><div><dt>Coverage</dt><dd>{row.coverageBefore.replaceAll("_", " ")}</dd></div><div><dt>Auto-approved</dt><dd>{row.autoApprovedMappings.length}</dd></div><div><dt>MEDIUM</dt><dd>{row.mediumCandidates.length}</dd></div><div><dt>Approve / Review / Reject</dt><dd>{row.mediumCandidates.filter(item => item.proposal === "RECOMMEND_APPROVE").length} / {row.mediumCandidates.filter(item => item.proposal === "REVIEW").length} / {row.mediumCandidates.filter(item => item.proposal === "RECOMMEND_REJECT").length}</dd></div><div><dt>Osservazioni / esercizi</dt><dd>{row.observations} / {row.distinctExercises}</dd></div><div><dt>Contesti</dt><dd>{row.distinctContexts.join(" · ") || "—"}</dd></div></dl><p><b>{row.coreRecommendation}</b> · {row.recommendationReason}</p><footer><span>Best: {row.bestObservation ? `${row.bestObservation.mapping.exercise.codice} (${row.bestObservation.mapping.evaluationSuitability.toFixed(2)})` : "—"}</span><span>Second: {row.secondBestObservation ? `${row.secondBestObservation.mapping.exercise.codice} · ${row.secondBestObservation.contextRelation}` : "—"}</span></footer></article>)}</div></section>
    <section className={styles.simulation}><h2>Complete Evaluation · Before vs After</h2><p>AFTER include soltanto auto-approved + MEDIUM classificati RECOMMEND_APPROVE.</p><MetricComparison before={report.complete.beforeMetrics} after={report.complete.afterMetrics}/><h3>Standard vs Extended (massimo 90 min / 9 esercizi)</h3><MetricComparison before={report.complete.afterMetrics} after={report.extended.afterMetrics}/></section>
    <section className={styles.simulation}><h2>Targeted Evaluation · Before vs After</h2><div className={styles.targetedGrid}>{report.targeted.map(item => <article key={item.label}><h3>{item.label}</h3><p>{item.targets.map(targetRow => `${targetRow.targetType === "TECHNICAL" ? "T" : "P"}: ${targetRow.name}`).join(" + ")}</p><MetricComparison before={item.beforeMetrics} after={item.afterMetrics}/></article>)}</div></section>
    <section className={styles.filters}><h2>Human review queue</h2><div><label>Perimetro<select value={scope} onChange={event => setScope(event.target.value as ScopeFilter)}><option value="ALL">CORE + Targeted</option><option value="CORE">CORE only</option><option value="TARGETED">Targeted only</option></select></label><label>Tipo<select value={type} onChange={event => setType(event.target.value as TypeFilter)}><option value="ALL">Tutti</option><option value="TECHNICAL">Technical</option><option value="PHYSICAL">Physical</option></select></label><label>Proposta<select value={proposal} onChange={event => setProposal(event.target.value as ProposalFilter)}><option value="ALL">Tutte</option><option value="RECOMMEND_APPROVE">Recommend Approve</option><option value="REVIEW">Review</option><option value="RECOMMEND_REJECT">Recommend Reject</option></select></label><label>Target<select value={target} onChange={event => setTarget(event.target.value)}><option value="ALL">Tutti</option>{targets.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}><option value="ALL">Tutte</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label>Fase<select value={phase} onChange={event => setPhase(event.target.value)}><option value="ALL">Tutte</option>{phases.map(item => <option key={item}>{item}</option>)}</select></label><label>Health<select value={health} onChange={event => setHealth(event.target.value)}><option value="ALL">Tutti</option><option>STRONG</option><option>ADEQUATE</option><option>WEAK</option><option>UNCOVERED</option></select></label></div><p>{filtered.length} candidati · ordinati per NOT_COVERED, PARTIALLY_COVERED e review priority decrescente.</p></section>
    <section className={styles.queue}>{filtered.map(candidate => <CandidateCard key={candidate.mapping.id} candidate={candidate} localReview={reviews[candidate.mapping.id]} onReview={(decision, notes) => updateReview(candidate.mapping.id, decision, notes)}/>)}</section>
  </main>;
}

export default function Page() { return <AuthGate><ReviewPage/></AuthGate>; }
