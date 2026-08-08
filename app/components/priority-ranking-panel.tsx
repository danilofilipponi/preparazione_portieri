"use client";

import type { PriorityRankingItem } from "../../lib/types";

const factorLabels: Record<string, string> = { weakness: "Carenza", maintenance: "Richiamo", trend: "Trend", rotation: "Rotazione", matchDay: "Match Day", continuity: "Continuità", season: "Stagione", recall: "Richiamo atletico", technical: "Compatibilità tecnica" };

export function PriorityRankingPanel({ title, eyebrow, ranking, selectedId, onSelect, accent = "technical" }: { title: string; eyebrow: string; ranking: PriorityRankingItem[]; selectedId: string | null; onSelect: (id: string) => void; accent?: "technical" | "physical" }) {
  return <section className={`ranking-panel ${accent}`}><div className="ranking-title"><div><span>{eyebrow}</span><h2>{title}</h2></div><small>Punteggio 0–100</small></div>
    {!ranking.length ? <p className="planner-empty">Genera la proposta per vedere priorità e motivazioni.</p> : <div className="ranking-list">{ranking.slice(0, 6).map((item, index) => <button type="button" key={item.id} className={`ranking-row ${selectedId === item.id ? "selected" : ""}`} onClick={() => onSelect(item.id)}>
      <span className="ranking-position">{index + 1}</span><span className="ranking-copy"><strong>{item.label}</strong><small>{item.reason} · valutati {item.assessed}/{item.selected}</small><span className="factor-chips">{Object.entries(item.factors).slice(0, 3).map(([key, value]) => <em key={key}>{factorLabels[key] ?? key} {Math.round(value)}</em>)}</span></span><span className="ranking-score">{Math.round(item.score)}</span>
    </button>)}</div>}
  </section>;
}
