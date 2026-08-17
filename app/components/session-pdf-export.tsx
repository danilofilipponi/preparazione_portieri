"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EvaluationFieldPayload } from "../../lib/evaluation-field";
import { buildEvaluationResults } from "../../lib/evaluation-field";
import { getExerciseProcedure, type SessionDisplayExercise } from "../../lib/session-visualization";
import { supabase } from "../../lib/supabase";
import { compactFieldText, evaluationPdfFilename, evaluationTypeLabel, formatPdfDate, reliabilityLabel, trainingPdfFilename } from "../../lib/session-pdf";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

export type TrainingPdfData = {
  title: string;
  date: string;
  duration: number;
  goalkeeperNames: string[];
  goalkeeperCount: number;
  phase: string;
  technicalObjectives: string[];
  physicalObjectives: string[];
  exercises: SessionDisplayExercise[];
};

type SessionPdfDocumentProps =
  | { kind: "training"; training: TrainingPdfData; evaluation?: never }
  | { kind: "evaluation"; evaluation: EvaluationFieldPayload; training?: never };

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function fieldItems(value: string | null | undefined, fallback: string) {
  const items = (value ?? "").split(/[;\n•]+/).map(item => item.trim()).filter(Boolean);
  return items.length ? items : [fallback];
}

const PDF_EXERCISES_PER_PAGE = 4;

function paginatePdfItems<T>(items: T[]) {
  if (!items.length) return [[]] as T[][];
  return Array.from({ length: Math.ceil(items.length / PDF_EXERCISES_PER_PAGE) }, (_, page) => items.slice(page * PDF_EXERCISES_PER_PAGE, (page + 1) * PDF_EXERCISES_PER_PAGE));
}

function ExercisePdfCard({ number, item, evaluationTargets }: { number: number; item: SessionDisplayExercise; evaluationTargets?: EvaluationFieldPayload["exercises"][number]["targets"] }) {
  const exercise = item.exercise;
  const steps = getExerciseProcedure(exercise);
  const procedure = steps.length ? steps : [exercise.descrizione];
  const coaching = fieldItems(exercise.coaching_points, "Nessuna indicazione inserita.");
  const commonErrors = fieldItems(exercise.errori_comuni, "Nessun errore comune inserito.");
  return <article className={`session-pdf-exercise-card ${evaluationTargets ? "is-evaluation" : ""}`}>
    <header><span>{number}</span><div><small>{exercise.codice}</small><h3>{exercise.nome}</h3></div><b>{item.plannedDuration} min</b></header>
    {exercise.tactical_diagram ? <div className="session-pdf-board"><ExerciseTacticalBoard diagram={exercise.tactical_diagram} /></div> : <div className="session-pdf-board session-pdf-board-empty">Schema non disponibile</div>}
    <div className="session-pdf-exercise-meta"><span><b>Materiale</b>{compactFieldText(exercise.materiale)}</span><span><b>Obiettivo</b>{compactFieldText(exercise.obiettivo)}</span><span><b>Contesto</b>{exercise.categoria} · {exercise.sottocategoria} · {exercise.fase}</span></div>
    <div className="session-pdf-procedure"><b>Svolgimento</b><ol>{procedure.filter(Boolean).map((step, index) => <li key={`${exercise.id}-step-${index}`}>{step}</li>)}</ol></div>
    <div className="session-pdf-guidance"><section><b>Coaching points</b><ul>{coaching.map((point, index) => <li key={`${exercise.id}-coaching-${index}`}>{point}</li>)}</ul></section><section><b>Errori comuni</b><ul>{commonErrors.map((error, index) => <li key={`${exercise.id}-error-${index}`}>{error}</li>)}</ul></section></div>
    {evaluationTargets && <div className="session-pdf-observation-targets"><b>Parametri da osservare</b><div>{unique(evaluationTargets.map(target => target.target_type === "Physical" ? target.physical_dimension_name || target.fis_name || target.parameter_name : target.parameter_name)).map(target => <span key={target}>{target}</span>)}</div></div>}
  </article>;
}

function PdfHeader({ eyebrow, title, facts }: { eyebrow: string; title: string; facts: Array<{ label: string; value: string }> }) {
  return <><header className="session-pdf-header"><div><small>KEEPERLAB · {eyebrow}</small><h1>{title}</h1></div><div className="session-pdf-header-mark">KL</div></header><div className="session-pdf-facts">{facts.map(fact => <span key={fact.label}><small>{fact.label}</small><b>{fact.value}</b></span>)}</div></>;
}

function PdfContinuationHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <header className="session-pdf-continuation-header"><div><small>KEEPERLAB · {eyebrow}</small><b>{title}</b></div><span>Continua</span></header>;
}

function TrainingPdfDocument({ data }: { data: TrainingPdfData }) {
  const pages = paginatePdfItems(data.exercises);
  return <div className="session-pdf-page session-pdf-training">{pages.map((items, pageIndex) => <section className={`session-pdf-sheet session-pdf-exercise-page exercise-count-${items.length}`} key={`training-page-${pageIndex}`}>
    {pageIndex === 0 ? <><PdfHeader eyebrow="Seduta di allenamento" title={data.title} facts={[
        { label: "Data", value: formatPdfDate(data.date) },
        { label: "Durata", value: `${data.duration} minuti` },
        { label: "Portieri", value: data.goalkeeperNames.length ? data.goalkeeperNames.join(" · ") : String(data.goalkeeperCount) },
        { label: "Fase", value: compactFieldText(data.phase) },
      ]} /><section className="session-pdf-objectives"><div><b>Obiettivi tecnici</b><p>{unique(data.technicalObjectives).join(" · ") || "Non specificati"}</p></div><div><b>Obiettivi fisici</b><p>{unique(data.physicalObjectives).join(" · ") || "Non specificati"}</p></div></section></> : <PdfContinuationHeader eyebrow="Seduta di allenamento" title={data.title} />}
    <main className="session-pdf-grid">{items.map((item, itemIndex) => <ExercisePdfCard key={item.id} number={pageIndex * PDF_EXERCISES_PER_PAGE + itemIndex + 1} item={item} />)}</main>
    <PdfFooter page={pageIndex + 1} total={pages.length} />
  </section>)}</div>;
}

function EvaluationPdfDocument({ payload }: { payload: EvaluationFieldPayload }) {
  const results = payload.session.status === "Completed" ? buildEvaluationResults(payload) : [];
  const technicalTargets = unique(payload.exercises.flatMap(item => item.targets.filter(target => target.target_type === "Technical").map(target => target.parameter_name)));
  const physicalTargets = unique(payload.exercises.flatMap(item => item.targets.filter(target => target.target_type === "Physical").map(target => target.physical_dimension_name || target.fis_name || target.parameter_name)));
  const exercises: SessionDisplayExercise[] = payload.exercises.map(item => ({ id: item.training_exercise_id, exercise: item.exercise, plannedDuration: item.planned_duration_minutes, blockOrder: 1, blockPosition: item.position, locked: true, reasons: [], variants: [] }));
  const duration = exercises.reduce((sum, item) => sum + item.plannedDuration, 0);
  const exercisePages = paginatePdfItems(exercises.map((item, index) => ({ item, targets: payload.exercises[index]?.targets })));
  const totalPages = exercisePages.length + (results.length ? 1 : 0);
  return <div className={`session-pdf-page session-pdf-evaluation ${results.length ? "has-results" : ""}`}>{exercisePages.map((entries, pageIndex) => <section className={`session-pdf-sheet session-pdf-exercise-page exercise-count-${entries.length}`} key={`evaluation-page-${pageIndex}`}>
    {pageIndex === 0 ? <><PdfHeader eyebrow="Valutazione portiere" title={payload.session.goalkeeper_name} facts={[
        { label: "Data", value: formatPdfDate(payload.session.date) },
        { label: "Tipo", value: evaluationTypeLabel(payload.session.evaluation_type) },
        { label: "Durata", value: `${duration} minuti` },
        { label: "Stato", value: payload.session.status },
      ]} /><section className="session-pdf-objectives"><div><b>Parametri tecnici</b><p>{technicalTargets.join(" · ") || "Nessun parametro tecnico"}</p></div><div><b>Fisici osservabili</b><p>{physicalTargets.join(" · ") || "Nessun parametro fisico"}</p></div></section></> : <PdfContinuationHeader eyebrow="Valutazione portiere" title={payload.session.goalkeeper_name} />}
    <main className="session-pdf-grid">{entries.map((entry, itemIndex) => <ExercisePdfCard key={entry.item.id} number={pageIndex * PDF_EXERCISES_PER_PAGE + itemIndex + 1} item={entry.item} evaluationTargets={entry.targets} />)}</main>
    <PdfFooter page={pageIndex + 1} total={totalPages} />
    </section>)}{results.length > 0 && <section className="session-pdf-sheet session-pdf-results"><h2>Risultati</h2><div className="session-pdf-results-table"><div className="head"><b>Parametro</b><b>Risultato</b><b>Affidabilità</b></div>{results.map(result => <div key={result.sessionTargetId}><span><b>{result.name}</b>{result.targetType === "Physical" && result.physicalDimensionName ? <small>{result.physicalDimensionName}{result.fisName ? ` · ${result.fisName}` : ""}</small> : null}</span><strong>{result.weightedScore == null ? "NOT_OBSERVED" : `${result.weightedScore.toFixed(2)} / 5`}</strong><span>{reliabilityLabel(result.reliability)}</span></div>)}</div><PdfFooter page={exercisePages.length + 1} total={totalPages} /></section>}
  </div>;
}

function PdfFooter({ page, total }: { page: number; total: number }) {
  return <footer className="session-pdf-footer"><span>KeeperLab</span><span>Esportato il {new Date().toLocaleDateString("it-IT")}</span><span>Pagina {page} / {total}</span></footer>;
}

export function SessionPdfDocument(props: SessionPdfDocumentProps) {
  return props.kind === "training" ? <TrainingPdfDocument data={props.training} /> : <EvaluationPdfDocument payload={props.evaluation} />;
}

function usePrintDocument() {
  const [document, setDocument] = useState<SessionPdfDocumentProps | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!document || !filename) return;
    const previousTitle = window.document.title;
    const clear = () => { window.document.title = previousTitle; setDocument(null); setFilename(""); setPrinting(false); };
    window.document.title = filename.replace(/\.pdf$/i, "");
    window.addEventListener("afterprint", clear, { once: true });
    const timeout = window.setTimeout(clear, 60000);
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timeout); window.removeEventListener("afterprint", clear); window.document.title = previousTitle; };
  }, [document, filename]);

  const print = useCallback((nextDocument: SessionPdfDocumentProps, nextFilename: string) => {
    setError(""); setPrinting(true); setDocument(nextDocument); setFilename(nextFilename);
  }, []);
  return { document, error, setError, printing, setPrinting, print };
}

function PrintPortal({ document }: { document: SessionPdfDocumentProps | null }) {
  if (!document || typeof window === "undefined") return null;
  return createPortal(<div className="session-pdf-root" aria-hidden="true"><SessionPdfDocument {...document} /></div>, window.document.body);
}

export function TrainingPdfExportButton({ data }: { data: TrainingPdfData }) {
  const state = usePrintDocument();
  return <span className="pdf-export-control"><button className="pdf-export-action" type="button" disabled={state.printing} onClick={() => state.print({ kind: "training", training: data }, trainingPdfFilename(data.date, data.title))} aria-label="Esporta seduta in PDF"><span aria-hidden="true">⇩</span>{state.printing ? "Preparazione…" : "Esporta PDF"}</button>{state.error && <small role="alert">{state.error}</small>}<PrintPortal document={state.document} /></span>;
}

export function EvaluationPdfExportButton({ sessionId }: { sessionId: string }) {
  const state = usePrintDocument();
  const { setError } = state;
  const [payload, setPayload] = useState<EvaluationFieldPayload | null>(null);
  const [loadingPayload, setLoadingPayload] = useState(true);
  const loadPayload = useCallback(async () => {
    setLoadingPayload(true);
    setError("");
    try {
      if (!supabase) throw new Error("Connessione a Supabase non disponibile.");
      const { data, error } = await supabase.rpc("get_evaluation_field_session", { requested_session_id: sessionId });
      if (error) throw error;
      const nextPayload = data as unknown as EvaluationFieldPayload;
      if (!nextPayload?.session || !Array.isArray(nextPayload.exercises)) throw new Error("Dati della valutazione non disponibili.");
      setPayload(nextPayload);
    } catch (error) {
      setPayload(null);
      setError(error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "Impossibile preparare il PDF.");
    } finally { setLoadingPayload(false); }
  }, [sessionId, setError]);
  // Il payload viene precaricato all'apertura: il click successivo conserva il gesto utente necessario a window.print().
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPayload(); }, [loadPayload]);
  const exportEvaluation = () => {
    if (!payload) { void loadPayload(); return; }
    state.print({ kind: "evaluation", evaluation: payload }, evaluationPdfFilename(payload));
  };
  return <span className="pdf-export-control"><button className="pdf-export-action" type="button" disabled={state.printing || loadingPayload} onClick={exportEvaluation} aria-label="Esporta valutazione in PDF"><span aria-hidden="true">⇩</span>{state.printing ? "Preparazione…" : loadingPayload ? "Caricamento…" : payload ? "Esporta PDF" : "Riprova PDF"}</button>{state.error && <small role="alert">{state.error}</small>}<PrintPortal document={state.document} /></span>;
}
