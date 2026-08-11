"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TacticalActionType, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "../../lib/types";
import { addDiagramAction, addDiagramElement, duplicateDiagramElement, generateTacticalDiagram, moveDiagramElement, removeDiagramItem } from "../../lib/tactical-diagram";
import type { Exercise } from "../../lib/types";
import { ExerciseTacticalBoard } from "./exercise-tactical-board";

const elementLabels: Record<TacticalElementType, string> = { goalkeeper: "Portiere", coach: "Preparatore", attacker: "Attaccante", player: "Giocatore", ball: "Pallone", cone: "Cono", mannequin: "Sagoma", hurdle: "Ostacolo", mini_goal: "Porticina", goal: "Porta", marker: "Marcatore" };
const actionLabels: Record<TacticalActionType, string> = { movimento: "Movimento", passaggio: "Passaggio", tiro: "Tiro", cross: "Cross", tuffo: "Tuffo", recupero: "Recupero", corsa: "Corsa", conduzione: "Conduzione" };

type Props = { exercise: Exercise; value: TacticalDiagram; onSave: (diagram: TacticalDiagram) => void; onCancel: () => void };

export function TacticalDiagramEditor({ exercise, value, onSave, onCancel }: Props) {
  const [history, setHistory] = useState<TacticalDiagram[]>([value]);
  const [cursor, setCursor] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawType, setDrawType] = useState<TacticalActionType | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const diagram = history[Math.min(cursor, history.length - 1)] ?? value;
  const selectedElement = diagram.elements.find(item => item.id === selectedId);
  const selectedAction = diagram.actions.find(item => item.id === selectedId);
  const commit = useCallback((next: TacticalDiagram) => {
    setHistory(current => {
      const safeCursor = Math.max(0, Math.min(cursor, current.length - 1));
      const updated = [...current.slice(0, safeCursor + 1), next];
      setCursor(updated.length - 1);
      return updated;
    });
  }, [cursor]);
  const updateElement = (patch: Partial<TacticalDiagramElement>) => selectedElement && commit({ ...diagram, elements: diagram.elements.map(item => item.id === selectedElement.id ? { ...item, ...patch } : item) });
  const updateAction = (patch: Partial<TacticalDiagramAction>) => selectedAction && commit({ ...diagram, actions: diagram.actions.map(item => item.id === selectedAction.id ? { ...item, ...patch } : item) });
  const selected = useMemo(() => selectedElement ?? selectedAction, [selectedElement, selectedAction]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); setCursor(value => Math.max(0, value - 1)); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); setCursor(value => Math.min(history.length - 1, value + 1)); return; }
      if (!selectedId || (event.target as HTMLElement)?.matches("input, textarea, select")) return;
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); commit(removeDiagramItem(diagram, selectedId)); setSelectedId(null); return; }
      if (selectedElement && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); const distance = event.shiftKey ? 5 : 1;
        commit(moveDiagramElement(diagram, selectedElement.id, selectedElement.x + (event.key === "ArrowRight" ? distance : event.key === "ArrowLeft" ? -distance : 0), selectedElement.y + (event.key === "ArrowDown" ? distance : event.key === "ArrowUp" ? -distance : 0)));
      }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [commit, diagram, history.length, selectedElement, selectedId]);
  const localRendererComparison = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

  return <section className="tactical-editor" aria-label="Editor schema tattico">
    <header><div><span className="eyebrow">Editor visuale</span><h3>{exercise.codice} · {exercise.nome}</h3></div><div className="editor-history"><button type="button" disabled={cursor === 0} onClick={() => setCursor(value => value - 1)} aria-label="Annulla">↶</button><button type="button" disabled={cursor === history.length - 1} onClick={() => setCursor(value => value + 1)} aria-label="Ripeti">↷</button><button type="button" onClick={() => commit({ ...diagram, actions: diagram.actions.map((item, index) => ({ ...item, sequence: index + 1 })) })}>Ordina sequenza</button><button type="button" className="danger-link" onClick={() => { if (window.confirm("Ripristinare lo schema automatico? Le modifiche non salvate saranno perse.")) { const next = generateTacticalDiagram(exercise); setHistory([next]); setCursor(0); setSelectedId(null); } }}>Reset schema</button></div></header>
    {selectedElement && <div className="editor-precision-controls"><strong>Posizione precisa</strong><button type="button" aria-label="Sposta su" onClick={() => commit(moveDiagramElement(diagram, selectedElement.id, selectedElement.x, selectedElement.y - 1))}>↑</button><button type="button" aria-label="Sposta a sinistra" onClick={() => commit(moveDiagramElement(diagram, selectedElement.id, selectedElement.x - 1, selectedElement.y))}>←</button><button type="button" aria-label="Sposta a destra" onClick={() => commit(moveDiagramElement(diagram, selectedElement.id, selectedElement.x + 1, selectedElement.y))}>→</button><button type="button" aria-label="Sposta giù" onClick={() => commit(moveDiagramElement(diagram, selectedElement.id, selectedElement.x, selectedElement.y + 1))}>↓</button><button type="button" onClick={() => updateElement({ rotation: selectedElement.rotation - 5 })}>Ruota SX</button><button type="button" onClick={() => updateElement({ rotation: selectedElement.rotation + 5 })}>Ruota DX</button></div>}
    <div className="tactical-editor-toolbar"><label>Campo<select value={diagram.canvas.viewType} onChange={event => commit({ ...diagram, canvas: { ...diagram.canvas, viewType: event.target.value as TacticalDiagram["canvas"]["viewType"] } })}><option value="penalty_area">Area di rigore</option><option value="front_goal">Fronte porta</option><option value="half_pitch">Metà campo</option><option value="full_pitch">Campo intero</option></select></label><div className="toolbar-group"><span>Aggiungi</span>{(Object.keys(elementLabels) as TacticalElementType[]).map(type => <button type="button" key={type} onClick={() => commit(addDiagramElement(diagram, type))}>{elementLabels[type]}</button>)}</div><div className="toolbar-group"><span>Azioni rapide</span>{(["tiro", "passaggio", "tuffo", "recupero", "cross", "conduzione"] as TacticalActionType[]).map(type => <button type="button" key={type} onClick={() => commit(addDiagramAction(diagram, type))}>{actionLabels[type]}</button>)}<button type="button" onClick={() => commit(addDiagramAction(diagram, "tiro", 25, 35, 50, 72))}>Tiro → GK</button><button type="button" onClick={() => commit(addDiagramAction(diagram, "tuffo", 50, 72, 30, 68))}>Tuffo SX</button><button type="button" onClick={() => commit(addDiagramAction(diagram, "tuffo", 50, 72, 70, 68))}>Tuffo DX</button><button type="button" onClick={() => commit(addDiagramAction(diagram, "cross", 10, 28, 52, 62))}>Cross SX</button><button type="button" onClick={() => commit(addDiagramAction(diagram, "cross", 90, 28, 48, 62))}>Cross DX</button></div><div className="manual-action-control"><label>+ Azione<select value={drawType ?? ""} onChange={event => setDrawType(event.target.value ? event.target.value as TacticalActionType : null)}><option value="">Disattivata</option>{Object.entries(actionLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label><small>{drawType ? "Trascina sulla lavagna dal punto iniziale al punto finale." : "Scegli il tipo per disegnare una freccia."}</small></div></div>
    <div className="tactical-editor-workspace"><ExerciseTacticalBoard diagram={diagram} interactive selectedId={selectedId} onSelect={setSelectedId} onMoveElement={(id, x, y) => commit(moveDiagramElement(diagram, id, x, y))} onCanvasPointerDown={(x, y) => { if (drawType) setDrawStart({ x, y }); }} onCanvasPointerUp={(x, y) => { if (drawType && drawStart) { commit(addDiagramAction(diagram, drawType, drawStart.x, drawStart.y, x, y)); setDrawStart(null); } }} onActionPoint={(id, point, x, y) => { if (id === "new") return; const action = diagram.actions.find(item => item.id === id); if (action) commit({ ...diagram, actions: diagram.actions.map(item => item.id === id ? { ...item, [point === "start" ? "startX" : "endX"]: x, [point === "start" ? "startY" : "endY"]: y } : item) }); }} />
      <aside className="tactical-properties"><h4>{selected ? "Elemento selezionato" : "Seleziona un elemento"}</h4>{selectedElement && <><label>Etichetta<input value={selectedElement.label ?? ""} onChange={event => updateElement({ label: event.target.value })} /></label><label>Ruolo<input value={selectedElement.role ?? ""} onChange={event => updateElement({ role: event.target.value })} /></label><label>Rotazione<input type="range" min="-180" max="180" value={selectedElement.rotation} onChange={event => updateElement({ rotation: Number(event.target.value) })} /></label><label>Scala<input type="range" min="0.6" max="2" step="0.1" value={selectedElement.scale} onChange={event => updateElement({ scale: Number(event.target.value) })} /></label><div className="property-actions"><button type="button" onClick={() => commit(duplicateDiagramElement(diagram, selectedElement.id))}>Duplica</button><button type="button" className="danger-link" onClick={() => { commit(removeDiagramItem(diagram, selectedElement.id)); setSelectedId(null); }}>Elimina</button></div></>}{selectedAction && <><label>Tipo<select value={selectedAction.type} onChange={event => updateAction({ type: event.target.value as TacticalActionType })}>{Object.entries(actionLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label><label>Numero<input type="number" min="1" value={selectedAction.sequence} onChange={event => updateAction({ sequence: Number(event.target.value) })} /></label><label>Etichetta<input value={selectedAction.label ?? ""} onChange={event => updateAction({ label: event.target.value })} /></label><label>Tratto<select value={selectedAction.style ?? "solid"} onChange={event => updateAction({ style: event.target.value as TacticalDiagramAction["style"] })}><option value="solid">Continuo</option><option value="dashed">Tratteggiato</option><option value="curved">Curvo</option></select></label><button type="button" className="danger-link" onClick={() => { commit(removeDiagramItem(diagram, selectedAction.id)); setSelectedId(null); }}>Elimina azione</button></>}</aside>
    </div>
    {localRendererComparison && <details className="tactical-renderer-comparison"><summary>Confronto tecnico V1 / V2</summary><div><section><b>V1 · stesso JSON</b><ExerciseTacticalBoard diagram={diagram} rendererVersion="v1" /></section><section><b>V2 · stesso JSON</b><ExerciseTacticalBoard diagram={diagram} rendererVersion="v2" /></section></div></details>}
    <footer className="modal-actions"><button type="button" className="secondary" onClick={onCancel}>Annulla</button><button type="button" className="secondary" onClick={() => { const next = generateTacticalDiagram(exercise); setHistory([next]); setCursor(0); setSelectedId(null); }}>Rigenera</button><button type="button" className="primary" onClick={() => onSave(diagram)}>Salva schema</button></footer>
  </section>;
}
