"use client";

import { useMemo, useState } from "react";
import { assessmentAgeDays, assessmentAverage, assessmentBand, formatAssessmentScore } from "../../lib/goalkeeper-priorities";
import type { ExerciseCategory, Goalkeeper, GoalkeeperAssessment, GoalkeeperAssessmentItemType, PhysicalAssessmentDimension } from "../../lib/types";
import type { GoalkeeperEvaluationHistorySession } from "../../lib/evaluation-history";
import { GoalkeeperEvaluationHistory } from "./goalkeeper-evaluation-history";

export type GoalkeeperDraft = { nome: string; cognome: string; data_nascita: string | null; note: string | null; attivo: boolean };
export type AssessmentItemDraft = { tipo: GoalkeeperAssessmentItemType; exercise_category_id: number | null; physical_dimension_id: string | null; score: number; nota: string | null };
export type GoalkeeperAssessmentDraft = { data_valutazione: string; note_generali: string | null; items: AssessmentItemDraft[] };

type Props = {
  goalkeepers: Goalkeeper[];
  categories: ExerciseCategory[];
  physicalDimensions: PhysicalAssessmentDimension[];
  evaluationHistory: GoalkeeperEvaluationHistorySession[];
  onOpenEvaluationResults: (sessionId: string) => void;
  onCreateEvaluation: () => void;
  onReassess: (sessionId: string) => void;
  onSaveGoalkeeper: (draft: GoalkeeperDraft, id?: string) => Promise<boolean>;
  onDeactivate: (goalkeeper: Goalkeeper) => Promise<void>;
  onSaveAssessment: (goalkeeper: Goalkeeper, draft: GoalkeeperAssessmentDraft) => Promise<boolean>;
};

function latestAssessment(goalkeeper: Goalkeeper) { return goalkeeper.assessments[0] ?? null; }
function formattedDate(value: string) { return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function localDateKey() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function averageLabel(value: number | null) { return value === null ? "—" : formatAssessmentScore(value); }

function AssessmentStatus({ assessment }: { assessment: GoalkeeperAssessment | null }) {
  if (!assessment) return <span className="assessment-status never">Mai valutato</span>;
  const age = assessmentAgeDays(assessment.data_valutazione);
  return <span className={`assessment-status ${age <= 30 ? "current" : "expired"}`}>{age <= 30 ? "Aggiornata" : "Da aggiornare"}</span>;
}

export function GoalkeepersPage({ goalkeepers, categories, physicalDimensions, evaluationHistory, onOpenEvaluationResults, onCreateEvaluation, onReassess, onSaveGoalkeeper, onDeactivate, onSaveAssessment }: Props) {
  const [formGoalkeeper, setFormGoalkeeper] = useState<Goalkeeper | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assessmentGoalkeeperId, setAssessmentGoalkeeperId] = useState<string | null>(null);
  const selected = goalkeepers.find(item => item.id === selectedId) ?? null;
  const assessmentGoalkeeper = goalkeepers.find(item => item.id === assessmentGoalkeeperId) ?? null;
  const active = goalkeepers.filter(item => item.attivo);

  return <>
    <div className="page-head"><div><div className="eyebrow">Squadra</div><h1>Portieri</h1><p className="subtitle">Anagrafica, valutazioni periodiche e priorità di allenamento.</p></div><button className="primary" onClick={() => setFormGoalkeeper("new")}>+ Nuovo portiere</button></div>
    {!active.length ? <div className="empty-state"><div className="brand-mark">P</div><h2>Nessun portiere inserito</h2><p>Aggiungi il primo portiere per iniziare le valutazioni.</p><button onClick={() => setFormGoalkeeper("new")}>Aggiungi portiere</button></div> : <div className="goalkeeper-grid">{active.map(goalkeeper => {
      const latest = latestAssessment(goalkeeper); const technical = assessmentAverage(latest, "Tecnica"); const physical = assessmentAverage(latest, "Fisica");
      return <article className="goalkeeper-card" key={goalkeeper.id}><button className="goalkeeper-card-main" onClick={() => setSelectedId(goalkeeper.id)}><div className="goalkeeper-avatar">{goalkeeper.nome[0]}{goalkeeper.cognome[0]}</div><div className="goalkeeper-card-title"><span>Portiere</span><h2>{goalkeeper.nome} {goalkeeper.cognome}</h2><AssessmentStatus assessment={latest} /></div><div className="goalkeeper-card-stats"><div><small>Ultima valutazione</small><strong>{latest ? formattedDate(latest.data_valutazione) : "Nessuna"}</strong></div><div><small>Media tecnica</small><strong>{averageLabel(technical)}</strong></div><div><small>Media fisica</small><strong>{averageLabel(physical)}</strong></div></div></button><div className="goalkeeper-card-actions"><button className="secondary" onClick={() => setSelectedId(goalkeeper.id)}>Apri scheda</button><button onClick={() => setAssessmentGoalkeeperId(goalkeeper.id)}>Nuova valutazione</button></div></article>;
    })}</div>}
    {formGoalkeeper && <GoalkeeperFormModal goalkeeper={formGoalkeeper === "new" ? null : formGoalkeeper} onClose={() => setFormGoalkeeper(null)} onSave={async (draft, id) => { const saved = await onSaveGoalkeeper(draft, id); if (saved) setFormGoalkeeper(null); return saved; }} />}
    {selected && <GoalkeeperDetail goalkeeper={selected} evaluationHistory={evaluationHistory.filter(session => session.goalkeeperId === selected.id)} onOpenEvaluationResults={sessionId => { setSelectedId(null); onOpenEvaluationResults(sessionId); }} onCreateEvaluation={() => { setSelectedId(null); onCreateEvaluation(); }} onReassess={sessionId => { setSelectedId(null); onReassess(sessionId); }} onClose={() => setSelectedId(null)} onEdit={() => setFormGoalkeeper(selected)} onDeactivate={() => onDeactivate(selected)} onNewAssessment={() => setAssessmentGoalkeeperId(selected.id)} />}
    {assessmentGoalkeeper && <AssessmentForm goalkeeper={assessmentGoalkeeper} categories={categories.filter(item => item.attivo && item.nome !== "Tema libero")} physicalDimensions={physicalDimensions.filter(item => item.attivo).sort((a, b) => a.ordine - b.ordine)} onClose={() => setAssessmentGoalkeeperId(null)} onSave={async draft => { const saved = await onSaveAssessment(assessmentGoalkeeper, draft); if (saved) setAssessmentGoalkeeperId(null); return saved; }} />}
  </>;
}

function GoalkeeperFormModal({ goalkeeper, onClose, onSave }: { goalkeeper: Goalkeeper | null; onClose: () => void; onSave: (draft: GoalkeeperDraft, id?: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<GoalkeeperDraft>({ nome: goalkeeper?.nome ?? "", cognome: goalkeeper?.cognome ?? "", data_nascita: goalkeeper?.data_nascita ?? null, note: goalkeeper?.note ?? null, attivo: goalkeeper?.attivo ?? true });
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); await onSave(draft, goalkeeper?.id); setSaving(false); }
  return <div className="modal-backdrop" onClick={onClose}><form className="modal goalkeeper-form-modal" onSubmit={submit} onClick={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Anagrafica</span><h2>{goalkeeper ? "Modifica portiere" : "Nuovo portiere"}</h2><div className="form-grid modal-form"><div className="field"><label>Nome</label><input required value={draft.nome} onChange={event => setDraft(current => ({ ...current, nome: event.target.value }))} /></div><div className="field"><label>Cognome</label><input required value={draft.cognome} onChange={event => setDraft(current => ({ ...current, cognome: event.target.value }))} /></div><div className="field"><label>Data di nascita</label><input type="date" value={draft.data_nascita ?? ""} onChange={event => setDraft(current => ({ ...current, data_nascita: event.target.value || null }))} /></div><div className="field full"><label>Note</label><textarea rows={4} value={draft.note ?? ""} onChange={event => setDraft(current => ({ ...current, note: event.target.value || null }))} /></div></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button disabled={saving}>{saving ? "Salvataggio…" : "Salva portiere"}</button></div></form></div>;
}

function GoalkeeperDetail({ goalkeeper, evaluationHistory, onOpenEvaluationResults, onCreateEvaluation, onReassess, onClose, onEdit, onDeactivate, onNewAssessment }: { goalkeeper: Goalkeeper; evaluationHistory: GoalkeeperEvaluationHistorySession[]; onOpenEvaluationResults: (sessionId: string) => void; onCreateEvaluation: () => void; onReassess: (sessionId: string) => void; onClose: () => void; onEdit: () => void; onDeactivate: () => void; onNewAssessment: () => void }) {
  const latest = goalkeeper.assessments[0] ?? null; const previous = goalkeeper.assessments[1] ?? null; const age = latest ? assessmentAgeDays(latest.data_valutazione) : null;
  const latestItems = latest?.items ?? []; const weaknesses = latestItems.filter(item => Number(item.score) < 6.5).sort((a, b) => Number(a.score) - Number(b.score)); const strengths = latestItems.filter(item => Number(item.score) >= 9).sort((a, b) => Number(b.score) - Number(a.score));
  const label = (item: GoalkeeperAssessment["items"][number]) => item.tipo === "Tecnica" ? item.category?.nome : item.physical_dimension?.nome;
  const previousScore = (item: GoalkeeperAssessment["items"][number]) => previous?.items.find(old => old.tipo === item.tipo && old.exercise_category_id === item.exercise_category_id && old.physical_dimension_id === item.physical_dimension_id)?.score;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal goalkeeper-detail-modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><div className="goalkeeper-detail-head"><div className="goalkeeper-avatar large">{goalkeeper.nome[0]}{goalkeeper.cognome[0]}</div><div><span className="eyebrow">Scheda portiere</span><h2>{goalkeeper.nome} {goalkeeper.cognome}</h2><p>{goalkeeper.data_nascita ? `Nato il ${formattedDate(goalkeeper.data_nascita)}` : "Data di nascita non indicata"}</p></div></div><div className="goalkeeper-detail-actions"><button className="secondary" onClick={onEdit}>Modifica</button><button onClick={onNewAssessment}>+ Nuova valutazione</button><button className="danger-link" onClick={onDeactivate}>Disattiva</button></div>
    <GoalkeeperEvaluationHistory sessions={evaluationHistory} onOpenResults={onOpenEvaluationResults} onCreateEvaluation={onCreateEvaluation} onReassess={onReassess} />
    <section className="assessment-overview"><div><small>Ultima valutazione periodica</small><strong>{latest ? formattedDate(latest.data_valutazione) : "Nessuna"}</strong></div><div><small>Giorni trascorsi</small><strong>{age ?? "—"}</strong></div><div><small>Stato</small><AssessmentStatus assessment={latest} /></div><div><small>Media tecnica legacy</small><strong>{averageLabel(assessmentAverage(latest, "Tecnica"))}</strong></div><div><small>Media fisica legacy</small><strong>{averageLabel(assessmentAverage(latest, "Fisica"))}</strong></div></section>
    {!latest ? <div className="assessment-empty"><h3>Prima valutazione da compilare</h3><p>Il portiere può comunque partecipare alle sedute senza alcun blocco.</p><button onClick={onNewAssessment}>Nuova valutazione</button></div> : <><div className="goalkeeper-insight-grid"><InsightList title="Carenze principali" items={weaknesses} label={label} /><InsightList title="Punti di forza" items={strengths} label={label} positive /></div><AssessmentSection title="Area tecnica" items={latestItems.filter(item => item.tipo === "Tecnica")} label={label} previousScore={previousScore} /><AssessmentSection title="Area fisica" items={latestItems.filter(item => item.tipo === "Fisica")} label={label} previousScore={previousScore} /><AssessmentHistory assessments={goalkeeper.assessments} /></>}
    {goalkeeper.note && <section className="goalkeeper-notes"><h3>Note anagrafiche</h3><p>{goalkeeper.note}</p></section>}<div className="modal-actions"><button className="secondary" onClick={onClose}>Chiudi</button></div></div></div>;
}

function InsightList({ title, items, label, positive = false }: { title: string; items: GoalkeeperAssessment["items"]; label: (item: GoalkeeperAssessment["items"][number]) => string | undefined; positive?: boolean }) {
  return <section className={`goalkeeper-insight ${positive ? "positive" : "weak"}`}><h3>{title}</h3>{items.length ? items.slice(0, 5).map(item => <div key={item.id}><span>{label(item)}</span><strong>{formatAssessmentScore(Number(item.score))}</strong></div>) : <p>{positive ? "Nessun punteggio sopra 9,0." : "Nessuna area sotto 6,5."}</p>}</section>;
}

function AssessmentSection({ title, items, label, previousScore }: { title: string; items: GoalkeeperAssessment["items"]; label: (item: GoalkeeperAssessment["items"][number]) => string | undefined; previousScore: (item: GoalkeeperAssessment["items"][number]) => number | undefined }) {
  return <section className="assessment-section"><h3>{title}</h3><div className="assessment-result-list">{items.map(item => { const previous = previousScore(item); const delta = previous === undefined ? null : Number(item.score) - Number(previous); return <article key={item.id}><div><strong>{label(item)}</strong>{item.nota && <p>{item.nota}</p>}</div><div className="assessment-result-score"><span className={`score-band band-${assessmentBand(Number(item.score)).toLowerCase().replaceAll(" ", "-")}`}>{formatAssessmentScore(Number(item.score))}</span>{delta !== null && <small className={delta >= 0 ? "delta-up" : "delta-down"}>{delta >= 0 ? "+" : ""}{formatAssessmentScore(delta)}</small>}</div></article>; })}</div></section>;
}

function AssessmentHistory({ assessments }: { assessments: GoalkeeperAssessment[] }) {
  const recent = assessments.slice(0, 4); const keys = new Map<string, string>();
  for (const assessment of recent) for (const item of assessment.items) keys.set(item.tipo === "Tecnica" ? `T:${item.exercise_category_id}` : `F:${item.physical_dimension_id}`, item.tipo === "Tecnica" ? item.category?.nome ?? "Tecnica" : item.physical_dimension?.nome ?? "Fisica");
  return <section className="assessment-history"><h3>Storico valutazioni periodiche legacy</h3><div className="assessment-history-scroll"><table><thead><tr><th>Parametro</th>{recent.map(item => <th key={item.id}>{formattedDate(item.data_valutazione)}</th>)}</tr></thead><tbody>{Array.from(keys.entries()).map(([key, name]) => <tr key={key}><th>{name}</th>{recent.map(assessment => { const item = assessment.items.find(entry => key === (entry.tipo === "Tecnica" ? `T:${entry.exercise_category_id}` : `F:${entry.physical_dimension_id}`)); return <td key={assessment.id}>{item ? formatAssessmentScore(Number(item.score)) : "—"}</td>; })}</tr>)}</tbody></table></div></section>;
}

function AssessmentForm({ goalkeeper, categories, physicalDimensions, onClose, onSave }: { goalkeeper: Goalkeeper; categories: ExerciseCategory[]; physicalDimensions: PhysicalAssessmentDimension[]; onClose: () => void; onSave: (draft: GoalkeeperAssessmentDraft) => Promise<boolean> }) {
  const initialItems = useMemo<AssessmentItemDraft[]>(() => [...categories.map(category => ({ tipo: "Tecnica" as const, exercise_category_id: category.id, physical_dimension_id: null, score: 6.5, nota: null })), ...physicalDimensions.map(dimension => ({ tipo: "Fisica" as const, exercise_category_id: null, physical_dimension_id: dimension.id, score: 6.5, nota: null }))], [categories, physicalDimensions]);
  const [items, setItems] = useState(initialItems); const [date, setDate] = useState(localDateKey); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  const setItem = (index: number, values: Partial<AssessmentItemDraft>) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));
  const itemName = (item: AssessmentItemDraft) => item.tipo === "Tecnica" ? categories.find(category => category.id === item.exercise_category_id)?.nome : physicalDimensions.find(dimension => dimension.id === item.physical_dimension_id)?.nome;
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); await onSave({ data_valutazione: date, note_generali: notes || null, items }); setSaving(false); }
  return <div className="modal-backdrop" onClick={onClose}><form className="modal assessment-form-modal" onSubmit={submit} onClick={event => event.stopPropagation()}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Nuova valutazione</span><h2>{goalkeeper.nome} {goalkeeper.cognome}</h2><div className="assessment-form-head"><div className="field"><label>Data valutazione</label><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></div><div className="field"><label>Note generali</label><input placeholder="Osservazioni complessive facoltative" value={notes} onChange={event => setNotes(event.target.value)} /></div></div>{(["Tecnica", "Fisica"] as const).map(type => <section className="assessment-input-section" key={type}><h3>Area {type.toLowerCase()}</h3><p>{type === "Tecnica" ? "Categorie ufficiali del catalogo, escluso Tema libero." : "Macro-voci collegate ai 52 obiettivi FIS."}</p><div className="assessment-input-list">{items.map((item, index) => item.tipo === type && <article key={`${type}-${item.exercise_category_id ?? item.physical_dimension_id}`}><div className="assessment-input-name"><strong>{itemName(item)}</strong><span className={`score-band band-${assessmentBand(item.score).toLowerCase().replaceAll(" ", "-")}`}>{assessmentBand(item.score)}</span></div><div className="assessment-score-control"><input aria-label={`Punteggio ${itemName(item)}`} type="number" min="0" max="10" step="0.1" value={item.score} onChange={event => setItem(index, { score: Math.min(10, Math.max(0, Number(event.target.value))) })} /><input aria-label={`Slider ${itemName(item)}`} type="range" min="0" max="10" step="0.1" value={item.score} onChange={event => setItem(index, { score: Number(event.target.value) })} /><output>{formatAssessmentScore(item.score)}</output></div><input className="assessment-item-note" placeholder="Nota facoltativa per questa voce" value={item.nota ?? ""} onChange={event => setItem(index, { nota: event.target.value || null })} /></article>)}</div></section>)}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button disabled={saving}>{saving ? "Salvataggio…" : "Salva valutazione"}</button></div></form></div>;
}
