"use client";

import { useMemo, useState } from "react";
import type { PhysicalObjective, PhysicalPriority, SeasonPhase } from "../../lib/types";

const macroAreaOrder = ["Forza", "Potenza", "Esplosività", "Velocità", "Agilità", "Reattività", "Pliometria", "Coordinazione", "Stabilità", "Mobilità", "Prevenzione", "Capacità metabolica"];
const seasonLabels: Record<SeasonPhase, string> = {
  precampionato: "Precampionato",
  periodo_competitivo: "Periodo competitivo",
  richiamo_mantenimento: "Richiamo / mantenimento",
  recupero_rigenerazione: "Recupero / rigenerazione",
};
const ratingWeight = { "Molto alta": 4, Alta: 3, Media: 2, Bassa: 1, "Non prevista": 0 } as const;

function PriorityBadge({ value }: { value: string }) {
  return <span className={`physical-priority priority-${value.toLowerCase().replaceAll(" ", "-")}`}>{value}</span>;
}

function SeasonGrid({ objective, activePhase }: { objective: PhysicalObjective; activePhase: SeasonPhase | "all" }) {
  return <div className="physical-season-grid">
    {(Object.keys(seasonLabels) as SeasonPhase[]).map(phase => <div className={activePhase === phase ? "active" : ""} key={phase}><span>{seasonLabels[phase]}</span><strong>{objective[phase]}</strong></div>)}
  </div>;
}

function PhysicalObjectiveCard({ objective, seasonPhase, onOpen }: { objective: PhysicalObjective; seasonPhase: SeasonPhase | "all"; onOpen: () => void }) {
  return <article className="physical-card">
    <div className="physical-card-head"><span className="physical-code">{objective.codice}</span><PriorityBadge value={objective.priorita_portiere} /></div>
    <span className="physical-area">{objective.macro_area}</span>
    <h3>{objective.obiettivo_fisico}</h3>
    <p>{objective.descrizione}</p>
    <SeasonGrid objective={objective} activePhase={seasonPhase} />
    <button className="physical-detail-button" onClick={onOpen}>Apri dettaglio <span>→</span></button>
  </article>;
}

function PhysicalObjectiveDetail({ objective, onClose }: { objective: PhysicalObjective; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><article className="modal physical-detail-modal" onClick={event => event.stopPropagation()}>
    <button className="modal-close" aria-label="Chiudi dettaglio" onClick={onClose}>×</button>
    <div className="physical-detail-head"><span className="physical-code">{objective.codice}</span><PriorityBadge value={objective.priorita_portiere} /></div>
    <span className="eyebrow">{objective.macro_area}</span><h2>{objective.obiettivo_fisico}</h2>
    <p className="physical-detail-description">{objective.descrizione}</p>
    <section className="physical-detail-section"><h3>Utilizzo nella stagione</h3><SeasonGrid objective={objective} activePhase="all" /></section>
    <div className="physical-detail-columns">
      <section><h3>Abbinamenti tecnici</h3><p>{objective.abbinamenti_tecnici}</p></section>
      <section><h3>Note di programmazione</h3><p>{objective.note_programmazione}</p></section>
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Chiudi</button></div>
  </article></div>;
}

export function PhysicalObjectivesPage({ objectives }: { objectives: PhysicalObjective[] }) {
  const [search, setSearch] = useState("");
  const [macroArea, setMacroArea] = useState("all");
  const [priority, setPriority] = useState<PhysicalPriority | "all">("all");
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | "all">("all");
  const [openObjective, setOpenObjective] = useState<PhysicalObjective | null>(null);
  const filtered = useMemo(() => objectives.filter(objective => {
    const term = search.trim().toLocaleLowerCase("it");
    const matchesSearch = !term || objective.obiettivo_fisico.toLocaleLowerCase("it").includes(term);
    const matchesArea = macroArea === "all" || objective.macro_area === macroArea;
    const matchesPriority = priority === "all" || objective.priorita_portiere === priority;
    const matchesSeason = seasonPhase === "all" || objective[seasonPhase] !== "Non prevista";
    return objective.attivo && matchesSearch && matchesArea && matchesPriority && matchesSeason;
  }).sort((a, b) => {
    if (seasonPhase !== "all") {
      const ratingDifference = ratingWeight[b[seasonPhase]] - ratingWeight[a[seasonPhase]];
      if (ratingDifference) return ratingDifference;
    }
    return a.codice.localeCompare(b.codice, "it");
  }), [objectives, search, macroArea, priority, seasonPhase]);

  const grouped = macroAreaOrder.map(area => ({ area, objectives: filtered.filter(objective => objective.macro_area === area) })).filter(group => group.objectives.length);
  const reset = () => { setSearch(""); setMacroArea("all"); setPriority("all"); setSeasonPhase("all"); };
  const hasFilters = Boolean(search) || macroArea !== "all" || priority !== "all" || seasonPhase !== "all";

  return <>
    <div className="page-head"><div><div className="eyebrow">Preparazione fisica</div><h1>Obiettivi fisici</h1><p className="subtitle">{filtered.length} obiettivi nella selezione corrente, organizzati per macro-area.</p></div></div>
    <section className="archive-filter-panel physical-filter-panel" aria-labelledby="physical-filters-title">
      <div className="archive-filter-head"><div className="archive-filter-heading"><span className="archive-filter-icon">⌕</span><div><h2 id="physical-filters-title">Cerca e filtra</h2><p>Trova l’obiettivo più adatto alla fase della stagione.</p></div></div>{hasFilters && <button className="filter-reset" onClick={reset}>Azzera filtri</button>}</div>
      <div className="filter-search-card"><label htmlFor="physical-search">Nome obiettivo</label><div className="search"><span>⌕</span><input id="physical-search" placeholder="Cerca un obiettivo fisico…" value={search} onChange={event => setSearch(event.target.value)} /></div></div>
      <div className="archive-filter-grid physical-filter-grid">
        <label className="filter-field"><span>Macro-area</span><select className="filter-select" value={macroArea} onChange={event => setMacroArea(event.target.value)}><option value="all">Tutte le macro-aree</option>{macroAreaOrder.map(area => <option key={area}>{area}</option>)}</select></label>
        <label className="filter-field"><span>Priorità portiere</span><select className="filter-select" value={priority} onChange={event => setPriority(event.target.value as PhysicalPriority | "all")}><option value="all">Tutte le priorità</option>{["Molto alta", "Alta", "Media", "Bassa"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="filter-field"><span>Fase della stagione</span><select className="filter-select" value={seasonPhase} onChange={event => setSeasonPhase(event.target.value as SeasonPhase | "all")}><option value="all">Tutte le fasi</option>{(Object.keys(seasonLabels) as SeasonPhase[]).map(phase => <option key={phase} value={phase}>{seasonLabels[phase]}</option>)}</select></label>
      </div>
    </section>
    {!grouped.length && <div className="empty-state"><div className="brand-mark">F</div><h2>Nessun obiettivo trovato</h2><p>Modifica i filtri per ampliare la ricerca.</p><button className="primary" onClick={reset}>Azzera filtri</button></div>}
    <div className="physical-groups">{grouped.map(group => <section className="physical-group" key={group.area}><div className="physical-group-head"><h2>{group.area}</h2><span>{group.objectives.length} obiettivi</span></div><div className="physical-grid">{group.objectives.map(objective => <PhysicalObjectiveCard key={objective.id} objective={objective} seasonPhase={seasonPhase} onOpen={() => setOpenObjective(objective)} />)}</div></section>)}</div>
    {openObjective && <PhysicalObjectiveDetail objective={openObjective} onClose={() => setOpenObjective(null)} />}
  </>;
}
