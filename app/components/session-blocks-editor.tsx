"use client";

import type { SessionBlock } from "../../lib/types";

export function SessionBlocksEditor({ blocks, duration, onChange }: { blocks: SessionBlock[]; duration: number; onChange: (blocks: SessionBlock[]) => void }) {
  const total = blocks.reduce((sum, item) => sum + item.durata_target, 0);
  const update = (index: number, patch: Partial<SessionBlock>) => onChange(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <section className="planner-section"><div className="planner-section-head"><div><span>5</span><h2>Struttura della seduta</h2></div><small className={total === duration ? "total-ok" : "total-warning"}>{total}/{duration} min</small></div>
    {!blocks.length ? <p className="planner-empty">I quattro blocchi verranno creati dopo il calcolo delle priorità.</p> : <div className="block-grid">{blocks.map((block, index) => <article className="session-block-card" key={block.ordine}>
      <div className="block-letter">{String.fromCharCode(65 + index)}</div><div className="block-main"><strong>{block.tipo_blocco}</strong><small>{block.fase_metodologica_preferita} · Carico {block.carico_target}</small><textarea value={block.notes ?? ""} placeholder="Nota facoltativa sul blocco" onChange={event => update(index, { notes: event.target.value || null })} /></div><label><span>Minuti</span><input type="number" min="5" step="5" value={block.durata_target} onChange={event => update(index, { durata_target: Math.max(5, Number(event.target.value)) })} /></label>
    </article>)}</div>}
  </section>;
}
