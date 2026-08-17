"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buildProductionTargetCatalog, hydratePersistedEvaluationMappings, type PersistedEvaluationMappingRow } from "../../lib/evaluation-production";
import { baselineResultFor, historyKeyToEngineKey, planReassessment, selectBaselineTargets, type ReassessmentPlan } from "../../lib/evaluation-reassessment";
import type { GoalkeeperEvaluationHistorySession } from "../../lib/evaluation-history";
import type { Exercise, ExerciseSubcategory, Goalkeeper, PhysicalObjective } from "../../lib/types";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

type Props = {
  baseline: GoalkeeperEvaluationHistorySession;
  exercises: Exercise[];
  subcategories: ExerciseSubcategory[];
  physicalObjectives: PhysicalObjective[];
  goalkeepers: Goalkeeper[];
  onCancel: () => void;
  onCreated: () => Promise<void> | void;
  onToast: (message: string) => void;
};

type ContextPreference = "Bilanciata" | "Analitica" | "Situazionale" | "Percettiva";
const dateLabel = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const coverageLabel = { COVERED: "Coperto", PARTIALLY_COVERED: "Parzialmente coperto", NOT_COVERED: "Non coperto", REQUIRES_PROTOCOL: "Protocollo dedicato" } as const;
const reliabilityLabel = { STRONG: "Forte", GOOD: "Buona", LIMITED: "Limitata", INSUFFICIENT: "Insufficiente" } as const;
const expectedLabel = { HIGH: "Alta", MEDIUM: "Media", LIMITED: "Limitata" } as const;

export function ReassessmentWizard(props: Props) {
  const { onToast } = props;
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"same" | "subset">("same");
  const [selectedKeys, setSelectedKeys] = useState(props.baseline.targetKeys);
  const [date, setDate] = useState(today());
  const [duration, setDuration] = useState(30);
  const [minimumObservations, setMinimumObservations] = useState(2);
  const [contextPreference, setContextPreference] = useState<ContextPreference>("Bilanciata");
  const [notes, setNotes] = useState("");
  const [mappingRows, setMappingRows] = useState<PersistedEvaluationMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<ReassessmentPlan | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const { data, error } = await supabase.from("exercise_evaluation_targets").select("id,exercise_id,target_type,technical_subcategory_id,physical_objective_id,evaluation_suitability,observability_weight,specificity_weight,evidence_notes,confidence,mapping_status,attivo,target_role,physical_feasibility,tactical_family,complexity,decision_source");
      if (!active) return;
      setLoading(false);
      if (error) { onToast(`Mapping rivalutazione non disponibili: ${error.message}`); return; }
      setMappingRows((data ?? []) as PersistedEvaluationMappingRow[]);
    }
    void load();
    return () => { active = false; };
  }, [onToast]);

  const decisions = useMemo(() => hydratePersistedEvaluationMappings(mappingRows, props.exercises, props.subcategories, props.physicalObjectives), [mappingRows, props.exercises, props.subcategories, props.physicalObjectives]);
  const targetCatalog = useMemo(() => buildProductionTargetCatalog(decisions, props.subcategories, props.physicalObjectives), [decisions, props.subcategories, props.physicalObjectives]);
  const goalkeeper = props.goalkeepers.find(item => item.id === props.baseline.goalkeeperId);
  const availableTargetCount = selectBaselineTargets(props.baseline, targetCatalog).length;

  function toggleTarget(key: string) {
    setSelectedKeys(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
    setPlan(null);
  }

  function generate() {
    if (!selectedKeys.length) { props.onToast("Seleziona almeno un parametro della baseline"); return; }
    try {
      const catalogWithBaselineDimensions = targetCatalog.map(target => {
        const parameter = props.baseline.parameters.find(item => historyKeyToEngineKey(item.key) === target.key);
        return parameter?.physicalDimensionId ? { ...target, physicalDimensionId: parameter.physicalDimensionId } : target;
      });
      setPlan(planReassessment({ baseline: props.baseline, selectedHistoryKeys: selectedKeys, targets: catalogWithBaselineDimensions, exercises: props.exercises, decisions, maximumDuration: duration, minimumObservations, contextPreference }));
      setStep(3);
    } catch (error) { props.onToast(error instanceof Error ? error.message : "Proposta non generata"); }
  }

  async function create() {
    if (!supabase || !plan) return;
    setBusy(true);
    try {
      const chosenTargets = selectBaselineTargets(props.baseline, targetCatalog, selectedKeys);
      const requestedTargets = plan.result.coverageMatrix.map(row => {
        const target = chosenTargets.find(item => item.key === row.parameter.key)!;
        const baselineParameter = props.baseline.parameters.find(item => historyKeyToEngineKey(item.key) === target.key);
        return {
          target_type: target.targetType === "TECHNICAL" ? "Technical" : "Physical",
          technical_subcategory_id: target.technicalSubcategoryId,
          physical_objective_id: target.physicalObjectiveId,
          physical_dimension_id: baselineParameter?.physicalDimensionId ?? target.physicalDimensionId,
          priority: target.priority,
          required_observations: target.requiredObservations,
          required_distinct_exercises: target.requiredDistinctExercises,
          source: "previous_evaluation",
          parameter_name_snapshot: baselineParameter?.name ?? target.name,
          coverage_status: row.status,
          coverage_explanation: `${row.distinctExercises} esercizi distinti e ${row.observationCount} osservazioni pianificate.`,
        };
      });
      const requestedExercises = plan.result.selectedExercises.map((item, position) => ({ exercise_id: item.exercise.id, position, planned_duration_minutes: item.exercise.durata_min, selection_weight: Math.max(0, Math.min(1, item.selectionScore / 100)) }));
      const requestedCoverage = plan.result.coverageMatrix.map(row => ({ key: row.parameter.key, name: row.parameter.name, status: row.status, exercises: row.distinctExercises, expected_comparability: plan.expectedComparability }));
      const { error } = await supabase.rpc("create_reassessment_training", {
        requested_baseline_session_id: props.baseline.id,
        requested_training_date: date,
        requested_duration: plan.result.estimatedDuration,
        requested_minimum_observations: minimumObservations,
        requested_context_preference: contextPreference,
        requested_notes: notes,
        requested_targets: requestedTargets,
        requested_exercises: requestedExercises,
        requested_coverage: requestedCoverage,
      });
      if (error) throw error;
      await props.onCreated();
      props.onToast("Rivalutazione creata e pronta in agenda");
    } catch (error) { props.onToast(`Rivalutazione non creata: ${error instanceof Error ? error.message : "errore sconosciuto"}`); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading-state">Preparazione rivalutazione…</div>;
  return <div className="evaluation-wizard reassessment-wizard">
    <div className="page-head"><div><span className="eyebrow">Rivalutazione portiere</span><h1>Nuova rivalutazione</h1><p className="subtitle">Nuova seduta indipendente collegata a una baseline completata.</p></div><button className="secondary" onClick={props.onCancel}>Annulla</button></div>
    <ol className="evaluation-steps reassessment-steps" aria-label="Avanzamento rivalutazione">{["Baseline", "Parametri", "Preview"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><b>{index + 1}</b><span>{label}</span></li>)}</ol>
    <section className="evaluation-step-card">
      {step === 1 && <><span className="eyebrow">Step 1 · Baseline</span><h2>Stai rivalutando questa seduta</h2><div className="reassessment-baseline"><div><span>Portiere</span><strong>{goalkeeper ? `${goalkeeper.nome} ${goalkeeper.cognome}` : "Portiere"}</strong></div><div><span>Data baseline</span><strong>{dateLabel(props.baseline.date)}</strong></div><div><span>Tipo</span><strong>{props.baseline.evaluationType === "Complete" ? "Completa" : props.baseline.evaluationType === "Targeted" ? "Mirata" : props.baseline.evaluationType === "Custom" ? "Personalizzata" : "Rivalutazione"}</strong></div><div><span>Parametri</span><strong>{props.baseline.parameters.length}</strong></div></div><div className="reassessment-parameter-summary">{props.baseline.parameters.map(parameter => { const result = baselineResultFor(parameter); return <article key={parameter.key}><div><strong>{parameter.name}</strong><span>{result.detail}</span></div><div><b>{result.label}</b><small>Affidabilità {reliabilityLabel[parameter.reliability].toLowerCase()}</small></div></article>; })}</div>{availableTargetCount < props.baseline.targetKeys.length && <div className="evaluation-warnings"><strong>Attenzione</strong><p>Alcuni target baseline non sono più disponibili nei mapping attivi e non potranno essere proposti.</p></div>}</>}
      {step === 2 && <><span className="eyebrow">Step 2 · Cosa rivalutare</span><h2>Scegli i parametri</h2><div className="evaluation-choice-grid"><button className={mode === "same" ? "choice active" : "choice"} onClick={() => { setMode("same"); setSelectedKeys(props.baseline.targetKeys); }}><strong>Stessi parametri</strong><span>Recupera tutti i target realmente presenti nella baseline.</span></button><button className={mode === "subset" ? "choice active" : "choice"} onClick={() => setMode("subset")}><strong>Seleziona parametri</strong><span>Scegli un sottoinsieme dei target della baseline.</span></button></div><div className="reassessment-target-list">{props.baseline.parameters.map(parameter => { const result = baselineResultFor(parameter); return <label key={parameter.key}><input type="checkbox" checked={selectedKeys.includes(parameter.key)} disabled={mode === "same"} onChange={() => toggleTarget(parameter.key)}/><span><strong>{parameter.name}</strong><small>Baseline: {result.label} · {result.detail} · affidabilità {reliabilityLabel[parameter.reliability].toLowerCase()}</small></span></label>; })}</div><div className="evaluation-config-grid reassessment-config"><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Durata massima<input type="number" min="20" max="45" value={duration} onChange={event => setDuration(Number(event.target.value))}/></label><label>Osservazioni minime<input type="number" min="1" max="5" value={minimumObservations} onChange={event => setMinimumObservations(Number(event.target.value))}/></label><label>Preferenza contesti<select value={contextPreference} onChange={event => setContextPreference(event.target.value as ContextPreference)}><option>Bilanciata</option><option>Analitica</option><option>Situazionale</option><option>Percettiva</option></select></label><label className="wide">Note<textarea value={notes} onChange={event => setNotes(event.target.value)} /></label></div></>}
      {step === 3 && plan && <ReassessmentPreview baseline={props.baseline} plan={plan} onCreate={create} busy={busy} />}
      <div className="evaluation-step-actions">{step > 1 && <button className="secondary" onClick={() => { setStep(step - 1); setPlan(null); }}>Indietro</button>}{step === 1 && <button className="primary" onClick={() => setStep(2)}>Continua</button>}{step === 2 && <button className="primary" onClick={generate}>Genera proposta</button>}</div>
    </section>
  </div>;
}

function ReassessmentPreview({ baseline, plan, onCreate, busy }: { baseline: GoalkeeperEvaluationHistorySession; plan: ReassessmentPlan; onCreate: () => void; busy: boolean }) {
  return <><div className="evaluation-preview-head"><div><span className="eyebrow">Step 3 · Preview</span><h2>Proposta rivalutazione</h2></div><div className={`expected-comparability expected-${plan.expectedComparability.toLowerCase()}`}><span>Comparabilità prevista</span><strong>{expectedLabel[plan.expectedComparability]}</strong></div></div><div className="evaluation-metrics"><span><b>{plan.result.selectedExercises.length}</b> esercizi</span><span><b>{plan.result.estimatedDuration}</b> minuti</span><span><b>{Math.round(plan.exerciseOverlap * 100)}%</b> esercizi baseline</span><span><b>{Math.round(plan.contextOverlap * 100)}%</b> contesti comuni</span></div><div className="coverage-matrix"><h3>Copertura target</h3>{plan.result.coverageMatrix.map(row => { const baselineParameter = baseline.parameters.find(item => historyKeyToEngineKey(item.key) === row.parameter.key); const result = baselineParameter ? baselineResultFor(baselineParameter) : null; return <div key={row.parameter.key}><span className={`coverage-dot ${row.status.toLowerCase()}`}/><strong>{row.parameter.name}</strong><span>{coverageLabel[row.status]}</span><small>Baseline: {result?.label ?? "Non disponibile"}</small></div>; })}</div>{plan.warnings.length > 0 && <div className="evaluation-warnings"><strong>Avvisi metodologici</strong>{plan.warnings.map(warning => <p key={warning}>⚠ {warning}</p>)}</div>}<div className="evaluation-exercise-list">{plan.result.selectedExercises.map((item, index) => { const same = plan.sameBaselineExerciseIds.includes(item.exercise.id); return <article key={item.exercise.id} className="evaluation-exercise-card"><header><span className="code-badge">{item.exercise.codice}</span><div><small>Esercizio {index + 1}</small><h3>{item.exercise.nome}</h3><p>{item.exercise.sottocategoria} · {item.exercise.fase}</p></div><b>{item.exercise.durata_min}′</b></header><div className={`baseline-exercise-status ${same ? "same" : "different"}`}>{same ? "Stesso esercizio della baseline" : "Esercizio differente dalla baseline"}<small>{same ? "Favorisce la continuità metodologica." : "Può ridurre la confrontabilità, ma migliora copertura o adeguatezza."}</small></div>{item.exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={item.exercise.tactical_diagram} className="session-board"/> : <div className="session-image-placeholder">Schema non disponibile</div>}</article>; })}</div><div className="evaluation-confirm"><div><strong>Verrà creata una nuova seduta Reassessment.</strong><span>La baseline rimane immutata e non vengono create osservazioni.</span></div><button className="primary" disabled={busy || !plan.result.selectedExercises.length} onClick={onCreate}>{busy ? "Creazione…" : "Crea rivalutazione"}</button></div></>;
}
