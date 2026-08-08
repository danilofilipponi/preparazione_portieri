"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExercisePhysicalObjective, ExercisePhysicalObjectiveRole, PhysicalObjective } from "../../lib/types";

export type PhysicalMappingDraft = {
  physical_objective_id: string;
  ruolo: ExercisePhysicalObjectiveRole;
  peso: 1 | 2 | 3 | 4 | 5;
  motivazione: string;
};

const roleOptions: ExercisePhysicalObjectiveRole[] = ["Principale", "Secondario", "Complementare"];
const roleOrder = { Principale: 0, Secondario: 1, Complementare: 2 } as const;

function MappingRow({ mapping, objectives, saving, onSave, onRemove }: {
  mapping: ExercisePhysicalObjective;
  objectives: PhysicalObjective[];
  saving: boolean;
  onSave: (draft: PhysicalMappingDraft) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PhysicalMappingDraft>({ physical_objective_id: mapping.physical_objective_id, ruolo: mapping.ruolo, peso: mapping.peso, motivazione: mapping.motivazione ?? "" });
  useEffect(() => setDraft({ physical_objective_id: mapping.physical_objective_id, ruolo: mapping.ruolo, peso: mapping.peso, motivazione: mapping.motivazione ?? "" }), [mapping.physical_objective_id, mapping.ruolo, mapping.peso, mapping.motivazione]);
  const objective = objectives.find(item => item.id === mapping.physical_objective_id) ?? mapping.physical_objective;
  return <div className="physical-mapping-row">
    <div className="physical-mapping-name"><span>{objective.codice} · {objective.macro_area}</span><strong>{objective.obiettivo_fisico}</strong></div>
    <label><span>Ruolo</span><select value={draft.ruolo} onChange={event => setDraft(current => ({ ...current, ruolo: event.target.value as ExercisePhysicalObjectiveRole }))}>{roleOptions.map(role => <option key={role}>{role}</option>)}</select></label>
    <label><span>Peso</span><select value={draft.peso} onChange={event => setDraft(current => ({ ...current, peso: Number(event.target.value) as PhysicalMappingDraft["peso"] }))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
    <label className="mapping-motivation"><span>Motivazione</span><textarea rows={2} value={draft.motivazione} onChange={event => setDraft(current => ({ ...current, motivazione: event.target.value }))} /></label>
    <div className="physical-mapping-actions"><button type="button" className="secondary" disabled={saving} onClick={() => onSave(draft)}>Aggiorna</button><button type="button" className="danger-link" disabled={saving} onClick={onRemove}>Rimuovi</button></div>
  </div>;
}

export function ExercisePhysicalObjectivesEditor({ mappings, objectives, busyId, onSave, onRemove }: {
  mappings: ExercisePhysicalObjective[];
  objectives: PhysicalObjective[];
  busyId: string | null;
  onSave: (draft: PhysicalMappingDraft) => Promise<void>;
  onRemove: (mapping: ExercisePhysicalObjective) => Promise<void>;
}) {
  const available = useMemo(() => objectives.filter(objective => !mappings.some(mapping => mapping.physical_objective_id === objective.id)), [mappings, objectives]);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<PhysicalMappingDraft>({ physical_objective_id: "", ruolo: "Complementare", peso: 3, motivazione: "" });
  const sorted = [...mappings].sort((a, b) => roleOrder[a.ruolo] - roleOrder[b.ruolo] || b.peso - a.peso);
  async function addMapping() {
    if (!newDraft.physical_objective_id) return;
    await onSave(newDraft);
    setAdding(false);
    setNewDraft({ physical_objective_id: "", ruolo: "Complementare", peso: 3, motivazione: "" });
  }
  return <section className="exercise-physical-editor field full">
    <div className="exercise-images-title"><span>Obiettivi fisici associati</span><button type="button" className="secondary compact-button" disabled={!available.length} onClick={() => setAdding(value => !value)}>+ Aggiungi obiettivo</button></div>
    <p className="mapping-editor-note">Il ruolo Principale è unico: impostandone uno nuovo, quello precedente diventa automaticamente Secondario.</p>
    {adding && <div className="physical-mapping-row new-mapping-row">
      <label className="mapping-objective-select"><span>Obiettivo fisico</span><select value={newDraft.physical_objective_id} onChange={event => setNewDraft(current => ({ ...current, physical_objective_id: event.target.value }))}><option value="">Seleziona…</option>{available.map(objective => <option key={objective.id} value={objective.id}>{objective.macro_area} &gt; {objective.obiettivo_fisico}</option>)}</select></label>
      <label><span>Ruolo</span><select value={newDraft.ruolo} onChange={event => setNewDraft(current => ({ ...current, ruolo: event.target.value as ExercisePhysicalObjectiveRole }))}>{roleOptions.map(role => <option key={role}>{role}</option>)}</select></label>
      <label><span>Peso</span><select value={newDraft.peso} onChange={event => setNewDraft(current => ({ ...current, peso: Number(event.target.value) as PhysicalMappingDraft["peso"] }))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>
      <label className="mapping-motivation"><span>Motivazione</span><textarea rows={2} value={newDraft.motivazione} onChange={event => setNewDraft(current => ({ ...current, motivazione: event.target.value }))} /></label>
      <div className="physical-mapping-actions"><button type="button" className="primary" disabled={!newDraft.physical_objective_id || busyId === "new"} onClick={addMapping}>Salva associazione</button><button type="button" className="secondary" onClick={() => setAdding(false)}>Annulla</button></div>
    </div>}
    {!sorted.length && !adding && <div className="mapping-empty">Nessun obiettivo fisico associato.</div>}
    <div className="physical-mapping-list">{sorted.map(mapping => <MappingRow key={mapping.id} mapping={mapping} objectives={objectives} saving={busyId === mapping.id} onSave={onSave} onRemove={() => onRemove(mapping)} />)}</div>
  </section>;
}
