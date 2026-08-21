"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { buildEvaluationResults, buildPresentationDimensions, evaluationLiveSummary, exerciseEvaluationState, resolvePhysicalDisplay, type EvaluationFieldObservation, type EvaluationFieldPayload, type EvaluationFieldTarget } from "../../lib/evaluation-field";
import { getExerciseProcedure } from "../../lib/session-visualization";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

type Props = { sessionId: string; initialMode: "field" | "results"; onClose: () => void; onSessionChanged: () => Promise<void> | void };
const reliabilityLabel = { INSUFFICIENT: "Dati insufficienti", LIMITED: "Affidabilit\u00e0 limitata", GOOD: "Affidabilit\u00e0 buona", STRONG: "Affidabilit\u00e0 forte" } as const;
const exerciseStateLabel = { NOT_STARTED: "Non iniziato", PARTIAL: "Parziale", OBSERVED: "Completato" } as const;
const evaluationTypeName = (type: EvaluationFieldPayload["session"]["evaluation_type"]) => type === "Complete" ? "Valutazione completa" : type === "Targeted" ? "Valutazione mirata" : type === "Custom" ? "Valutazione personalizzata" : "Rivalutazione";

function useMobileFieldLayout() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 520px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function EvaluationFieldMode({ sessionId, initialMode, onClose, onSessionChanged }: Props) {
  const [payload, setPayload] = useState<EvaluationFieldPayload | null>(null);
  const [mode, setMode] = useState(initialMode);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [entryOpen, setEntryOpen] = useState<Record<string, boolean>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingSelections, setPendingSelections] = useState<Record<string, { score: number | null; status: "OBSERVED" | "NOT_OBSERVED" }>>({});
  const [completionOpen, setCompletionOpen] = useState(false);
  const [confirmIncomplete, setConfirmIncomplete] = useState(false);
  const isMobile = useMobileFieldLayout();
  const [procedureOpen, setProcedureOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 520px)").matches);
  const [liveSummaryOpen, setLiveSummaryOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 520px)").matches);
  const overlayRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(new Set<string>());
  const idempotencyRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (overlayRef.current) overlayRef.current.scrollTop = 0;
    // Frozen Field Mode: reset the disclosure state when exercise/device context changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProcedureOpen(!isMobile);
  }, [index, isMobile]);

  useEffect(() => {
    // Frozen Field Mode: keep the summary disclosure aligned with the active viewport.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiveSummaryOpen(!isMobile);
  }, [isMobile]);

  async function fetchPayload() {
    if (!supabase) throw new Error("Supabase non configurato");
    const { data, error: requestError } = await supabase.rpc("get_evaluation_field_session", { requested_session_id: sessionId });
    if (requestError) throw requestError;
    setPayload(data as EvaluationFieldPayload);
    return data as EvaluationFieldPayload;
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        if (!supabase) throw new Error("Supabase non configurato");
        const current = await fetchPayload();
        if (!active) return;
        if (initialMode === "field" && current.session.status === "Ready") {
          const { error: startError } = await supabase.rpc("start_evaluation_session", { requested_session_id: sessionId });
          if (startError) throw startError;
          await fetchPayload();
          await onSessionChanged();
        } else if (current.session.status === "Completed") setMode("results");
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Valutazione non disponibile"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [initialMode, sessionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (mode === "field" && event.key === "ArrowLeft") setIndex(value => Math.max(0, value - 1));
      if (mode === "field" && event.key === "ArrowRight") setIndex(value => Math.min((payload?.exercises.length ?? 1) - 1, value + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose, payload?.exercises.length]);

  async function record(target: EvaluationFieldTarget, score: number | null, observationStatus: "OBSERVED" | "NOT_OBSERVED") {
    if (!supabase || busyRef.current.has(target.exercise_target_id) || payload?.session.status !== "InProgress") return;
    busyRef.current.add(target.exercise_target_id);
    setPendingSelections(value => ({ ...value, [target.exercise_target_id]: { score, status: observationStatus } }));
    setSaving(value => ({ ...value, [target.exercise_target_id]: "saving" }));
    const key = idempotencyRef.current.get(target.exercise_target_id) ?? crypto.randomUUID();
    idempotencyRef.current.set(target.exercise_target_id, key);
    try {
      const request = supabase.rpc("record_evaluation_observation", {
        requested_exercise_target_id: target.exercise_target_id,
        requested_score: score,
        requested_observation_status: observationStatus,
        requested_notes: notes[target.exercise_target_id] ?? "",
        requested_confidence: 1,
        requested_idempotency_key: key,
      });
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("Tempo di salvataggio scaduto. Tocca nuovamente per riprovare.")), 12000));
      const { data, error: saveError } = await Promise.race([request, timeout]);
      if (saveError) throw saveError;
      const rawObservation = data as EvaluationFieldObservation & { evaluation_exercise_target_id?: string; duplicate?: boolean };
      const observation = { ...rawObservation, exercise_target_id: rawObservation.exercise_target_id ?? rawObservation.evaluation_exercise_target_id ?? target.exercise_target_id };
      setPayload(current => current ? { ...current, observations: current.observations.some(item => item.id === observation.id) ? current.observations : [...current.observations, observation] } : current);
      setSaving(value => ({ ...value, [target.exercise_target_id]: "saved" }));
      setEntryOpen(value => ({ ...value, [target.exercise_target_id]: false }));
      setNoteOpen(value => ({ ...value, [target.exercise_target_id]: false }));
      setNotes(value => ({ ...value, [target.exercise_target_id]: "" }));
      setPendingSelections(value => { const next = { ...value }; delete next[target.exercise_target_id]; return next; });
      idempotencyRef.current.delete(target.exercise_target_id);
    } catch (caught) {
      setSaving(value => ({ ...value, [target.exercise_target_id]: "error" }));
      setError(caught instanceof Error ? caught.message : "Salvataggio fallito: il voto resta visibile e pu\u00f2 essere ritentato");
    } finally { busyRef.current.delete(target.exercise_target_id); }
  }

  function newObservation(targetId: string) {
    idempotencyRef.current.delete(targetId);
    setPendingSelections(value => { const next = { ...value }; delete next[targetId]; return next; });
    setEntryOpen(value => ({ ...value, [targetId]: true }));
    setSaving(value => { const next = { ...value }; delete next[targetId]; return next; });
  }

  async function completeSession() {
    if (!supabase || !payload) return;
    setLoading(true);
    try {
      const { error: completeError } = await supabase.rpc("complete_evaluation_session", { requested_session_id: payload.session.id });
      if (completeError) throw completeError;
      await fetchPayload();
      await onSessionChanged();
      setCompletionOpen(false);
      setMode("results");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Completamento non riuscito"); }
    finally { setLoading(false); }
  }

  if (loading && !payload) return <div className="evaluation-field-overlay" role="dialog" aria-modal="true"><div className="evaluation-field-loading">Caricamento valutazione\u2026</div></div>;
  if (error && !payload) return <div className="evaluation-field-overlay" role="dialog" aria-modal="true"><div className="evaluation-field-loading"><strong>Valutazione non disponibile</strong><p>{error}</p><button onClick={onClose}>Chiudi</button></div></div>;
  if (!payload) return null;
  if (mode === "results") return <EvaluationResultsSummary payload={payload} onClose={onClose}/>;

  const current = payload.exercises[index];
  if (!current) return null;
  const live = evaluationLiveSummary(payload);
  const progress = payload.exercises.length ? ((index + 1) / payload.exercises.length) * 100 : 0;
  const steps = getExerciseProcedure(current.exercise);
  return <div ref={overlayRef} className="evaluation-field-overlay" role="dialog" aria-modal="true" aria-label="Modalit\u00e0 valutazione sul campo">
    <header className="evaluation-field-header"><div className="evaluation-field-identity"><small>{evaluationTypeName(payload.session.evaluation_type)}</small><strong>{payload.session.goalkeeper_name}</strong><span>{new Date(`${payload.session.date}T12:00:00`).toLocaleDateString("it-IT")}</span></div><div className="evaluation-field-progress"><b>Esercizio {index + 1} di {payload.exercises.length}</b><div role="progressbar" aria-label="Progresso esercizi" aria-valuemin={0} aria-valuemax={payload.exercises.length} aria-valuenow={index + 1}><span style={{ width: `${progress}%` }}/></div></div><button type="button" className="evaluation-field-close" onClick={onClose} aria-label="Chiudi e continua pi\u00f9 tardi">×</button></header>
    <nav className="evaluation-direct-nav" aria-label="Vai direttamente a un esercizio">{payload.exercises.map((exercise, exerciseIndex) => { const state = exerciseEvaluationState(exercise, payload.observations); return <button key={exercise.training_exercise_id} className={`${state.toLowerCase()} ${exerciseIndex === index ? "active" : ""}`} onClick={() => setIndex(exerciseIndex)} aria-label={`Esercizio ${exerciseIndex + 1}: ${exerciseStateLabel[state]}`}><b>{exerciseIndex + 1}</b><small>{exerciseStateLabel[state]}</small></button>; })}</nav>
    <main className="evaluation-field-main">
      {error && <div className="evaluation-network-error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Chiudi avviso">×</button></div>}
      <section className="evaluation-current-exercise"><div className="evaluation-current-title"><span className="code-badge">{current.exercise.codice}</span><div><h1>{current.exercise.nome}</h1><p>{current.exercise.fase} \u00b7 {current.planned_duration_minutes} minuti</p></div></div><div className="evaluation-board-wrap">{current.exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={current.exercise.tactical_diagram} className="evaluation-field-board"/> : <div className="session-image-placeholder">Schema non disponibile</div>}</div>{steps.length > 0 && <section className={`evaluation-procedure ${procedureOpen ? "is-open" : ""}`}><button type="button" className="evaluation-disclosure-toggle" aria-expanded={procedureOpen} aria-controls={`evaluation-procedure-${current.training_exercise_id}`} onClick={() => setProcedureOpen(value => !value)}><span>Svolgimento</span><b>{procedureOpen ? "Nascondi" : "Mostra"}</b></button><div id={`evaluation-procedure-${current.training_exercise_id}`} hidden={!procedureOpen}><ol>{steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol></div></section>}{current.exercise.coaching_points && <details className="evaluation-procedure"><summary>Note utili</summary><p>{current.exercise.coaching_points}</p></details>}</section>
      <section className="evaluation-observation-panel"><div className="evaluation-observation-heading"><span>Parametri da osservare</span><strong>{current.targets.length}</strong></div>{current.targets.length === 0 ? <p>Nessun target valutativo collegato a questo esercizio.</p> : current.targets.map(target => { const targetObservations = payload.observations.filter(observation => observation.exercise_target_id === target.exercise_target_id); const canEnter = targetObservations.length === 0 || entryOpen[target.exercise_target_id]; const saveState = saving[target.exercise_target_id]; const pending = pendingSelections[target.exercise_target_id]; const latest = targetObservations.at(-1); const physical = target.target_type === "Physical" ? resolvePhysicalDisplay({ physicalDimensionName: target.physical_dimension_name, fisName: target.fis_name, parameterName: target.parameter_name }) : null; return <article className="evaluation-parameter-card" key={target.exercise_target_id}><header><div><small>{target.target_type === "Technical" ? "Tecnico" : physical?.dimensionName ?? "Fisico osservabile"}</small><h2>{target.parameter_name}</h2>{physical && <p className="evaluation-physical-label"><b>FIS osservato:</b> {physical.fisName}</p>}</div><span className={`observation-save-state ${saveState ?? "idle"}`}>{saveState === "saving" ? "Salvataggio\u2026" : saveState === "saved" ? "Salvato" : saveState === "error" ? "Errore \u00b7 riprova" : targetObservations.length ? `${targetObservations.length} registrate` : "Da osservare"}</span></header>{target.evidence_notes && <p className="evaluation-observation-hint">{target.evidence_notes}</p>}{canEnter ? <div className="evaluation-entry"><div className="evaluation-score-buttons" aria-label={`Punteggio per ${target.parameter_name}`}>{payload.scale_levels.map(level => <button type="button" key={level.score} className={pending?.status === "OBSERVED" && pending.score === level.score ? "pending" : ""} aria-pressed={pending?.status === "OBSERVED" && pending.score === level.score} disabled={saveState === "saving"} onClick={() => void record(target, level.score, "OBSERVED")} aria-label={`${level.score}: ${level.label}`}><b>{level.score}</b><span>{level.label}</span></button>)}</div><button type="button" className={`evaluation-not-observed ${pending?.status === "NOT_OBSERVED" ? "pending" : ""}`} aria-pressed={pending?.status === "NOT_OBSERVED"} disabled={saveState === "saving"} onClick={() => void record(target, null, "NOT_OBSERVED")}>Non osservato</button>{pending && saveState === "error" && <p className="evaluation-pending-message">Selezione non salvata: {pending.status === "NOT_OBSERVED" ? "Non osservato" : `${pending.score} \u00b7 ${payload.scale_levels.find(level => level.score === pending.score)?.label ?? "Punteggio"}`}. Tocca nuovamente per riprovare.</p>}<button type="button" className="evaluation-note-toggle" aria-expanded={Boolean(noteOpen[target.exercise_target_id])} onClick={() => setNoteOpen(value => ({ ...value, [target.exercise_target_id]: !value[target.exercise_target_id] }))}>+ Aggiungi nota</button>{noteOpen[target.exercise_target_id] && <textarea rows={2} value={notes[target.exercise_target_id] ?? ""} onChange={event => setNotes(value => ({ ...value, [target.exercise_target_id]: event.target.value }))} placeholder="Nota rapida opzionale" aria-label={`Nota per ${target.parameter_name}`}/>}</div> : <div className="evaluation-last-decision"><span>{latest?.observation_status === "NOT_OBSERVED" ? "Non osservato" : `${latest?.score} \u00b7 ${payload.scale_levels.find(level => level.score === latest?.score)?.label ?? "Osservato"}`}</span><button type="button" onClick={() => newObservation(target.exercise_target_id)}>+ Nuova osservazione</button></div>}</article>; })}</section>
    </main>
    <aside className={`evaluation-live-summary ${liveSummaryOpen ? "is-open" : ""}`} aria-label="Copertura in tempo reale"><button type="button" className="evaluation-live-toggle" aria-expanded={liveSummaryOpen} aria-controls="evaluation-live-details" onClick={() => setLiveSummaryOpen(value => !value)}><span>Progresso</span><b>{live.parametersObserved}/{live.parametersTotal}</b><em>{liveSummaryOpen ? "Nascondi" : "Dettagli"}</em></button><div id="evaluation-live-details" hidden={!liveSummaryOpen}><span><b>{live.parametersObserved}/{live.parametersTotal}</b> target valutati</span><span><b>{live.validObservationsTotal}</b> osservazioni valide</span><span><b>{live.notObservedTotal}</b> decisioni non osservato</span></div></aside>
    <footer className="evaluation-field-footer"><button type="button" disabled={index === 0} onClick={() => setIndex(value => Math.max(0, value - 1))}><span aria-hidden="true">←</span> Precedente</button><button type="button" className="evaluation-complete-button" onClick={() => setCompletionOpen(true)}>Termina valutazione</button><button type="button" disabled={index === payload.exercises.length - 1} onClick={() => setIndex(value => Math.min(payload.exercises.length - 1, value + 1))}>Esercizio successivo <span aria-hidden="true">→</span></button></footer>
    {completionOpen && <div className="evaluation-completion-backdrop"><section className="evaluation-completion-check" role="alertdialog" aria-modal="true" aria-labelledby="completion-title"><h2 id="completion-title">Riepilogo prima del completamento</h2><div><span><b>{live.exercisesCompleted}</b> esercizi completati</span><span><b>{live.exercisesPartial}</b> esercizi parziali</span><span><b>{live.parametersObserved}</b> target valutati</span><span><b>{live.parametersNotObserved}</b> target solo non osservati</span><span><b>{live.parametersUndecided}</b> target senza decisione</span><span><b>{live.validObservationsTotal}</b> osservazioni valide</span><span><b>{live.notObservedTotal}</b> decisioni non osservato</span></div><p className="evaluation-immutability-warning">Dopo il completamento la valutazione sarà salvata nello storico e non potrà essere modificata.</p>{live.parametersUndecided > 0 && <label className="evaluation-incomplete-confirm"><input type="checkbox" checked={confirmIncomplete} onChange={event => setConfirmIncomplete(event.target.checked)}/><span>Alcuni target non hanno decisioni. Confermo di voler completare comunque.</span></label>}<footer><button type="button" onClick={() => setCompletionOpen(false)}>Continua valutazione</button><button type="button" className="primary" disabled={loading || (live.parametersUndecided > 0 && !confirmIncomplete)} onClick={() => void completeSession()}>{loading ? "Completamento\u2026" : "Conferma completamento"}</button></footer></section></div>}
  </div>;
}

function EvaluationResultsSummary({ payload, onClose }: { payload: EvaluationFieldPayload; onClose: () => void }) {
  const results = useMemo(() => buildEvaluationResults(payload), [payload]);
  const dimensions = useMemo(() => buildPresentationDimensions(results), [results]);
  const profiles = ["TECHNICAL PROFILE", "PERCEPTUAL / DECISIONAL PROFILE", "PHYSICAL OBSERVABLE PROFILE"] as const;
  return <div className="evaluation-results-overlay" role="dialog" aria-modal="true" aria-label="Risultati valutazione"><header><div><small>Risultati valutazione</small><h1>{payload.session.goalkeeper_name}</h1><p>{evaluationTypeName(payload.session.evaluation_type)} · {new Date(`${payload.session.date}T12:00:00`).toLocaleDateString("it-IT")}</p></div><button onClick={onClose} aria-label="Chiudi risultati">×</button></header><main>
    {(payload.session.evaluation_type === "Targeted" || payload.session.evaluation_type === "Custom") && <ParameterResults results={results}/>} 
    <section className="evaluation-profile-section"><h2>Profili e dimensioni</h2><p>Nessun voto generale: ogni area conserva il proprio significato metodologico.</p>{profiles.map(profile => <div className="evaluation-profile-group" key={profile}><h3>{profile}</h3><div className="evaluation-dimension-grid">{dimensions.filter(dimension => dimension.profile === profile).map(dimension => <article key={dimension.name}><span>{dimension.name}</span>{dimension.score == null ? <><strong>Non valutata</strong><small>Dati insufficienti</small></> : <><strong>{dimension.score.toFixed(2)} / 5</strong><div className="evaluation-result-bar"><i style={{ width: `${dimension.normalizedScore}%` }}/></div><small>{dimension.normalizedScore?.toFixed(2)} / 100 \u00b7 {reliabilityLabel[dimension.reliability]}</small></>}</article>)}</div></div>)}</section>
    {payload.session.evaluation_type === "Complete" && <ParameterResults results={results}/>} 
  </main></div>;
}

function ParameterResults({ results }: { results: ReturnType<typeof buildEvaluationResults> }) {
  return <section className="evaluation-parameter-results"><h2>Risultati per parametro</h2><div>{results.map(result => { const physical = result.targetType === "Physical" ? resolvePhysicalDisplay({ physicalDimensionName: result.physicalDimensionName, fisName: result.fisName, parameterName: result.name }) : null; return <details key={result.sessionTargetId} className="evaluation-result-card"><summary><div><small>{result.targetType === "Technical" ? "Tecnico" : physical?.dimensionName ?? "Fisico osservabile"}</small><strong>{result.name}</strong>{physical && <span>FIS osservato: {physical.fisName}</span>}</div><div>{result.weightedScore == null ? <><b>Non valutato</b><em>{result.notObserved > 0 ? `${result.notObserved} ${result.notObserved === 1 ? "occasione non osservabile" : "occasioni non osservabili"}` : "Nessuna decisione registrata"}</em></> : <><b>{result.weightedScore.toFixed(3)} / 5</b><em>{result.normalizedScore?.toFixed(2)} / 100</em></>}</div></summary><div className="evaluation-result-meta"><span>{result.validObservations} osservazioni valide</span><span>{result.notObserved} decisioni non osservato</span><span>{result.distinctExercises} esercizi</span><span>{result.distinctContexts} contesti</span><span>{reliabilityLabel[result.reliability]}</span></div><div className="evaluation-observation-history">{result.observations.map(observation => <article key={observation.id}><header><b>{observation.exercise.codice} \u00b7 {observation.exercise.nome}</b><time>{new Date(observation.observed_at).toLocaleString("it-IT")}</time></header><p>{observation.observation_status === "NOT_OBSERVED" ? "Non osservato" : `${observation.score} \u00b7 ${observation.level?.label ?? ""}`}</p>{observation.notes && <blockquote>{observation.notes}</blockquote>}<small>Suitability {Number(observation.target.suitability_weight).toFixed(2)} \u00b7 Observability {Number(observation.target.observability_weight).toFixed(2)} \u00b7 Confidence {Number(observation.confidence ?? 1).toFixed(2)}</small></article>)}</div></details>; })}</div></section>;
}
