"use client";

import type { Goalkeeper } from "../../lib/types";

export function GoalkeeperPresencePicker({ goalkeepers, selectedIds, onChange }: { goalkeepers: Goalkeeper[]; selectedIds: string[]; onChange: (ids: string[]) => void }) {
  const active = goalkeepers.filter(item => item.attivo);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]);
  return <section className="planner-section"><div className="planner-section-head"><div><span>2</span><h2>Portieri presenti</h2></div><small>{selectedIds.length} selezionati</small></div>
    {!active.length ? <p className="planner-empty">Aggiungi i portieri nell’area Valutazione portieri per usare le priorità individuali.</p> : <div className="presence-grid">{active.map(goalkeeper => {
      const selected = selectedIds.includes(goalkeeper.id); const latest = goalkeeper.assessments?.[0];
      return <button type="button" key={goalkeeper.id} className={`presence-card ${selected ? "selected" : ""}`} onClick={() => toggle(goalkeeper.id)} aria-pressed={selected}>
        <span className="presence-check">{selected ? "✓" : "+"}</span><strong>{goalkeeper.nome} {goalkeeper.cognome}</strong><small>{latest ? `Valutato il ${new Date(`${latest.data_valutazione}T12:00:00`).toLocaleDateString("it-IT")}` : "Nessuna valutazione"}</small>
      </button>;
    })}</div>}
  </section>;
}
