"use client";

import type { Exercise } from "../../lib/types";

const physicalRoleOrder = { Principale: 0, Secondario: 1, Complementare: 2 } as const;

type ExerciseCardProps = {
  exercise: Exercise;
  onOpen: (exercise: Exercise) => void;
  onEdit: (exercise: Exercise) => void;
  onDeactivate: (exercise: Exercise) => void;
  showActions?: boolean;
  variant?: "compact" | "detail";
};

function MediaPanel({ url, label, kind }: { url: string | null; label: string; kind: "schema" | "foto" }) {
  if (url) return <div className={`manual-media ${kind}`}><img src={url} alt={`${label} dell’esercizio`} loading="lazy" /></div>;
  return <div className={`manual-media manual-placeholder ${kind}`}><span>{kind === "schema" ? "⌗" : "◉"}</span><strong>{label}</strong><small>Immagine non disponibile</small></div>;
}

function BulletList({ value, fallback }: { value: string; fallback: string }) {
  const items = (value || fallback).split(/[;\n]+/).map(item => item.trim()).filter(Boolean);
  return <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
}

function Fact({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return <div className="manual-fact"><span className="manual-fact-icon">{icon}</span><div><small>{label}</small><strong>{children}</strong></div></div>;
}

function PhysicalComponents({ exercise }: { exercise: Exercise }) {
  const mappings = [...(exercise.physical_mappings ?? [])].filter(mapping => mapping.attivo).sort((a, b) => physicalRoleOrder[a.ruolo] - physicalRoleOrder[b.ruolo] || b.peso - a.peso);
  if (!mappings.length) return null;
  return <section className="manual-physical-components">
    <div className="manual-physical-title"><span>◇</span><div><h3>Componenti fisiche</h3><p>Compatibilità dell’esercizio con gli obiettivi della preparazione fisica.</p></div></div>
    <div className="manual-physical-list">{mappings.map(mapping => <article className={`manual-physical-item role-${mapping.ruolo.toLowerCase()}`} key={mapping.id}>
      <div className="manual-physical-role">{mapping.ruolo}</div>
      <div className="manual-physical-name"><span>{mapping.physical_objective.macro_area}</span><strong>{mapping.physical_objective.obiettivo_fisico}</strong><small>{mapping.physical_objective.codice}</small></div>
      <div className="manual-physical-weight" aria-label={`Compatibilità ${mapping.peso} su 5`}><strong>{"★".repeat(mapping.peso)}<i>{"☆".repeat(5 - mapping.peso)}</i></strong><span>{mapping.peso}/5</span></div>
      {mapping.motivazione && <p>{mapping.motivazione}</p>}
    </article>)}</div>
  </section>;
}

export function ExerciseCard({ exercise, onOpen, onEdit, onDeactivate, showActions = true, variant = "compact" }: ExerciseCardProps) {
  const procedureSteps = [exercise.schema_step_1, exercise.schema_step_2, exercise.schema_step_3, exercise.schema_step_4, exercise.schema_step_5, exercise.schema_step_6].filter((step): step is string => Boolean(step));
  const phase = exercise.fase || "Analitico";
  const phaseClass = phase.toLowerCase();

  if (variant === "compact") return <article className="technical-card catalog-card">
    <div className="catalog-card-visual">
      <MediaPanel url={exercise.schema_url} label="Schema tecnico" kind="schema" />
      <span className={`phase-pill ${phaseClass}`}>{phase}</span>
    </div>
    <div className="catalog-card-body">
      <div className="catalog-card-title"><span className="code-badge">{exercise.codice}</span><h2>{exercise.nome}</h2></div>
      <p className="catalog-category">{exercise.categoria}</p>
      <p className="catalog-subcategory">{exercise.sottocategoria}</p>
      <p className="catalog-objective"><b>Obiettivo</b>{exercise.obiettivo}</p>
      {procedureSteps.length > 0 && <div className="catalog-steps"><b>Svolgimento</b>{procedureSteps.map((step, index) => <span key={`${exercise.codice}-step-${index + 1}`}><i>{index + 1}</i>{step}</span>)}</div>}
      <div className="catalog-card-facts"><span>♙ <b>{exercise.portieri_min}–{exercise.portieri_max}</b></span><span>◷ <b>{exercise.durata_min} min</b></span><span className="catalog-stars">{"★".repeat(exercise.difficolta)}{"☆".repeat(4 - exercise.difficolta)}</span></div>
      {showActions && <footer className="technical-actions manual-actions"><button className="secondary" onClick={() => onOpen(exercise)}>Apri scheda</button><button className="secondary" onClick={() => onEdit(exercise)}>Modifica</button><button className="danger-link" onClick={() => onDeactivate(exercise)}>Disattiva</button></footer>}
    </div>
  </article>;

  return <article className="technical-card manual-sheet">
    <header className="manual-head">
      <div className="manual-title-row"><span className="code-badge">{exercise.codice}</span><h2>{exercise.nome}</h2></div>
      <div className="manual-taxonomy">
        <span><b>Categoria:</b> {exercise.categoria}</span>
        <span><b>Sottocategoria:</b> {exercise.sottocategoria}</span>
        <span className={`phase-pill ${phaseClass}`}>{phase}</span>
      </div>
    </header>

    <section className="manual-visual-section">
      <div className="manual-media-split schema-only">
        <div className="manual-media-column"><div className="manual-section-label">Schema tecnico</div><MediaPanel url={exercise.schema_url} label="Schema tecnico" kind="schema" /></div>
      </div>
      <div className="manual-legend"><h3>Descrizione</h3><p>{exercise.descrizione}</p></div>
      {procedureSteps.length > 0 && <div className="manual-procedure"><h3>Svolgimento</h3><ol>{procedureSteps.map((step, index) => <li key={`${exercise.codice}-detail-step-${index + 1}`}>{step}</li>)}</ol></div>}
    </section>

    <section className="manual-facts">
      <Fact icon="♟" label="Portieri">{exercise.portieri_min}–{exercise.portieri_max}</Fact>
      <Fact icon="◷" label="Durata">{exercise.durata_min} min</Fact>
      <Fact icon="△" label="Materiale">{exercise.materiale}</Fact>
    </section>

    <section className="manual-info-grid">
      <div><h3><span>◎</span> Obiettivo</h3><p>{exercise.obiettivo}</p></div>
      <div><h3><span>⟳</span> Variante</h3><p>{exercise.variante || "Nessuna variante indicata."}</p></div>
      <div><h3><span>✓</span> Coaching points</h3><BulletList value={exercise.coaching_points} fallback="Da completare." /></div>
      <div className="manual-errors"><h3><span>⚠</span> Errori comuni</h3><BulletList value={exercise.errori_comuni} fallback="Da completare." /></div>
    </section>

    <PhysicalComponents exercise={exercise} />

    <section className="manual-bottom performance-only">
      <div className="manual-performance">
        <Fact icon="▥" label="Intensità">{exercise.intensita}</Fact>
        <div className="manual-rating"><small>Difficoltà</small><strong>{"★".repeat(exercise.difficolta)}<i>{"☆".repeat(4 - exercise.difficolta)}</i></strong></div>
        <Fact icon="♙" label="Portieri">{exercise.portieri_min}–{exercise.portieri_max}</Fact>
      </div>
    </section>

    {showActions && <footer className="technical-actions manual-actions"><button className="secondary" onClick={() => onOpen(exercise)}>Apri scheda</button><button className="secondary" onClick={() => onEdit(exercise)}>Modifica</button><button className="danger-link" onClick={() => onDeactivate(exercise)}>Disattiva</button></footer>}
  </article>;
}
