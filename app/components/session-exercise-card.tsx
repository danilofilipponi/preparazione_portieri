"use client";

import type { SessionDisplayExercise } from "../../lib/session-visualization";
import { getQuickCoachingPoints } from "../../lib/session-visualization";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

type Props = {
  item: SessionDisplayExercise;
  number: number;
  goalkeeperName: (id: string) => string;
  editable?: boolean;
  onOpen: () => void;
  onToggleLock?: () => void;
  onDuration?: (minutes: number) => void;
  onReplace?: () => void;
  onVariants?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onRemove?: () => void;
  disableMoveUp?: boolean;
  disableMoveDown?: boolean;
};

export function SessionExerciseCard(props: Props) {
  const { exercise } = props.item;
  const coaching = getQuickCoachingPoints(exercise);
  return <article className={`session-exercise-card ${props.item.locked ? "locked" : ""}`}>
    <div className="session-exercise-media">
      {exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={exercise.tactical_diagram} className="session-board" /> : <div className="session-image-placeholder"><span>⌗</span><small>Schema tattico da generare</small></div>}
      <span className="session-exercise-number">{props.number}</span>
    </div>
    <div className="session-exercise-content">
      <div className="session-exercise-heading"><div><span className="code-badge">{exercise.codice}</span><h3>{exercise.nome}</h3></div><strong className="session-planned-duration">{props.item.plannedDuration}&apos;</strong></div>
      <p className="session-exercise-taxonomy">{exercise.categoria} · {exercise.sottocategoria} · <b>{exercise.fase}</b></p>
      <div className="session-exercise-badges"><span>Intensità {exercise.intensita}</span><span>Difficoltà {"★".repeat(exercise.difficolta)}</span><span>{exercise.portieri_min}–{exercise.portieri_max} portieri</span>{props.item.locked && <span className="locked-badge">Bloccato</span>}</div>
      <p className="session-exercise-objective"><b>Obiettivo</b>{exercise.obiettivo || "Non specificato"}</p>
      <p className="session-exercise-description">{exercise.descrizione || "Descrizione non disponibile."}</p>
      {coaching.length > 0 && <div className="session-quick-coaching"><b>Coaching</b>{coaching.map(point => <span key={point}>• {point}</span>)}</div>}
      {props.item.reasons.length > 0 && <details className="selection-reasons"><summary>Perché è stato scelto</summary>{props.item.reasons.map(reason => <p key={reason}>✓ {reason}</p>)}</details>}
      {props.item.variants.length > 0 && <div className="session-individual-variants"><b>Varianti individuali</b>{props.item.variants.filter(item => item.variante_individuale).map((variant, index) => <div key={`${variant.goalkeeper_id}-${index}`}><strong>{props.goalkeeperName(variant.goalkeeper_id)}</strong><span>{variant.variante_individuale}</span></div>)}</div>}
      <footer className="session-exercise-actions">
        <button className="primary compact" onClick={props.onOpen}>Apri esercizio</button>
        {props.editable && <>
          <button className="lock-action" onClick={props.onToggleLock} aria-label={props.item.locked ? "Sblocca esercizio" : "Blocca esercizio"} title={props.item.locked ? "Sblocca" : "Blocca"}>{props.item.locked ? "🔒" : "🔓"}</button>
          <label className="session-duration-control"><span>Minuti</span><input aria-label={`Durata pianificata ${exercise.nome}`} type="number" min="5" value={props.item.plannedDuration} onChange={event => props.onDuration?.(Number(event.target.value))} /></label>
          <details className="session-actions-menu"><summary aria-label={`Altre azioni per ${exercise.nome}`} title="Altre azioni">•••</summary><div>
            <button onClick={props.onReplace}>Sostituisci</button><button onClick={props.onVariants}>Varianti individuali</button>
            <button disabled={props.disableMoveUp} onClick={() => props.onMove?.(-1)}>Sposta su</button><button disabled={props.disableMoveDown} onClick={() => props.onMove?.(1)}>Sposta giù</button>
            <button className="danger-link" onClick={props.onRemove}>Rimuovi</button>
          </div></details>
        </>}
      </footer>
    </div>
  </article>;
}
