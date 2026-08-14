"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "../../auth-gate";
import { ExerciseTacticalBoard } from "../../components/exercise-tactical-board";
import { buildEvaluationMappingAudit, type EvaluationMapping, type EvaluationMappingAuditReport, type ParameterCoverage } from "../../../lib/evaluation-mapping-audit";
import { supabase } from "../../../lib/supabase";
import type { CatalogPhase, Exercise, ExercisePhysicalObjective, ExerciseSubcategory, PhysicalAssessmentDimension, PhysicalObjective } from "../../../lib/types";
import styles from "./evaluation-mapping-audit.module.css";

type Row = Record<string, unknown>;
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

function Kpi({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className={styles.kpi}><b>{label}</b><strong>{value}</strong>{detail && <span>{detail}</span>}</div>;
}

function CoverageTable({ title, rows, physical = false }: { title: string; rows: ParameterCoverage[]; physical?: boolean }) {
  return <section className={styles.panel}><h2>{title}</h2><div className={`${styles.table} ${physical ? styles.physicalTable : ""}`}><div className={styles.tableHead}><b>{physical ? "FIS" : "SUBCATEGORY"}</b><b>AGGREGAZIONE</b><b>TOTAL</b><b>EVALUABLE</b><b>GOOD</b><b>EXCELLENT</b><b>CONTEXTS</b><b>2 EX.</b><b>HEALTH</b>{physical && <b>FEASIBILITY</b>}</div>{rows.map(row => <div className={styles.tableRow} key={`${row.targetType}:${row.targetId}`}><span><small>{row.code}</small>{row.name}</span><span>{row.aggregateName}</span><span>{row.total}</span><span>{row.evaluable}</span><span>{row.good}</span><span>{row.excellent}</span><span>{row.contexts.join(" · ") || "—"}</span><span>{row.supportsTwoDistinctExercises ? "Sì" : "No"}</span><strong data-health={row.health}>{row.health}</strong>{physical && <span>{row.feasibility === "REQUIRES_DEDICATED_PROTOCOL" ? "REQUIRES PROTOCOL" : "CATALOG EVALUABLE"}</span>}</div>)}</div></section>;
}

function LazyBoard({ mapping }: { mapping: EvaluationMapping }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => { const node = ref.current; if (!node) return; const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "280px" }); observer.observe(node); return () => observer.disconnect(); }, []);
  return <div ref={ref} className={styles.boardPlaceholder}>{visible && mapping.exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={mapping.exercise.tactical_diagram} rendererVersion="v2-final" className={styles.board}/> : <span>Preview Tactical in attesa</span>}</div>;
}

function MappingCard({ mapping }: { mapping: EvaluationMapping }) {
  return <article className={styles.mappingCard}><header><div><b>{mapping.exercise.codice}</b><h3>{mapping.exercise.nome}</h3><p>{mapping.exercise.fase} · {mapping.tacticalFamily} · {mapping.complexity}</p></div><strong data-confidence={mapping.confidence}>{mapping.confidence}</strong></header><LazyBoard mapping={mapping}/><div className={styles.mappingTarget}><b>{mapping.targetType}</b><span>{mapping.aggregateName} › {mapping.targetName}</span><small>{mapping.role}{mapping.physicalObservability ? ` · ${mapping.physicalObservability}` : ""}</small></div><div className={styles.weights}><span>Suitability <b>{mapping.evaluationSuitability.toFixed(2)}</b></span><span>Observability <b>{mapping.observabilityWeight.toFixed(2)}</b></span><span>Specificity <b>{mapping.specificityWeight.toFixed(2)}</b></span></div><p className={styles.evidence}>{mapping.evidenceNotes}</p></article>;
}

function MappingGallery({ title, subtitle, rows }: { title: string; subtitle: string; rows: EvaluationMapping[] }) {
  return <section className={styles.panel}><h2>{title}</h2><p>{subtitle} · {rows.length} mapping</p>{rows.length ? <div className={styles.gallery}>{rows.map(mapping => <MappingCard key={mapping.id} mapping={mapping}/>)}</div> : <p className={styles.empty}>Nessun mapping in questa classe.</p>}</section>;
}

function ParameterList({ title, rows }: { title: string; rows: ParameterCoverage[] }) {
  return <section className={styles.miniPanel}><h3>{title} · {rows.length}</h3>{rows.map(row => <p key={`${row.targetType}:${row.targetId}`}><b>{row.targetType === "TECHNICAL" ? "T" : "P"}</b><span>{row.aggregateName} › {row.name}</span><small>{row.evaluable} valutabili · {row.good} buoni · {row.contexts.length} contesti</small></p>)}</section>;
}

function Report({ report }: { report: EvaluationMappingAuditReport }) {
  const weakMappings = report.allMappings.filter(mapping => report.weakParameters.some(row => row.targetType === mapping.targetType && row.targetId === mapping.targetId));
  return <>
    <textarea data-testid="evaluation-mapping-audit-json" hidden readOnly value={JSON.stringify({ catalogSize: report.catalogSize, exercisesAnalyzed: report.exercisesAnalyzed, mappings: { technical: report.technicalMappings.length, physical: report.physicalMappings.length, high: report.highConfidence.length, medium: report.mediumConfidence.length, low: report.lowConfidence.length }, parameters: { technical: report.technicalCoverage.length, physical: report.physicalCoverage.length, strong: report.strongParameters.length, adequate: report.adequateParameters.length, weak: report.weakParameters.length, uncovered: report.uncoveredParameters.length, dedicatedProtocol: report.dedicatedProtocol.length }, risks: { falsePositive: report.falsePositiveRisks.length, falseNegative: report.falseNegativeRisks.length }, battery: { exercises: report.battery.exercises.map(item => item.exercise.codice), duration: report.battery.estimatedDuration, observedTwice: report.battery.targetsObservedTwice.length, gaps: report.battery.gaps }, simulations: report.simulations.map(item => ({ label: item.label, technical: item.resolvedTechnical, physical: item.resolvedPhysical, exercises: item.exercises.map(row => row.exercise.codice), gap: item.gap })) })}/>
    <section className={styles.kpis}><Kpi label="CATALOGO" value={report.catalogSize}/><Kpi label="ANALIZZATI" value={report.exercisesAnalyzed}/><Kpi label="TECH MAPPINGS" value={report.technicalMappings.length}/><Kpi label="PHYSICAL RELATIONS" value={report.physicalMappings.length}/><Kpi label="HIGH CONFIDENCE" value={report.highConfidence.length}/><Kpi label="MEDIUM" value={report.mediumConfidence.length}/><Kpi label="LOW" value={report.lowConfidence.length}/><Kpi label="STRONG" value={report.strongParameters.length}/><Kpi label="ADEQUATE" value={report.adequateParameters.length}/><Kpi label="WEAK" value={report.weakParameters.length}/><Kpi label="UNCOVERED" value={report.uncoveredParameters.length}/><Kpi label="DEDICATED PROTOCOL" value={report.dedicatedProtocol.length}/></section>
    <CoverageTable title="B · TECHNICAL EVALUATION COVERAGE" rows={report.technicalCoverage}/>
    <CoverageTable title="C · PHYSICAL EVALUATION COVERAGE" rows={report.physicalCoverage} physical/>
    <section className={styles.parameterGrid}><ParameterList title="D · STRONG PARAMETERS" rows={report.strongParameters}/><ParameterList title="E · ADEQUATE PARAMETERS" rows={report.adequateParameters}/><ParameterList title="F · WEAK PARAMETERS" rows={report.weakParameters}/><ParameterList title="G · UNCOVERED PARAMETERS" rows={report.uncoveredParameters}/><ParameterList title="H · REQUIRES DEDICATED PROTOCOL" rows={report.dedicatedProtocol}/></section>
    <MappingGallery title="I · HIGH CONFIDENCE MAPPINGS" subtitle="Campione umano: primi 20 per suitability" rows={report.highConfidence.slice(0, 20)}/>
    <MappingGallery title="J · MEDIUM CONFIDENCE MAPPINGS" subtitle="Campione umano: primi 20" rows={report.mediumConfidence.slice(0, 20)}/>
    <MappingGallery title="K · LOW CONFIDENCE MAPPINGS" subtitle="Tutti i casi LOW" rows={report.lowConfidence}/>
    <MappingGallery title="WEAK PARAMETER GALLERY" subtitle="Tutti i mapping collegati a parametri WEAK" rows={weakMappings}/>
    <section className={styles.riskGrid}><section className={styles.panel}><h2>L · FALSE POSITIVE RISKS</h2>{report.falsePositiveRisks.map((risk, index) => <p key={`${risk.exerciseCode}:${risk.target}:${index}`}><b>{risk.exerciseCode} · {risk.target}</b><span>{risk.reason}</span></p>)}</section><section className={styles.panel}><h2>M · FALSE NEGATIVE RISKS</h2>{report.falseNegativeRisks.map((risk, index) => <p key={`${risk.exerciseCode}:${risk.target}:${index}`}><b>{risk.exerciseCode} · {risk.target}</b><span>{risk.reason}</span></p>)}</section></section>
    <section className={styles.riskGrid}><section className={styles.panel}><h2>N · BEST MULTI-TARGET EXERCISES</h2>{report.goodMultiTarget.slice(0, 30).map(item => <p key={item.exercise.id}><b>{item.exercise.codice} · {item.exercise.nome}</b><span>{item.mappings.map(mapping => `${mapping.targetName} ${mapping.evaluationSuitability.toFixed(2)}`).join(" · ")}</span></p>)}</section><section className={styles.panel}><h2>O · OVERLOADED EXERCISES</h2>{report.overloaded.slice(0, 40).map(item => <p key={item.exercise.id}><b>{item.exercise.codice} · {item.exercise.nome}</b><span>{item.reason}</span></p>)}</section></section>
    <section className={styles.panel}><h2>COMPLEXITY PENALTY AUDIT</h2><div className={styles.complexity}>{report.complexity.map(row => <div key={row.level}><b>{row.level}</b><strong>{row.mappings}</strong><span>Suitability media {row.averageSuitability.toFixed(2)}</span><span>Specificity media {row.averageSpecificity.toFixed(2)}</span></div>)}</div></section>
    <section className={styles.panel}><h2>P · COMPLETE BATTERY SIMULATION</h2><p>Selezione greedy diagnostica sui parametri STRONG catalog-evaluable, massimo 14 esercizi. Non è una seduta salvata.</p><div className={styles.battery}>{report.battery.exercises.map((item, index) => <article key={item.exercise.id}><b>{index + 1}. {item.exercise.codice}</b><h3>{item.exercise.nome}</h3><span>{item.exercise.durata_min} min</span><p>{item.coveredTargets.join(" · ")}</p></article>)}</div><div className={styles.batterySummary}><b>Durata stimata: {report.battery.estimatedDuration} min</b><span>Target principali: {report.battery.targets.length}</span><span>Osservati due volte: {report.battery.targetsObservedTwice.length}</span><span>Gap: {report.battery.gaps.length}</span></div>{report.battery.gaps.length > 0 && <ul>{report.battery.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul>}</section>
    <section className={styles.panel}><h2>Q · 5 TARGETED EVALUATION SIMULATIONS</h2><div className={styles.simulations}>{report.simulations.map(simulation => <article key={simulation.label}><b>{simulation.label} · {simulation.technicalQuery} + {simulation.physicalQuery}</b><h3>{simulation.resolvedTechnical ?? "Non risolto"} + {simulation.resolvedPhysical ?? "Non risolto"}</h3>{simulation.exercises.map(item => <p key={item.exercise.id}><strong>{item.exercise.codice}</strong> {item.exercise.nome}<small>{item.coveredTargets.join(" · ")}</small></p>)}{simulation.gap && <span>{simulation.gap}</span>}</article>)}</div></section>
    <section className={styles.finalGrid}><section><h2>R · RECOMMENDED THRESHOLDS</h2><p>Evaluable ≥ {report.recommendedThresholds.evaluable.toFixed(2)}</p><p>Good ≥ {report.recommendedThresholds.good.toFixed(2)}</p><p>Excellent ≥ {report.recommendedThresholds.excellent.toFixed(2)}</p><p>Osservazioni minime: {report.recommendedThresholds.minimumObservations}</p><p>Esercizi distinti preferiti: {report.recommendedThresholds.minimumDistinctExercises}</p></section><section><h2>S · PROPOSED NEXT STEP</h2><p>Revisione umana dei LOW, dei falsi positivi/negativi e dei parametri WEAK/UNCOVERED. Solo dopo l’approvazione si potrà progettare la persistenza production.</p></section></section>
  </>;
}

function EvaluationMappingAuditPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [subcategories, setSubcategories] = useState<ExerciseSubcategory[]>([]);
  const [objectives, setObjectives] = useState<PhysicalObjective[]>([]);
  const [dimensions, setDimensions] = useState<PhysicalAssessmentDimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; async function load() { if (!supabase) { setError("Supabase non configurato"); setLoading(false); return; } const [exerciseResult, subcategoryResult, objectiveResult, dimensionResult] = await Promise.all([supabase.from("exercises").select("*, category:exercise_categories(id,nome,attivo), subcategory:exercise_subcategories(id,category_id,nome,fase,attivo), physical_mappings:exercise_physical_objectives(id,exercise_id,physical_objective_id,ruolo,peso,motivazione,attivo,physical_objective:physical_objectives(*))").order("codice"), supabase.from("exercise_subcategories").select("id,category_id,nome,fase,attivo").eq("attivo", true).order("id"), supabase.from("physical_objectives").select("*").eq("attivo", true).order("codice"), supabase.from("physical_assessment_dimensions").select("*, objective_mappings:physical_assessment_dimension_objectives(peso,physical_objective:physical_objectives(*))").eq("attivo", true).order("ordine")]); if (!active) return; const failure = exerciseResult.error ?? subcategoryResult.error ?? objectiveResult.error ?? dimensionResult.error; if (failure) setError(failure.message); else { setExercises((exerciseResult.data ?? []).map(row => normalizeExercise(row as Row))); setSubcategories((subcategoryResult.data ?? []) as ExerciseSubcategory[]); setObjectives((objectiveResult.data ?? []) as PhysicalObjective[]); setDimensions((dimensionResult.data ?? []) as PhysicalAssessmentDimension[]); } setLoading(false); } void load(); return () => { active = false; }; }, []);
  const report = useMemo(() => exercises.length && subcategories.length ? buildEvaluationMappingAudit({ exercises, subcategories, physicalObjectives: objectives, physicalDimensions: dimensions }) : null, [exercises, subcategories, objectives, dimensions]);
  if (loading) return <main className={styles.page}><p>Analisi in memoria dei 468 esercizi…</p></main>;
  if (error) return <main className={styles.page}><p>Audit non disponibile: {error}</p></main>;
  return <main className={styles.page}><header className={styles.hero}><span>DEV · READ ONLY · IN MEMORY</span><h1>Evaluation Mapping Audit</h1><p>La mappa distingue target allenati da parametri realmente osservabili. Nessun dato viene scritto o modificato.</p></header>{report && <Report report={report}/>}</main>;
}

export default function Page() { return <AuthGate><EvaluationMappingAuditPage/></AuthGate>; }
