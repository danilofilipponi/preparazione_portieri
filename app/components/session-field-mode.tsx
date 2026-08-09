"use client";

import { useEffect, useState } from "react";
import type { SessionBlock } from "../../lib/types";
import type { SessionDisplayExercise } from "../../lib/session-visualization";
import { getExerciseProcedure, getFieldModeIndex } from "../../lib/session-visualization";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

type Props = { items: SessionDisplayExercise[]; blocks: SessionBlock[]; goalkeeperName: (id: string) => string; onClose: () => void };

export function SessionFieldMode({ items, blocks, goalkeeperName, onClose }: Props) {
  const ordered = [...items].sort((a, b) => a.blockOrder - b.blockOrder || a.blockPosition - b.blockPosition);
  const [index, setIndex] = useState(0);
  const item = ordered[index];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex(current => getFieldModeIndex(current, -1, ordered.length));
      if (event.key === "ArrowRight") setIndex(current => getFieldModeIndex(current, 1, ordered.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, ordered.length]);
  if (!item) return null;
  const block = blocks.find(candidate => candidate.ordine === item.blockOrder);
  const steps = getExerciseProcedure(item.exercise);
  const coaching = (item.exercise.coaching_points || "").split(/[;\n]+/).map(value => value.trim()).filter(Boolean);
  return <div className="field-mode-overlay" role="dialog" aria-modal="true" aria-label="Modalità campo">
    <header><div><small>Blocco {String.fromCharCode(64 + item.blockOrder)}</small><strong>{block?.tipo_blocco || "Seduta"}</strong></div><span>{index + 1} / {ordered.length}</span><button onClick={onClose} aria-label="Chiudi modalità campo">×</button></header>
    <main>
      <div className="field-mode-title"><span className="code-badge">{item.exercise.codice}</span><h2>{item.exercise.nome}</h2><strong>{item.plannedDuration} min</strong></div>
      <div className="field-mode-image">{item.exercise.tactical_diagram ? <ExerciseTacticalBoard diagram={item.exercise.tactical_diagram} className="field-mode-board" /> : <div className="session-image-placeholder"><span>⌗</span><small>Schema tattico da generare</small></div>}</div>
      <div className="field-mode-info">
        <section><small>Obiettivo</small><p>{item.exercise.obiettivo || "Non specificato"}</p></section>
        {steps.length > 0 && <section><small>Svolgimento</small><ol>{steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol></section>}
        {coaching.length > 0 && <section><small>Coaching points</small><ul>{coaching.map(point => <li key={point}>{point}</li>)}</ul></section>}
        {item.variants.some(variant => variant.variante_individuale) && <section><small>Varianti individuali</small>{item.variants.filter(variant => variant.variante_individuale).map((variant, variantIndex) => <div className="field-variant" key={`${variant.goalkeeper_id}-${variantIndex}`}><b>{goalkeeperName(variant.goalkeeper_id)}</b><p>{variant.variante_individuale}</p></div>)}</section>}
      </div>
    </main>
    <footer><button disabled={index === 0} onClick={() => setIndex(current => getFieldModeIndex(current, -1, ordered.length))}>Precedente</button><button disabled={index === ordered.length - 1} onClick={() => setIndex(current => getFieldModeIndex(current, 1, ordered.length))}>Successivo</button></footer>
  </div>;
}
