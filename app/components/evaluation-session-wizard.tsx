"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buildProductionTargetCatalog, createProductionBootstrap, hydratePersistedEvaluationMappings, losesRequiredCoverage, planProductionEvaluation, replacementCandidates, replaceEvaluationExercise, resolveCompleteCoreTargets, resolvePhysicalDimensionTargets, type PersistedEvaluationMappingRow, type PhysicalDimensionResolution, type ProductionEvaluationTarget } from "../../lib/evaluation-production";
import { buildCustomEvaluation } from "../../lib/evaluation-custom";
import type { EvaluationEngineResult, EvaluationMappingDecision } from "../../lib/evaluation-session-engine";
import type { Exercise, ExerciseSubcategory, Goalkeeper, PhysicalAssessmentDimension, PhysicalObjective } from "../../lib/types";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

type Props = {
  exercises: Exercise[];
  subcategories: ExerciseSubcategory[];
  physicalObjectives: PhysicalObjective[];
  physicalDimensions: PhysicalAssessmentDimension[];
  goalkeepers: Goalkeeper[];
  catalogAdmin: boolean;
  onCreated: () => Promise<void> | void;
  onToast: (message: string) => void;
};

type ContextPreference = "Bilanciata" | "Analitica" | "Situazionale" | "Percettiva";
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const statusLabel: Record<string, string> = { COVERED: "Coperto", PARTIALLY_COVERED: "Parziale", NOT_COVERED: "Scoperto", REQUIRES_PROTOCOL: "Protocollo dedicato" };

export function EvaluationSessionWizard(props: Props) {
  const [step, setStep] = useState(1);
  const [goalkeeperId, setGoalkeeperId] = useState("");
  const [evaluationType, setEvaluationType] = useState<"Complete" | "Targeted" | "Custom">("Complete");
  const [technicalIds, setTechnicalIds] = useState<number[]>([]);
  const [dimensionIds, setDimensionIds] = useState<string[]>([]);
  const [customExerciseIds, setCustomExerciseIds] = useState<string[]>([]);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [date, setDate] = useState(today());
  const [duration, setDuration] = useState(70);
  const [minimumObservations, setMinimumObservations] = useState(2);
  const [contextPreference, setContextPreference] = useState<ContextPreference>("Bilanciata");
  const [notes, setNotes] = useState("");
  const [mappingRows, setMappingRows] = useState<PersistedEvaluationMappingRow[]>([]);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingError, setMappingError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EvaluationEngineResult | null>(null);
  const [plannedTargets, setPlannedTargets] = useState<ProductionEvaluationTarget[]>([]);
  const [dimensionCoverage, setDimensionCoverage] = useState<PhysicalDimensionResolution[]>([]);

  async function loadMappings() {
    if (!supabase) return;
    setMappingLoading(true);
    const { data, error } = await supabase.from("exercise_evaluation_targets").select("id,exercise_id,target_type,technical_subcategory_id,physical_objective_id,evaluation_suitability,observability_weight,specificity_weight,evidence_notes,confidence,mapping_status,attivo,target_role,physical_feasibility,tactical_family,complexity,decision_source");
    setMappingLoading(false);
    if (error) { setMappingError(error.message); setMappingRows([]); return; }
    setMappingError("");
    setMappingRows((data ?? []) as PersistedEvaluationMappingRow[]);
  }

  // Frozen Evaluation flow: this effect performs the initial remote-state synchronization.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadMappings(); }, []);
  // Goalkeepers can arrive after the wizard mounts, so the first active option is synchronized here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!goalkeeperId) setGoalkeeperId(props.goalkeepers.find(item => item.attivo)?.id ?? ""); }, [goalkeeperId, props.goalkeepers]);

  const decisions = useMemo(() => hydratePersistedEvaluationMappings(mappingRows, props.exercises, props.subcategories, props.physicalObjectives), [mappingRows, props.exercises, props.subcategories, props.physicalObjectives]);
  const targetCatalog = useMemo(() => buildProductionTargetCatalog(decisions, props.subcategories, props.physicalObjectives), [decisions, props.subcategories, props.physicalObjectives]);
  const core = useMemo(() => resolveCompleteCoreTargets(targetCatalog), [targetCatalog]);
  const evaluableExerciseIds = useMemo(() => new Set(decisions.filter(item => item.active && item.mappingStatus === "auto_approved").map(item => item.mapping.exercise.id)), [decisions]);
  const customExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLocaleLowerCase("it");
    return props.exercises.filter(item => item.attivo && evaluableExerciseIds.has(item.id)).filter(item => !query || [item.codice, item.nome, item.categoria, item.sottocategoria].some(value => value.toLocaleLowerCase("it").includes(query)));
  }, [props.exercises, evaluableExerciseIds, exerciseSearch]);
  const customTargets = useMemo(() => {
    const keys = new Set(decisions.filter(item => item.active && item.mappingStatus === "auto_approved" && customExerciseIds.includes(item.mapping.exercise.id)).map(item => `${item.mapping.targetType}:${item.mapping.targetId}`));
    return targetCatalog.filter(target => keys.has(target.key));
  }, [customExerciseIds, decisions, targetCatalog]);

  async function bootstrapMappings() {
    if (!supabase || !props.catalogAdmin) return;
    setBusy(true);
    try {
      const rows = createProductionBootstrap({ exercises: props.exercises, subcategories: props.subcategories, physicalObjectives: props.physicalObjectives, physicalDimensions: props.physicalDimensions });
      const { data, error } = await supabase.rpc("bootstrap_evaluation_targets", { requested_rows: rows });
      if (error) throw error;
      await loadMappings();
      props.onToast(`Mapping valutativi inizializzati: ${String((data as Record<string, unknown>)?.total ?? rows.length)}`);
    } catch (error) { props.onToast(`Mapping non inizializzati: ${error instanceof Error ? error.message : "errore sconosciuto"}`); }
    finally { setBusy(false); }
  }

  function next() {
    if (step === 1 && !goalkeeperId) { props.onToast("Seleziona un portiere"); return; }
    if (step === 2 && evaluationType === "Custom" && !customExerciseIds.length) { props.onToast("Seleziona almeno un esercizio dall’archivio"); return; }
    if (step === 3 && evaluationType === "Targeted" && !technicalIds.length && !dimensionIds.length) { props.onToast("Seleziona almeno un parametro tecnico o fisico"); return; }
    setStep(value => Math.min(6, value + 1));
  }

  function generateProposal() {
    if (evaluationType === "Custom") {
      const custom = buildCustomEvaluation({ exerciseIds: customExerciseIds, exercises: props.exercises, decisions, targets: targetCatalog, duration, minimumObservations });
      if (!custom.result.selectedExercises.length || !custom.targets.length) { props.onToast("Gli esercizi scelti non hanno mapping valutativi approvati"); return; }
      setPlannedTargets(custom.targets);
      setDimensionCoverage([]);
      setResult(custom.result);
      setStep(6);
      return;
    }
    const physical = evaluationType === "Targeted" ? resolvePhysicalDimensionTargets(props.physicalDimensions, targetCatalog, decisions, dimensionIds) : [];
    const targets = evaluationType === "Complete"
      ? core.selected
      : [
          ...technicalIds.map(id => targetCatalog.find(target => target.technicalSubcategoryId === id)).filter((item): item is ProductionEvaluationTarget => Boolean(item)),
          ...physical.flatMap(item => item.selectedFis),
        ];
    if (!targets.length) { props.onToast("I parametri scelti non hanno target valutativi utilizzabili"); return; }
    const proposal = planProductionEvaluation({ evaluationType, exercises: props.exercises, decisions, targets, maximumDuration: duration, minimumObservations, contextPreference });
    setPlannedTargets(targets);
    setDimensionCoverage(physical);
    setResult(proposal);
    setStep(6);
  }

  function applyReplacement(exerciseId: string, replacementId: string) {
    if (!result) return;
    const current = result.selectedExercises.find(item => item.exercise.id === exerciseId);
    if (!current) return;
    const alternatives = replacementCandidates(result.selectedExercises, current, decisions, plannedTargets, props.exercises);
    const replacement = alternatives.find(item => item.exercise.id === replacementId);
    if (!replacement) return;
    const nextResult = replaceEvaluationExercise(result, exerciseId, replacement);
    const losses = losesRequiredCoverage(result, nextResult);
    if (losses.length && !window.confirm(`La sostituzione riduce la copertura di: ${losses.join(", ")}. Continuare?`)) return;
    setResult(nextResult);
  }

  async function createSession() {
    if (!supabase || !result || !goalkeeperId) return;
    if (evaluationType === "Complete" && (!result.exerciseCountWithinRecommendedRange || result.estimatedDuration < 60 || result.estimatedDuration > 80)) { props.onToast("La proposta Completa deve avere 6-8 esercizi e 60-80 minuti effettivi"); return; }
    if (!result.selectedExercises.length) { props.onToast("Nessun esercizio valutativo disponibile"); return; }
    setBusy(true);
    try {
      const targetPayload = result.coverageMatrix.map(row => {
        const target = plannedTargets.find(item => item.key === row.parameter.key)!;
        const dimension = dimensionCoverage.find(item => item.selectedFis.some(fis => fis.key === target.key));
        return {
          target_type: target.targetType === "TECHNICAL" ? "Technical" : "Physical",
          technical_subcategory_id: target.technicalSubcategoryId,
          physical_objective_id: target.physicalObjectiveId,
          physical_dimension_id: target.physicalDimensionId,
          priority: target.priority,
          required_observations: target.requiredObservations,
          required_distinct_exercises: target.requiredDistinctExercises,
          source: evaluationType === "Complete" ? "complete_profile" : "manual",
          parameter_name_snapshot: target.physicalDimensionName ? `${target.physicalDimensionName} > ${target.name}` : target.name,
          coverage_status: dimension?.status ?? row.status,
          coverage_explanation: dimension?.explanation ?? `${row.distinctExercises} esercizi distinti e ${row.observationCount} osservazioni pianificate.`,
        };
      });
      const exercisePayload = result.selectedExercises.map((item, position) => ({ exercise_id: item.exercise.id, position, planned_duration_minutes: item.exercise.durata_min, selection_weight: Math.max(0, Math.min(1, item.selectionScore / 100)) }));
      const coveragePayload = [
        ...result.coverageMatrix.map(row => ({ key: row.parameter.key, name: row.parameter.name, status: row.status, exercises: row.distinctExercises })),
        ...dimensionCoverage.map(item => ({ key: `DIMENSION:${item.dimension.id}`, name: item.dimension.nome, status: item.status, explanation: item.explanation, fis: item.selectedFis.map(fis => fis.name) })),
      ];
      const rpcName = evaluationType === "Custom" ? "create_custom_evaluation_training" : "create_evaluation_training";
      const rpcArguments = {
        requested_goalkeeper_id: goalkeeperId,
        requested_training_date: date,
        requested_duration: result.estimatedDuration,
        requested_minimum_observations: minimumObservations,
        requested_context_preference: contextPreference,
        requested_notes: notes,
        requested_targets: targetPayload,
        requested_exercises: exercisePayload,
        requested_coverage: coveragePayload,
      };
      const { error } = await supabase.rpc(rpcName, evaluationType === "Custom" ? rpcArguments : { ...rpcArguments, requested_evaluation_type: evaluationType });
      if (error) throw error;
      await props.onCreated();
      props.onToast("Seduta di valutazione creata e pronta in agenda");
      setStep(1); setResult(null); setTechnicalIds([]); setDimensionIds([]); setCustomExerciseIds([]); setExerciseSearch(""); setNotes("");
    } catch (error) { props.onToast(`Seduta non creata: ${error instanceof Error ? error.message : "errore sconosciuto"}`); }
    finally { setBusy(false); }
  }

  if (mappingLoading) return <div className="loading-state">Caricamento mapping valutativi…</div>;
  if (!mappingRows.length) return <section className="evaluation-empty"><span className="eyebrow">Fondazione valutativa</span><h1>Mapping da inizializzare</h1><p>{mappingError || "La struttura è pronta, ma il bootstrap dei mapping non è ancora stato persistito."}</p>{props.catalogAdmin ? <button className="primary" disabled={busy} onClick={bootstrapMappings}>{busy ? "Inizializzazione…" : "Inizializza mapping approvati"}</button> : <p>Operazione riservata all’amministratore del catalogo.</p>}</section>;

  const goalkeeper = props.goalkeepers.find(item => item.id === goalkeeperId);
  return <div className="evaluation-wizard">
    <div className="page-head"><div><span className="eyebrow">Valutazione portiere</span><h1>Nuova valutazione</h1><p className="subtitle">Crea una seduta osservativa strutturata, distinta dall’allenamento standard.</p></div></div>
    <ol className="evaluation-steps" aria-label="Avanzamento creazione valutazione">{["Portiere","Tipo","Parametri","Configurazione","Genera","Preview"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><b>{index + 1}</b><span>{label}</span></li>)}</ol>

    <section className="evaluation-step-card">
      {step === 1 && <><span className="eyebrow">Step 1</span><h2>Quale portiere vuoi valutare?</h2><div className="evaluation-choice-grid">{props.goalkeepers.filter(item => item.attivo).map(item => <button type="button" className={goalkeeperId === item.id ? "choice active" : "choice"} key={item.id} onClick={() => setGoalkeeperId(item.id)}><strong>{item.nome} {item.cognome}</strong><span>Portiere</span></button>)}</div></>}
      {step === 2 && <><span className="eyebrow">Step 2</span><h2>Tipo di valutazione</h2><div className="evaluation-choice-grid four"><button type="button" className={evaluationType === "Complete" ? "choice active" : "choice"} onClick={() => { setEvaluationType("Complete"); setDuration(70); }}><strong>Completa</strong><span>Profilo generale · 6-8 esercizi · 60-80 minuti</span></button><button type="button" className={evaluationType === "Targeted" ? "choice active" : "choice"} onClick={() => { setEvaluationType("Targeted"); setDuration(45); }}><strong>Mirata</strong><span>Parametri selezionati · 30-60 minuti</span></button><button type="button" className={evaluationType === "Custom" ? "choice active" : "choice"} onClick={() => { setEvaluationType("Custom"); setDuration(45); }}><strong>Personalizzata</strong><span>Scegli tu da 1 a 6 esercizi dall’archivio</span></button><button type="button" className="choice disabled" disabled><strong>Rivalutazione</strong><span>Disponibile dallo storico</span></button></div>{evaluationType === "Custom" && <div className="custom-exercise-picker"><header><div><h3>Scegli gli esercizi</h3><p>Sono mostrati solo gli esercizi con parametri valutativi approvati.</p></div><strong>{customExerciseIds.length}/6 selezionati</strong></header><label className="custom-exercise-search">Cerca nell’archivio<input type="search" value={exerciseSearch} onChange={event => setExerciseSearch(event.target.value)} placeholder="Codice, nome, categoria o sottocategoria"/></label><div className="custom-exercise-list">{customExercises.map(item => { const selected = customExerciseIds.includes(item.id); return <label key={item.id} className={selected ? "selected" : ""}><input type="checkbox" checked={selected} onChange={() => setCustomExerciseIds(values => selected ? values.filter(id => id !== item.id) : values.length >= 6 ? (props.onToast("Puoi selezionare al massimo 6 esercizi"), values) : [...values, item.id])}/><span><b>{item.codice} · {item.nome}</b><small>{item.categoria} · {item.sottocategoria} · {item.fase} · {item.durata_min}′</small></span></label>; })}{!customExercises.length && <p className="custom-exercise-empty">Nessun esercizio valutabile corrisponde alla ricerca.</p>}</div></div>}</>}
      {step === 3 && <><span className="eyebrow">Step 3</span><h2>Parametri</h2>{evaluationType === "Complete" ? <><p>I sei core richiesti sono preselezionati; il motore aggiunge un pool opzionale affidabile.</p><div className="target-chip-grid">{core.required.map(item => <span className="target-chip required" key={item.key}>{item.name}<small>Core</small></span>)}{core.selected.filter(item => !core.required.includes(item)).map(item => <span className="target-chip" key={item.key}>{item.name}<small>Rotazione</small></span>)}</div></> : evaluationType === "Custom" ? <><p>I parametri osservabili sono ricavati automaticamente dai mapping approvati degli esercizi che hai scelto.</p><div className="target-chip-grid">{customTargets.map(item => <span className="target-chip" key={item.key}>{item.name}<small>{item.targetType === "TECHNICAL" ? "Tecnico" : "Fisico"}</small></span>)}</div></> : <div className="evaluation-parameter-columns"><div><h3>Tecnica</h3><p>Seleziona le sottocategorie da osservare.</p><div className="check-list">{props.subcategories.filter(item => item.attivo && item.fase !== "Generale").map(item => <label key={item.id}><input type="checkbox" checked={technicalIds.includes(item.id)} onChange={() => setTechnicalIds(values => values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])}/><span>{item.nome}<small>{item.fase}</small></span></label>)}</div></div><div><h3>Fisico osservabile</h3><p>Seleziona dimensioni, non singoli FIS.</p><div className="check-list">{props.physicalDimensions.filter(item => item.attivo).map(item => <label key={item.id}><input type="checkbox" checked={dimensionIds.includes(item.id)} onChange={() => setDimensionIds(values => values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])}/><span>{item.nome}<small>{item.descrizione}</small></span></label>)}</div></div></div>}</>}
      {step === 4 && <><span className="eyebrow">Step 4</span><h2>Configurazione</h2><div className="evaluation-config-grid"><label>Data<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Durata massima<input type="number" min={evaluationType === "Complete" ? 60 : 30} max={evaluationType === "Complete" ? 80 : 60} value={duration} onChange={event => setDuration(Number(event.target.value))}/></label><label>Osservazioni minime<input type="number" min="1" max="5" value={minimumObservations} onChange={event => setMinimumObservations(Number(event.target.value))}/></label><label>Preferenza contesti<select value={contextPreference} onChange={event => setContextPreference(event.target.value as ContextPreference)}><option>Bilanciata</option><option>Analitica</option><option>Situazionale</option><option>Percettiva</option></select></label><label className="wide">Note<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Indicazioni per la seduta…"/></label></div></>}
      {step === 5 && <><span className="eyebrow">Step 5</span><h2>Genera la proposta</h2><p>{evaluationType === "Custom" ? "La proposta manterrà esattamente gli esercizi scelti e collegherà i relativi parametri approvati." : "Il motore userà esclusivamente mapping persistiti, attivi e approvati. Nessun protocol-only o mapping rejected entrerà nella seduta."}</p><div className="evaluation-generation-summary"><span><b>{goalkeeper?.nome} {goalkeeper?.cognome}</b>Portiere</span><span><b>{evaluationType === "Complete" ? "Completa" : evaluationType === "Targeted" ? "Mirata" : "Personalizzata"}</b>Tipo</span><span><b>{duration} min</b>Durata massima</span></div><button className="primary" onClick={generateProposal}>Genera proposta valutativa</button></>}
      {step === 6 && result && <EvaluationPreview result={result} targets={plannedTargets} dimensions={dimensionCoverage} decisions={decisions} exercises={props.exercises} onReplace={applyReplacement} onCreate={createSession} busy={busy}/>} 
      <div className="evaluation-step-actions">{step > 1 && step < 6 ? <button className="secondary" onClick={() => setStep(value => value - 1)}>Indietro</button> : <span/>}{step < 5 ? <button className="primary" onClick={next}>Continua</button> : null}{step === 6 ? <button className="secondary" onClick={() => setStep(4)}>Modifica configurazione</button> : null}</div>
    </section>
  </div>;
}

function EvaluationPreview({ result, targets, dimensions, decisions, exercises, onReplace, onCreate, busy }: { result: EvaluationEngineResult; targets: ProductionEvaluationTarget[]; dimensions: PhysicalDimensionResolution[]; decisions: EvaluationMappingDecision[]; exercises: Exercise[]; onReplace: (exerciseId: string, replacementId: string) => void; onCreate: () => void; busy: boolean }) {
  const warnings = [
    !result.exerciseCountWithinRecommendedRange ? "Numero esercizi fuori dal range raccomandato." : null,
    !result.durationWithinRecommendedRange ? "Durata effettiva fuori dal range raccomandato." : null,
    ...result.uncoveredTargets.map(row => `${row.parameter.name}: ${statusLabel[row.status]}.`),
    ...dimensions.filter(item => item.status !== "COVERED").map(item => `${item.dimension.nome}: ${item.explanation}`),
  ].filter(Boolean) as string[];
  return <><div className="evaluation-preview-head"><div><span className="eyebrow">Step 6 · Preview</span><h2>Proposta di seduta</h2></div><div className="evaluation-metrics"><span><b>{result.selectedExercises.length}</b> esercizi</span><span><b>{result.estimatedDuration}</b> minuti</span><span><b>{result.coverageMatrix.filter(row => row.status === "COVERED").length}/{result.coverageMatrix.length}</b> target coperti</span></div></div>
    {dimensions.length > 0 && <div className="dimension-resolution-grid">{dimensions.map(item => <article key={item.dimension.id} className={`coverage-${item.status.toLowerCase()}`}><span>{item.dimension.nome}</span><strong>{statusLabel[item.status]}</strong><p>{item.explanation}</p><small>FIS utilizzato: {item.selectedFis.map(fis => fis.name).join(" · ") || "Nessuno"}</small></article>)}</div>}
    <div className="coverage-matrix"><h3>Copertura parametri</h3>{result.coverageMatrix.map(row => <div key={row.parameter.key}><span className={`coverage-dot ${row.status.toLowerCase()}`}/><strong>{row.parameter.name}</strong><span>{statusLabel[row.status]}</span><small>{row.distinctExercises} esercizi · {row.observationCount} osservazioni</small></div>)}</div>
    {warnings.length > 0 && <div className="evaluation-warnings"><strong>Avvisi metodologici</strong>{warnings.map(item => <p key={item}>⚠ {item}</p>)}</div>}
    <div className="evaluation-exercise-list">{result.selectedExercises.map((item, index) => { const alternatives = replacementCandidates(result.selectedExercises, item, decisions, targets, exercises); return <article key={item.exercise.id} className="evaluation-exercise-card"><header><span className="code-badge">{item.exercise.codice}</span><div><small>Esercizio {index + 1}</small><h3>{item.exercise.nome}</h3><p>{item.exercise.sottocategoria} · {item.exercise.fase}</p></div><b>{item.exercise.durata_min}′</b></header>{item.exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={item.exercise.tactical_diagram} className="session-board"/> : <div className="session-image-placeholder">Schema non disponibile</div>}<div className="evaluation-targets"><strong>Target osservati</strong>{item.mappings.map(mapping => <span key={mapping.mapping.id}>{mapping.mapping.targetName}</span>)}</div><label className="replacement-select">Sostituisci<select defaultValue="" onChange={event => { if (event.target.value) onReplace(item.exercise.id, event.target.value); event.currentTarget.value = ""; }}><option value="">Alternative per utilità valutativa…</option>{alternatives.map(alternative => <option key={alternative.exercise.id} value={alternative.exercise.id}>{alternative.exercise.codice} · {alternative.exercise.nome} · {alternative.utility}</option>)}</select></label></article>; })}</div>
    <div className="evaluation-confirm"><div><strong>La seduta verrà salvata come Pronta.</strong><span>Le osservazioni sul campo non vengono ancora create.</span></div><button className="primary" disabled={busy || !result.selectedExercises.length} onClick={onCreate}>{busy ? "Creazione…" : "Crea seduta di valutazione"}</button></div>
  </>;
}
