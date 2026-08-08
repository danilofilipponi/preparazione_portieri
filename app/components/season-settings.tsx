"use client";

import { useState } from "react";
import type { AppSettings, CalendarDayType, CalendarException, MatchType, Season, SeasonMatch, SeasonPhaseConfig, SeasonRecallPeriod, SeasonTrainingProfile } from "../../lib/types";
import { defaultSeasonConfiguration, weekDays } from "../../lib/season-calendar";

export type SeasonConfiguration = {
  season: Omit<Season, "id"> & { id?: string };
  phases: Array<Omit<SeasonPhaseConfig, "id" | "season_id"> & { id?: string }>;
  recall: Omit<SeasonRecallPeriod, "id" | "season_id"> & { id?: string };
  profiles: Array<Omit<SeasonTrainingProfile, "id" | "season_id"> & { id?: string }>;
};

type Props = {
  settings: AppSettings;
  season: Season | null;
  phases: SeasonPhaseConfig[];
  recall: SeasonRecallPeriod | null;
  profiles: SeasonTrainingProfile[];
  matches: SeasonMatch[];
  exceptions: CalendarException[];
  busy: boolean;
  onClose: () => void;
  onSave: (configuration: SeasonConfiguration) => Promise<string | null>;
  onGenerate: (seasonId?: string) => Promise<void>;
  onSaveMatch: (match: Partial<SeasonMatch> & Pick<SeasonMatch, "data" | "tipo">) => Promise<void>;
  onDeleteMatch: (match: SeasonMatch) => Promise<void>;
  onSaveException: (exception: Partial<CalendarException> & Pick<CalendarException, "data" | "tipo_giornata">) => Promise<void>;
  onDeleteException: (exception: CalendarException) => Promise<void>;
};

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  const toggle = (day: number) => onChange(value.includes(day) ? value.filter(item => item !== day) : [...value, day].sort());
  return <div className="weekday-picker">{weekDays.map(day => <button key={day.value} type="button" className={value.includes(day.value) ? "selected" : ""} onClick={() => toggle(day.value)}>{day.short}</button>)}</div>;
}

export function SeasonSettings({ settings, season, phases, recall, profiles, matches, exceptions, busy, onClose, onSave, onGenerate, onSaveMatch, onDeleteMatch, onSaveException, onDeleteException }: Props) {
  const defaults = defaultSeasonConfiguration(settings);
  const [seasonDraft, setSeasonDraft] = useState<SeasonConfiguration["season"]>(season ?? defaults.season);
  const [phaseDrafts, setPhaseDrafts] = useState<SeasonConfiguration["phases"]>(defaults.phases.map(defaultPhase => {
    const current = phases.find(item => item.tipo === defaultPhase.tipo);
    return current ?? defaultPhase;
  }));
  const [recallDraft, setRecallDraft] = useState<SeasonConfiguration["recall"]>(recall ?? defaults.recall);
  const [profileDrafts, setProfileDrafts] = useState<SeasonConfiguration["profiles"]>(defaults.profiles.map(defaultProfile => profiles.find(item => item.match_day_offset === defaultProfile.match_day_offset) ?? defaultProfile));
  const [matchDraft, setMatchDraft] = useState({ data: "", tipo: "Campionato" as MatchType, avversario: "", casa_trasferta: "" as "" | "Casa" | "Trasferta", note: "" });
  const [exceptionDraft, setExceptionDraft] = useState({ data: "", tipo_giornata: "Riposo" as CalendarDayType, note: "" });

  const setSeason = <K extends keyof SeasonConfiguration["season"]>(key: K, value: SeasonConfiguration["season"][K]) => setSeasonDraft(current => ({ ...current, [key]: value }));
  const setPhase = <K extends keyof SeasonConfiguration["phases"][number]>(index: number, key: K, value: SeasonConfiguration["phases"][number][K]) => setPhaseDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  const setRecall = <K extends keyof SeasonConfiguration["recall"]>(key: K, value: SeasonConfiguration["recall"][K]) => setRecallDraft(current => ({ ...current, [key]: value }));
  const setProfile = <K extends keyof SeasonConfiguration["profiles"][number]>(index: number, key: K, value: SeasonConfiguration["profiles"][number][K]) => setProfileDrafts(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await onSave({ season: seasonDraft, phases: phaseDrafts, recall: recallDraft, profiles: profileDrafts });
  }

  async function saveAndGenerate() {
    const seasonId = await onSave({ season: seasonDraft, phases: phaseDrafts, recall: recallDraft, profiles: profileDrafts });
    if (seasonId) await onGenerate(seasonId);
  }

  async function addMatch() {
    if (!matchDraft.data) return;
    await onSaveMatch({ data: matchDraft.data, tipo: matchDraft.tipo, avversario: matchDraft.avversario || null, casa_trasferta: matchDraft.casa_trasferta || null, note: matchDraft.note || null });
    setMatchDraft({ data: "", tipo: "Campionato", avversario: "", casa_trasferta: "", note: "" });
  }

  async function addException() {
    if (!exceptionDraft.data) return;
    await onSaveException({ data: exceptionDraft.data, tipo_giornata: exceptionDraft.tipo_giornata, note: exceptionDraft.note || null });
    setExceptionDraft({ data: "", tipo_giornata: "Riposo", note: "" });
  }

  return <div className="season-settings-page">
    <div className="season-settings-head"><div><span className="eyebrow">Pianificazione annuale</span><h1>Impostazioni stagione</h1><p>Stagione attiva: <strong>{seasonDraft.nome_stagione}</strong></p></div><button type="button" className="secondary" onClick={onClose}>Torna all’agenda</button></div>
    <form onSubmit={submit}>
      <section className="season-setting-card"><h2>Dati stagione</h2><div className="form-grid"><div className="field"><label>Nome stagione</label><input required value={seasonDraft.nome_stagione} onChange={event => setSeason("nome_stagione", event.target.value)} /></div><div className="field"><label>Squadra</label><input required value={seasonDraft.squadra} onChange={event => setSeason("squadra", event.target.value)} /></div><div className="field"><label>Data inizio</label><input required type="date" value={seasonDraft.data_inizio} onChange={event => setSeason("data_inizio", event.target.value)} /></div><div className="field"><label>Data fine</label><input required type="date" value={seasonDraft.data_fine} onChange={event => setSeason("data_fine", event.target.value)} /></div><div className="field"><label>Portieri standard</label><input required min="1" type="number" value={seasonDraft.numero_portieri_standard} onChange={event => setSeason("numero_portieri_standard", Number(event.target.value))} /></div></div></section>

      {phaseDrafts.map((phase, index) => <section className="season-setting-card" key={phase.tipo}><h2>{phase.tipo}</h2><div className="form-grid"><div className="field"><label>Data inizio</label><input type="date" value={phase.data_inizio} onChange={event => setPhase(index, "data_inizio", event.target.value)} /></div><div className="field"><label>Data fine</label><input type="date" value={phase.data_fine} onChange={event => setPhase(index, "data_fine", event.target.value)} /></div><div className="field full"><label>Giorni di allenamento</label><WeekdayPicker value={phase.giorni_standard_allenamento} onChange={value => setPhase(index, "giorni_standard_allenamento", value)} /></div><div className="field full"><label>Giorni di riposo</label><WeekdayPicker value={phase.giorni_riposo} onChange={value => setPhase(index, "giorni_riposo", value)} /></div><div className="field"><label>Durata standard</label><input min="1" type="number" value={phase.durata_standard_seduta} onChange={event => setPhase(index, "durata_standard_seduta", Number(event.target.value))} /></div>{phase.tipo === "Campionato" && <div className="field"><label>Giorno gara standard</label><select value={phase.giorno_gara_standard ?? ""} onChange={event => setPhase(index, "giorno_gara_standard", event.target.value ? Number(event.target.value) : null)}><option value="">Nessuno</option>{weekDays.map(day => <option value={day.value} key={day.value}>{day.label}</option>)}</select></div>}<div className="field full checkbox-field"><label><input type="checkbox" checked={phase.possibilita_doppia_seduta} onChange={event => setPhase(index, "possibilita_doppia_seduta", event.target.checked)} /> Genera doppia seduta nei giorni di allenamento</label></div><div className="field full"><label>Note</label><textarea rows={2} value={phase.note ?? ""} onChange={event => setPhase(index, "note", event.target.value || null)} /></div></div></section>)}

      <section className="season-setting-card"><h2>Richiamo atletico</h2><p className="season-card-note">Può sovrapporsi al Campionato e aumenta il peso futuro della componente fisica.</p><div className="form-grid"><div className="field"><label>Data inizio</label><input type="date" value={recallDraft.data_inizio} onChange={event => setRecall("data_inizio", event.target.value)} /></div><div className="field"><label>Data fine</label><input type="date" value={recallDraft.data_fine} onChange={event => setRecall("data_fine", event.target.value)} /></div><div className="field"><label>Incremento carico fisico</label><select value={recallDraft.livello_incremento_carico_fisico ?? ""} onChange={event => setRecall("livello_incremento_carico_fisico", event.target.value || null)}><option>Basso</option><option>Medio</option><option>Alto</option></select></div><div className="field full"><label>Note</label><textarea rows={2} value={recallDraft.note ?? ""} onChange={event => setRecall("note", event.target.value || null)} /></div></div></section>

      <section className="season-setting-card"><h2>Profilo sedute</h2><div className="profile-settings-grid">{profileDrafts.map((profile, index) => <article key={profile.match_day_offset}><span className="md-badge">{profile.nome}</span><div className="field"><label>Tipo seduta</label><input value={profile.tipo_seduta} onChange={event => setProfile(index, "tipo_seduta", event.target.value)} /></div><div className="field"><label>Carico</label><input value={profile.carico_previsto ?? ""} onChange={event => setProfile(index, "carico_previsto", event.target.value || null)} /></div><div className="field"><label>Durata</label><input type="number" value={profile.durata_standard ?? 60} onChange={event => setProfile(index, "durata_standard", Number(event.target.value))} /></div><div className="field"><label>Caratteristiche, una per riga</label><textarea rows={6} value={profile.caratteristiche.join("\n")} onChange={event => setProfile(index, "caratteristiche", event.target.value.split("\n").filter(Boolean))} /></div></article>)}</div></section>

      <section className="season-setting-card"><h2>Calendario gare</h2><div className="inline-entry-grid"><input type="date" value={matchDraft.data} onChange={event => setMatchDraft(current => ({ ...current, data: event.target.value }))} /><select value={matchDraft.tipo} onChange={event => setMatchDraft(current => ({ ...current, tipo: event.target.value as MatchType }))}>{["Campionato", "Coppa", "Amichevole", "Torneo", "Altro"].map(item => <option key={item}>{item}</option>)}</select><input placeholder="Avversario" value={matchDraft.avversario} onChange={event => setMatchDraft(current => ({ ...current, avversario: event.target.value }))} /><select value={matchDraft.casa_trasferta} onChange={event => setMatchDraft(current => ({ ...current, casa_trasferta: event.target.value as typeof matchDraft.casa_trasferta }))}><option value="">Casa/trasferta</option><option>Casa</option><option>Trasferta</option></select><button type="button" onClick={addMatch}>Aggiungi gara</button></div><div className="season-record-list">{matches.filter(item => item.origine === "Manuale").map(item => <div key={item.id}><span>{item.data}</span><strong>{item.tipo}{item.avversario ? ` · ${item.avversario}` : ""}</strong><small>{item.casa_trasferta ?? ""}</small><button type="button" className="danger-link" onClick={() => onDeleteMatch(item)}>Rimuovi</button></div>)}</div></section>

      <section className="season-setting-card"><h2>Eccezioni</h2><div className="inline-entry-grid exception"><input type="date" value={exceptionDraft.data} onChange={event => setExceptionDraft(current => ({ ...current, data: event.target.value }))} /><select value={exceptionDraft.tipo_giornata} onChange={event => setExceptionDraft(current => ({ ...current, tipo_giornata: event.target.value as CalendarDayType }))}>{["Allenamento", "Gara", "Amichevole", "Riposo", "Recupero", "Allenamento extra", "Annullato", "Altro"].map(item => <option key={item}>{item}</option>)}</select><input placeholder="Note" value={exceptionDraft.note} onChange={event => setExceptionDraft(current => ({ ...current, note: event.target.value }))} /><button type="button" onClick={addException}>Aggiungi eccezione</button></div><div className="season-record-list">{exceptions.map(item => <div key={item.id}><span>{item.data}</span><strong>{item.tipo_giornata}</strong><small>{item.note ?? ""}</small><button type="button" className="danger-link" onClick={() => onDeleteException(item)}>Rimuovi</button></div>)}</div></section>

      <div className="season-sticky-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button type="submit" className="secondary" disabled={busy}>{busy ? "Salvataggio…" : "Salva impostazioni"}</button><button type="button" className="primary" disabled={busy} onClick={saveAndGenerate}>Genera / aggiorna agenda</button></div>
    </form>
  </div>;
}
