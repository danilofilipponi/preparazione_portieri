"use client";

import { useEffect, useMemo, useState } from "react";
import type { EditableGeneratedSession, Exercise, SessionBlock, SessionQualityResult, TrainingExerciseVariant } from "../../lib/types";
import type { SessionDisplayExercise } from "../../lib/session-visualization";
import { groupSessionExercises } from "../../lib/session-visualization";
import { SessionExerciseCard } from "./session-exercise-card";
import { SessionFieldMode } from "./session-field-mode";
import { SessionOverviewHeader } from "./session-overview-header";
import { SessionQualityPanel } from "./session-quality-panel";

type Props = {
  result: EditableGeneratedSession | null;
  blocks: SessionBlock[];
  quality: SessionQualityResult | null;
  confirmed: boolean;
  date: string;
  duration: number;
  keepers: number;
  matchDay: string;
  seasonPhase: string;
  load: string;
  technicalPrimary: string;
  technicalSecondary: string | null;
  physicalPrimary: string;
  goalkeeperNames: string[];
  goalkeeperName: (id: string) => string;
  blockTechnicalName: (id: number | null) => string | null;
  blockPhysicalName: (id: string | null) => string | null;
  onOpenExercise: (exercise: Exercise, plannedDuration: number, variants: TrainingExerciseVariant[]) => void;
  onToggleLock: (id: string) => void;
  onDuration: (id: string, minutes: number) => void;
  onRemove: (id: string) => void;
  onReplace: (id: string) => void;
  onVariants: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRegenerateBlock: (order: number) => void;
  onRegenerateSession: () => void;
  onRecalculateAll: () => void;
  onAdd: (order: number) => void;
  onConfirm: () => void;
};

export function SessionExercisePreview(props: Props) {
  const [debug, setDebug] = useState(false);
  const [fieldMode, setFieldMode] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const displayItems = useMemo<SessionDisplayExercise[]>(() => (props.result?.selections ?? []).map(item => ({
    id: item.session_exercise_id || item.exercise.id,
    exercise: item.exercise,
    plannedDuration: item.planned_duration_minutes,
    blockOrder: item.block_order,
    blockPosition: item.block_position,
    locked: item.locked,
    reasons: item.reasons,
    variants: item.variants ?? [],
  })), [props.result]);

  useEffect(() => {
    if (!props.blocks.length) return;
    const compact = window.matchMedia("(max-width: 640px)").matches;
    setExpanded(current => Object.keys(current).length ? current : Object.fromEntries(props.blocks.map((block, index) => [block.ordine, !compact || index === 0])));
  }, [props.blocks]);

  if (!props.result) return <section className="planner-section exercise-preview-empty"><h2>Preview esercizi</h2><p>Genera gli esercizi dopo aver definito priorità e blocchi.</p></section>;

  return <>
    <section className="planner-section exercise-preview session-visualization">
      <div className="planner-section-head"><div><span>6</span><h2>Seduta generata</h2></div><div className="session-regen-actions"><button className="secondary" onClick={props.onRegenerateSession}>Rigenera esercizi</button><button className="secondary" onClick={props.onRecalculateAll}>Ricalcola tutto</button></div></div>
      <SessionOverviewHeader date={props.date} matchDay={props.matchDay} seasonPhase={props.seasonPhase} duration={props.duration} load={props.load} goalkeeperCount={props.keepers} technicalPrimary={props.technicalPrimary} technicalSecondary={props.technicalSecondary} physicalPrimary={props.physicalPrimary} goalkeeperNames={props.goalkeeperNames} quality={props.quality?.score} onFieldMode={() => setFieldMode(true)} />
      <div className="generated-block-list">{props.blocks.map((block, blockIndex) => {
        const items = groupSessionExercises(displayItems, block.ordine);
        const isOpen = expanded[block.ordine] ?? true;
        return <article key={block.ordine} className={`generated-block rich-block ${isOpen ? "open" : "collapsed"}`}>
          <header>
            <button className="block-collapse" onClick={() => setExpanded(current => ({ ...current, [block.ordine]: !isOpen }))} aria-expanded={isOpen} aria-label={`${isOpen ? "Comprimi" : "Espandi"} blocco ${String.fromCharCode(65 + blockIndex)}`}><b>{String.fromCharCode(65 + blockIndex)}</b><span>{isOpen ? "⌃" : "⌄"}</span></button>
            <div className="rich-block-heading"><strong>{block.tipo_blocco}</strong><small>{block.durata_target} min · {items.length} {items.length === 1 ? "esercizio" : "esercizi"}</small></div>
            <div className="rich-block-targets"><span>{block.fase_metodologica_preferita || "Fase libera"}</span><span>Carico {block.carico_target || "libero"}</span>{props.blockTechnicalName(block.technical_category_id)&&<span>Focus {props.blockTechnicalName(block.technical_category_id)}</span>}{props.blockPhysicalName(block.physical_dimension_id)&&<span>Fisico {props.blockPhysicalName(block.physical_dimension_id)}</span>}{block.notes && <span>{block.notes}</span>}</div>
            <div className="block-editor-actions"><button onClick={() => props.onAdd(block.ordine)}>+ Aggiungi</button><button onClick={() => props.onRegenerateBlock(block.ordine)}>↻ Rigenera blocco</button></div>
          </header>
          {isOpen && <div className="rich-block-body">{items.length ? items.map((displayItem, itemIndex) => {
            const original = props.result!.selections.find(selection => selection.exercise.id === displayItem.exercise.id)!;
            const globalIndex = displayItems.findIndex(candidate => candidate.id === displayItem.id) + 1;
            return <SessionExerciseCard key={displayItem.id} item={displayItem} number={globalIndex} goalkeeperName={props.goalkeeperName} editable onOpen={() => props.onOpenExercise(displayItem.exercise, displayItem.plannedDuration, displayItem.variants)} onToggleLock={() => props.onToggleLock(original.exercise.id)} onDuration={minutes => props.onDuration(original.exercise.id, minutes)} onReplace={() => props.onReplace(original.exercise.id)} onVariants={() => props.onVariants(original.exercise.id)} onMove={direction => props.onMove(original.exercise.id, direction)} onRemove={() => props.onRemove(original.exercise.id)} disableMoveUp={itemIndex === 0} disableMoveDown={itemIndex === items.length - 1} />;
          }) : <p className="planner-empty">Blocco vuoto: aggiungi un esercizio o rigenera.</p>}</div>}
        </article>;
      })}</div>
      <div className="preview-total"><div><small>Tempo netto</small><strong>{props.result.net_minutes} min</strong></div><div><small>Transizioni</small><strong>{props.result.transition_minutes} min</strong></div><div><small>Totale</small><strong>{props.result.total_minutes} min</strong></div></div>
      {process.env.NODE_ENV !== "production" && <><button className="debug-toggle" onClick={() => setDebug(value => !value)}>{debug ? "Nascondi debug" : "Debug: top 10 candidati"}</button>{debug && <div className="exercise-debug">{props.blocks.map(block => <section key={block.ordine}><h3>Blocco {String.fromCharCode(64 + block.ordine)}</h3>{(props.result!.debug[block.ordine] ?? []).map(candidate => <details key={candidate.exercise.id}><summary><span>{candidate.exercise.codice} · {candidate.exercise.nome}</span><b>{candidate.exercise_score.toFixed(1)}</b></summary><div className="debug-scores">{Object.entries(candidate.breakdown).map(([key, value]) => <span key={key}>{key}: <b>{value}</b></span>)}</div></details>)}</section>)}</div>}</>}
    </section>
    {props.quality && <SessionQualityPanel quality={props.quality} confirmed={props.confirmed} onConfirm={props.onConfirm} />}
    {fieldMode && <SessionFieldMode items={displayItems} blocks={props.blocks} goalkeeperName={props.goalkeeperName} onClose={() => setFieldMode(false)} />}
  </>;
}
