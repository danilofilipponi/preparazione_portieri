"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { AppSettings, CatalogPhase, Exercise, ExerciseCategory, ExerciseSubcategory, Training } from "../lib/types";
import { deleteExerciseImage, isAcceptedExerciseImage, parseExerciseImageName, uploadExerciseImage, type ExerciseImageKind } from "../lib/exercise-images";
import { ExerciseCard } from "./components/exercise-card";
import { BulkImageImportModal, ExerciseImageField, type BulkImageSummary } from "./components/exercise-image-tools";

type Section = "archive" | "builder" | "agenda";
type ExerciseDraft = Omit<Exercise, "id" | "category" | "subcategory">;

const emptyExercise: ExerciseDraft = {
  codice: "", nome: "", category_id: 1, subcategory_id: 1,
  categoria: "Tecnica presa alta e rasoterra", sottocategoria: "Presa alta analitica", fase: "Analitico",
  obiettivo: "", descrizione: "", durata_min: 12, portieri_min: 1, portieri_max: 4,
  intensita: "Media", difficolta: 1, materiale: "", variante: null,
  coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null,
  schema_step_3: null, schema_step_4: null, schema_step_5: null,
  schema_url: null, foto_url: null, attivo: true,
};

const fallbackObjectives = ["Tecnica di presa", "Rapidità", "Dominio area", "Distribuzione", "Tecnica di tuffo", "1 contro 1"];
const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const defaultSettings: AppSettings = {
  id: "default", coach_name: "Marco Rossi", account_email: "", phone: null,
  role: "Preparatore portieri", club_name: "", team_name: "Prima squadra",
  season: "2026/27", training_location: null, default_duration_minutes: 60,
  default_goalkeeper_count: 3,
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mondayOf(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function normalizeExercise(record: Record<string, unknown>): Exercise {
  const category = record.category as ExerciseCategory | null | undefined;
  const subcategory = record.subcategory as ExerciseSubcategory | null | undefined;
  const relatedPhase = subcategory?.fase;
  const fase: CatalogPhase = record.fase === "Disturbo" || record.fase === "Situazionale"
    ? record.fase
    : relatedPhase === "Disturbo" || relatedPhase === "Situazionale"
      ? relatedPhase
      : "Analitico";
  return {
    ...record,
    categoria: String(record.categoria ?? category?.nome ?? record.legacy_category ?? "Categoria da definire"),
    sottocategoria: String(record.sottocategoria ?? subcategory?.nome ?? record.legacy_subcategory ?? "Sottocategoria da definire"),
    fase,
    portieri_min: Number(record.portieri_min ?? record.numero_portieri_min ?? 1),
    portieri_max: Number(record.portieri_max ?? record.numero_portieri_max ?? 1),
    difficolta: ([1, 2, 3].includes(Number(record.difficolta)) ? Number(record.difficolta) : 1) as 1 | 2 | 3,
    coaching_points: String(record.coaching_points ?? "Da completare."),
    errori_comuni: String(record.errori_comuni ?? "Da completare."),
    schema_step_1: record.schema_step_1 ? String(record.schema_step_1) : null,
    schema_step_2: record.schema_step_2 ? String(record.schema_step_2) : null,
    schema_step_3: record.schema_step_3 ? String(record.schema_step_3) : null,
    schema_step_4: record.schema_step_4 ? String(record.schema_step_4) : null,
    schema_step_5: record.schema_step_5 ? String(record.schema_step_5) : null,
    schema_url: (record.schema_url ?? record.immagine_url ?? null) as string | null,
    foto_url: (record.foto_url ?? null) as string | null,
    category: category ?? undefined,
    subcategory: subcategory ?? undefined,
  } as Exercise;
}

export function KeeperApp() {
  const [section, setSection] = useState<Section>("archive");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseCategories, setExerciseCategories] = useState<ExerciseCategory[]>([]);
  const [exerciseSubcategories, setExerciseSubcategories] = useState<ExerciseSubcategory[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<number | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<CatalogPhase | "all">("all");
  const [intensityFilter, setIntensityFilter] = useState<Exercise["intensita"] | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<1 | 2 | 3 | "all">("all");
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [session, setSession] = useState<Exercise[]>([]);
  const [duration, setDuration] = useState(60);
  const [keepers, setKeepers] = useState(3);
  const [date, setDate] = useState(dateKey(new Date()));
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingExercise, setEditingExercise] = useState<Exercise | "new" | null>(null);
  const [openTraining, setOpenTraining] = useState<Training | null>(null);
  const [openExercise, setOpenExercise] = useState<Exercise | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkImageOpen, setBulkImageOpen] = useState(false);

  const loadExercises = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("exercises").select("*, category:exercise_categories(*), subcategory:exercise_subcategories(*)").order("codice");
    if (error) setToast(`Archivio non disponibile: ${error.message}`);
    else setExercises((data ?? []).map(item => normalizeExercise(item as Record<string, unknown>)));
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    const [categoryResult, subcategoryResult] = await Promise.all([
      supabase.from("exercise_categories").select("id,nome,attivo").eq("attivo", true).order("id"),
      supabase.from("exercise_subcategories").select("id,category_id,nome,fase,attivo").eq("attivo", true).order("id"),
    ]);
    if (categoryResult.error || subcategoryResult.error) {
      setToast("Catalogo tecnico non disponibile: applica la migration 0003");
      return;
    }
    setExerciseCategories((categoryResult.data ?? []) as ExerciseCategory[]);
    setExerciseSubcategories((subcategoryResult.data ?? []) as ExerciseSubcategory[]);
  }, []);

  const loadTrainings = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("trainings")
      .select("id, training_date, planned_duration_minutes, goalkeeper_count, notes, status, training_objectives(objective), training_exercises(id, position, planned_duration_minutes, notes, exercise:exercises(*))")
      .order("training_date");
    if (error) setToast(`Agenda non disponibile: ${error.message}`);
    else {
      const normalized = (data ?? []).map(training => ({
        ...training,
        training_exercises: [...(training.training_exercises ?? [])].sort((a, b) => a.position - b.position).map(item => ({
          ...item,
          exercise: item.exercise ? normalizeExercise(item.exercise as unknown as Record<string, unknown>) : item.exercise,
        })),
      }));
      setTrainings(normalized as unknown as Training[]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", "default").maybeSingle();
    if (error) return;
    const next = (data ?? defaultSettings) as AppSettings;
    setSettings(next);
    setDuration(next.default_duration_minutes);
    setKeepers(next.default_goalkeeper_count);
  }, []);

  useEffect(() => {
    Promise.all([loadCatalog(), loadExercises(), loadTrainings(), loadSettings()]).finally(() => setLoading(false));
  }, [loadCatalog, loadExercises, loadTrainings, loadSettings]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const availableSubcategories = useMemo(() => exerciseSubcategories.filter(item => item.fase !== "Generale" && (categoryFilter === "all" || item.category_id === categoryFilter)), [exerciseSubcategories, categoryFilter]);
  const objectives = useMemo(() => Array.from(new Set([...fallbackObjectives, ...exercises.map(item => item.obiettivo)])).filter(Boolean), [exercises]);
  const filtered = useMemo(() => exercises.filter(exercise => {
    const matchesSearch = exercise.nome.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || exercise.category_id === categoryFilter;
    const matchesSubcategory = subcategoryFilter === "all" || exercise.subcategory_id === subcategoryFilter;
    const matchesPhase = phaseFilter === "all" || exercise.fase === phaseFilter;
    const matchesIntensity = intensityFilter === "all" || exercise.intensita === intensityFilter;
    const matchesDifficulty = difficultyFilter === "all" || exercise.difficolta === difficultyFilter;
    return exercise.attivo && matchesSearch && matchesCategory && matchesSubcategory && matchesPhase && matchesIntensity && matchesDifficulty;
  }), [exercises, search, categoryFilter, subcategoryFilter, phaseFilter, intensityFilter, difficultyFilter]);
  const totalMinutes = session.reduce((sum, item) => sum + item.durata_min, 0);

  function generateSession() {
    const compatible = exercises.filter(item => item.attivo && item.portieri_min <= keepers && item.portieri_max >= keepers);
    const preferred = compatible.filter(item => selectedObjectives.includes(item.obiettivo));
    const pool = [...preferred, ...compatible.filter(item => !preferred.includes(item))];
    const next: Exercise[] = [];
    let minutes = 0;
    for (const item of pool) {
      if (minutes >= duration || next.some(existing => existing.id === item.id)) continue;
      next.push(item);
      minutes += item.durata_min;
    }
    setSession(next);
    setToast(next.length ? `${next.length} esercizi compatibili proposti` : "Aggiungi esercizi compatibili all’archivio");
  }

  function swapExercise(index: number) {
    const current = session[index];
    const alternatives = exercises.filter(item => item.category_id === current.category_id && item.id !== current.id && !session.some(active => active.id === item.id) && item.portieri_min <= keepers && item.portieri_max >= keepers);
    if (!alternatives.length) { setToast("Nessuna alternativa compatibile nella stessa categoria"); return; }
    setSession(items => items.map((item, itemIndex) => itemIndex === index ? alternatives[0] : item));
  }

  async function saveSession() {
    if (!supabase || !session.length) { setToast("Genera prima una proposta con almeno un esercizio"); return; }
    const { data: training, error } = await supabase.from("trainings").insert({
      training_date: date,
      planned_duration_minutes: duration,
      goalkeeper_count: keepers,
      status: "planned",
    }).select("id").single();
    if (error || !training) { setToast(`Salvataggio non riuscito: ${error?.message ?? "errore sconosciuto"}`); return; }

    const [objectiveResult, exerciseResult] = await Promise.all([
      selectedObjectives.length ? supabase.from("training_objectives").insert(selectedObjectives.map(objective => ({ training_id: training.id, objective }))) : Promise.resolve({ error: null }),
      supabase.from("training_exercises").insert(session.map((exercise, position) => ({ training_id: training.id, exercise_id: exercise.id, position, planned_duration_minutes: exercise.durata_min }))),
    ]);
    if (objectiveResult.error || exerciseResult.error) {
      await supabase.from("trainings").delete().eq("id", training.id);
      setToast("La seduta non è stata salvata completamente");
      return;
    }
    await loadTrainings();
    setToast("Allenamento salvato nell’agenda");
    setSection("agenda");
  }

  async function saveExercise(draft: ExerciseDraft, schemaImage: File | null, photoImage: File | null) {
    if (!supabase) return;
    const existing = editingExercise !== "new" ? editingExercise : null;
    async function upload(file: File | null, kind: "schema" | "foto", current: string | null) {
      if (!file) return current;
      return uploadExerciseImage(draft.codice, kind, file, current);
    }
    let schemaUrl: string | null;
    let photoUrl: string | null;
    try {
      [schemaUrl, photoUrl] = await Promise.all([upload(schemaImage, "schema", existing?.schema_url ?? draft.schema_url), upload(photoImage, "foto", existing?.foto_url ?? draft.foto_url)]);
    } catch (error) { setToast(`Immagine non caricata: ${error instanceof Error ? error.message : "errore"}`); return; }
    const selectedCategory = exerciseCategories.find(item => item.id === draft.category_id);
    const selectedSubcategory = exerciseSubcategories.find(item => item.id === draft.subcategory_id);
    if (!selectedCategory || !selectedSubcategory || selectedSubcategory.fase === "Generale") { setToast("Categoria o sottocategoria non valida"); return; }
    const payload = { ...draft, categoria: selectedCategory.nome, sottocategoria: selectedSubcategory.nome, fase: selectedSubcategory.fase, variante: draft.variante || null, schema_url: schemaUrl, foto_url: photoUrl };
    const result = existing
      ? await supabase.from("exercises").update(payload).eq("id", existing.id)
      : await supabase.from("exercises").insert(payload);
    if (result.error) {
      setToast(`Esercizio non salvato: ${result.error.message}`);
      return;
    }
    setEditingExercise(null);
    await loadExercises();
    setToast(existing ? "Esercizio aggiornato" : "Esercizio aggiunto all’archivio");
  }

  function applyImageUrl(exerciseId: string, kind: ExerciseImageKind, url: string | null) {
    const field = kind === "schema" ? "schema_url" : "foto_url";
    setExercises(current => current.map(item => item.id === exerciseId ? { ...item, [field]: url } : item));
    setOpenExercise(current => current?.id === exerciseId ? { ...current, [field]: url } : current);
    setEditingExercise(current => current && current !== "new" && current.id === exerciseId ? { ...current, [field]: url } : current);
  }

  async function changeExerciseImage(exercise: Exercise, kind: ExerciseImageKind, file: File | null) {
    if (!supabase) throw new Error("Supabase non configurato");
    const field = kind === "schema" ? "schema_url" : "foto_url";
    const currentUrl = exercise[field];
    try {
      let nextUrl: string | null = null;
      if (file) nextUrl = await uploadExerciseImage(exercise.codice, kind, file, currentUrl);
      else await deleteExerciseImage(exercise.codice, kind, currentUrl);
      const { error } = await supabase.from("exercises").update({ [field]: nextUrl }).eq("id", exercise.id);
      if (error) throw error;
      applyImageUrl(exercise.id, kind, nextUrl);
      setToast(file ? `${kind === "schema" ? "Schema tecnico" : "Foto dimostrativa"} caricato con successo` : "Immagine eliminata");
      return nextUrl;
    } catch (error) {
      const message = error instanceof Error ? error.message : "errore sconosciuto";
      setToast(`Operazione immagine non riuscita: ${message}`);
      throw error;
    }
  }

  async function importExerciseImages(files: File[], onProgress: (summary: BulkImageSummary) => void) {
    const summary: BulkImageSummary = { total: files.length, processed: 0, schemas: 0, photos: 0, errors: [] };
    if (!supabase) {
      summary.errors.push("Supabase non configurato");
      summary.processed = files.length;
      onProgress({ ...summary, errors: [...summary.errors] });
      return summary;
    }
    const exercisesByCode = new Map(exercises.map(exercise => [exercise.codice.toUpperCase(), exercise]));
    const seen = new Set<string>();

    for (const file of files) {
      const parsed = parseExerciseImageName(file.name);
      try {
        if (!parsed || !isAcceptedExerciseImage(file)) throw new Error(`${file.name}: nome o formato non riconosciuto`);
        const exercise = exercisesByCode.get(parsed.codice);
        if (!exercise) throw new Error(`${file.name}: codice ${parsed.codice} non presente nel database`);
        const key = `${parsed.codice}:${parsed.kind}`;
        if (seen.has(key)) throw new Error(`${file.name}: immagine duplicata nella selezione`);
        seen.add(key);
        const field = parsed.kind === "schema" ? "schema_url" : "foto_url";
        const nextUrl = await uploadExerciseImage(exercise.codice, parsed.kind, file, exercise[field]);
        const { error } = await supabase.from("exercises").update({ [field]: nextUrl }).eq("id", exercise.id);
        if (error) throw error;
        exercise[field] = nextUrl;
        applyImageUrl(exercise.id, parsed.kind, nextUrl);
        if (parsed.kind === "schema") summary.schemas += 1;
        else summary.photos += 1;
      } catch (error) {
        summary.errors.push(error instanceof Error ? error.message : `${file.name}: errore sconosciuto`);
      }
      summary.processed += 1;
      onProgress({ ...summary, errors: [...summary.errors] });
    }
    await loadExercises();
    setToast(summary.errors.length ? `Importazione completata con ${summary.errors.length} errori` : "Importazione immagini completata con successo");
    return { ...summary, errors: [...summary.errors] };
  }

  async function deleteExercise(exercise: Exercise) {
    if (!supabase || !window.confirm(`Disattivare “${exercise.nome}”?`)) return;
    const { error } = await supabase.from("exercises").update({ attivo: false }).eq("id", exercise.id);
    if (error) { setToast("L’esercizio non può essere disattivato"); return; }
    await loadExercises();
    setToast("Esercizio disattivato");
  }

  async function saveSettings(next: AppSettings) {
    if (!supabase) return;
    const payload = { ...next, phone: next.phone || null, training_location: next.training_location || null };
    const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "id" });
    if (error) { setToast(`Impostazioni non salvate: ${error.message}`); return; }
    setSettings(payload);
    setDuration(payload.default_duration_minutes);
    setKeepers(payload.default_goalkeeper_count);
    setSettingsOpen(false);
    setToast("Impostazioni salvate");
  }

  const initials = settings.coach_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "KP";

  const nav = [
    { id: "archive" as const, icon: "▦", label: "Archivio esercizi" },
    { id: "builder" as const, icon: "+", label: "Crea allenamento" },
    { id: "agenda" as const, icon: "□", label: "Agenda settimanale" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">K</span> KeeperLab</div>
        <div className="side-label">Area tecnica</div>
        {nav.map(item => <button key={item.id} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        <div className="coach-card"><div className="avatar">{initials}</div><div><strong>{settings.coach_name}</strong><span>{settings.role}</span></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><span className="eyebrow">{settings.club_name ? `${settings.club_name} · ` : ""}{settings.team_name} · {settings.season}</span><div className="topbar-actions"><span className="online">● {isSupabaseConfigured ? "Supabase connesso" : "Configurazione mancante"}</span><button className="settings-button" aria-label="Apri impostazioni" title="Impostazioni" onClick={() => setSettingsOpen(true)}>⚙</button></div></header>
        <div className="content">
          {loading ? <div className="loading-state">Caricamento archivio e agenda…</div> : null}
          {!loading && section === "archive" && <Archive exercises={filtered} categories={exerciseCategories} subcategories={availableSubcategories} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={value => { setCategoryFilter(value); setSubcategoryFilter("all"); }} subcategoryFilter={subcategoryFilter} setSubcategoryFilter={setSubcategoryFilter} phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter} intensityFilter={intensityFilter} setIntensityFilter={setIntensityFilter} difficultyFilter={difficultyFilter} setDifficultyFilter={setDifficultyFilter} onNew={() => setEditingExercise("new")} onImportImages={() => setBulkImageOpen(true)} onOpen={setOpenExercise} onEdit={setEditingExercise} onDelete={deleteExercise} />}
          {!loading && section === "builder" && <Builder date={date} setDate={setDate} duration={duration} setDuration={setDuration} keepers={keepers} setKeepers={setKeepers} objectives={objectives} selectedObjectives={selectedObjectives} setSelectedObjectives={setSelectedObjectives} session={session} totalMinutes={totalMinutes} onGenerate={generateSession} onSwap={swapExercise} onSave={saveSession} />}
          {!loading && section === "agenda" && <Agenda trainings={trainings} weekStart={weekStart} setWeekStart={setWeekStart} onOpen={setOpenTraining} onCreate={() => setSection("builder")} />}
        </div>
      </main>

      <nav className="mobile-nav">{nav.map(item => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><b>{item.icon}</b>{item.label.replace(" settimanale", "")}</button>)}</nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      {editingExercise && <ExerciseImageModal exercise={editingExercise === "new" ? null : editingExercise} categories={exerciseCategories} subcategories={exerciseSubcategories} onClose={() => setEditingExercise(null)} onSave={saveExercise} onImageChange={changeExerciseImage} />}
      {openExercise && <ExerciseDetailModal exercise={openExercise} onClose={() => setOpenExercise(null)} onEdit={() => { setOpenExercise(null); setEditingExercise(openExercise); }} />}
      {bulkImageOpen && <BulkImageImportModal onClose={() => setBulkImageOpen(false)} onImport={importExerciseImages} />}
      {openTraining && <TrainingModal training={openTraining} onClose={() => setOpenTraining(null)} />}
      {settingsOpen && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />}
    </div>
  );
}

function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>;
}

type ArchiveProps = { exercises: Exercise[]; categories: ExerciseCategory[]; subcategories: ExerciseSubcategory[]; search: string; setSearch: (value: string) => void; categoryFilter: number | "all"; setCategoryFilter: (value: number | "all") => void; subcategoryFilter: number | "all"; setSubcategoryFilter: (value: number | "all") => void; phaseFilter: CatalogPhase | "all"; setPhaseFilter: (value: CatalogPhase | "all") => void; intensityFilter: Exercise["intensita"] | "all"; setIntensityFilter: (value: Exercise["intensita"] | "all") => void; difficultyFilter: 1 | 2 | 3 | "all"; setDifficultyFilter: (value: 1 | 2 | 3 | "all") => void; onNew: () => void; onImportImages: () => void; onOpen: (exercise: Exercise) => void; onEdit: (exercise: Exercise) => void; onDelete: (exercise: Exercise) => void };
function Archive(props: ArchiveProps) {
  return <>
    <PageHead eyebrow="Catalogo tecnico ufficiale" title="Archivio esercizi" subtitle={`${props.exercises.length} esercizi nella selezione corrente.`} action={<div className="page-actions"><button className="secondary" onClick={props.onImportImages}>⇧ Importa immagini</button><button className="primary" onClick={props.onNew}>+ Nuovo esercizio</button></div>} />
    <div className="archive-toolbar"><div className="search"><span>⌕</span><input aria-label="Cerca esercizio per nome" placeholder="Cerca un esercizio per nome…" value={props.search} onChange={event => props.setSearch(event.target.value)} /></div><select className="filter-select" aria-label="Filtra categoria" value={props.categoryFilter} onChange={event => props.setCategoryFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">Tutte le categorie</option>{props.categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select><select className="filter-select" aria-label="Filtra sottocategoria" value={props.subcategoryFilter} onChange={event => props.setSubcategoryFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">Tutte le sottocategorie</option>{props.subcategories.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.fase}</option>)}</select><select className="filter-select" aria-label="Filtra fase metodologica" value={props.phaseFilter} onChange={event => props.setPhaseFilter(event.target.value as CatalogPhase | "all")}><option value="all">Tutte le fasi</option>{(["Analitico", "Disturbo", "Situazionale"] as CatalogPhase[]).map(item => <option key={item}>{item}</option>)}</select><select className="filter-select" aria-label="Filtra intensità" value={props.intensityFilter} onChange={event => props.setIntensityFilter(event.target.value as Exercise["intensita"] | "all")}><option value="all">Tutte le intensità</option>{["Bassa", "Media", "Alta"].map(item => <option key={item}>{item}</option>)}</select><select className="filter-select" aria-label="Filtra difficoltà" value={props.difficultyFilter} onChange={event => props.setDifficultyFilter(event.target.value === "all" ? "all" : Number(event.target.value) as 1 | 2 | 3)}><option value="all">Tutte le difficoltà</option><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option></select></div>
    {!props.exercises.length ? <EmptyState title="Nessun esercizio trovato" text="Modifica i filtri oppure aggiungi un nuovo esercizio." action={<button className="primary" onClick={props.onNew}>Aggiungi esercizio</button>} /> : null}
    <div className="exercise-grid technical-grid">{props.exercises.map(exercise => <ExerciseCard key={exercise.id} exercise={exercise} onOpen={props.onOpen} onEdit={props.onEdit} onDeactivate={props.onDelete} />)}</div>
  </>;
}

type BuilderProps = { date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; keepers: number; setKeepers: (value: number) => void; objectives: string[]; selectedObjectives: string[]; setSelectedObjectives: (value: string[]) => void; session: Exercise[]; totalMinutes: number; onGenerate: () => void; onSwap: (index: number) => void; onSave: () => void };
function Builder(props: BuilderProps) {
  const toggleObjective = (objective: string) => props.setSelectedObjectives(props.selectedObjectives.includes(objective) ? props.selectedObjectives.filter(item => item !== objective) : [...props.selectedObjectives, objective]);
  return <><PageHead eyebrow="Pianificazione" title="Crea allenamento" subtitle="Imposta i vincoli: KeeperLab compone una proposta usando gli esercizi compatibili." />
    <div className="builder"><section className="panel"><h2>Parametri della seduta</h2><div className="form-grid"><div className="field"><label>Data</label><input type="date" value={props.date} onChange={event => props.setDate(event.target.value)} /></div><div className="field"><label>Durata totale</label><select value={props.duration} onChange={event => props.setDuration(Number(event.target.value))}>{[45, 60, 75, 90].map(value => <option key={value} value={value}>{value} minuti</option>)}</select></div><div className="field"><label>Numero portieri</label><select value={props.keepers} onChange={event => props.setKeepers(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="field"><label>Contesto</label><select><option>Allenamento standard</option><option>Pre-gara</option><option>Recupero</option></select></div><div className="field full"><label>Obiettivi</label><div className="chips">{props.objectives.map(objective => <button key={objective} className={`chip ${props.selectedObjectives.includes(objective) ? "selected" : ""}`} onClick={() => toggleObjective(objective)}>{objective}</button>)}</div></div></div><button className="primary generate" onClick={props.onGenerate}>Genera proposta compatibile</button></section>
    <section className="panel"><h2>Proposta seduta</h2>{!props.session.length ? <p className="panel-hint">Seleziona gli obiettivi e genera la proposta.</p> : null}<div className="session-list">{props.session.map((item, index) => <div className="session-row" key={`${item.id}-${index}`}><div className="duration">{item.durata_min}&apos;</div><div><strong>{item.nome}</strong><small>{item.category?.nome} · {item.obiettivo}</small></div><button className="swap" aria-label={`Sostituisci ${item.nome}`} onClick={() => props.onSwap(index)}>↻</button></div>)}</div><div className="session-total"><span>Durata esercizi</span><span>{props.totalMinutes} min</span></div><div className="save-row"><button className="secondary" onClick={props.onGenerate}>Rigenera</button><button className="primary" onClick={props.onSave}>Salva seduta</button></div></section></div>
  </>;
}

function Agenda({ trainings, weekStart, setWeekStart, onOpen, onCreate }: { trainings: Training[]; weekStart: Date; setWeekStart: (date: Date) => void; onOpen: (training: Training) => void; onCreate: () => void }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; });
  const end = days[6];
  const month = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(end);
  const shift = (amount: number) => { const next = new Date(weekStart); next.setDate(next.getDate() + amount); setWeekStart(next); };
  return <><PageHead eyebrow="Programmazione" title="Agenda settimanale" subtitle="Consulta le sedute salvate e apri il dettaglio completo di ogni giornata." action={<button className="primary" onClick={onCreate}>+ Aggiungi seduta</button>} /><div className="weekbar"><h2>{days[0].getDate()} – {end.getDate()} {month}</h2><div className="week-controls"><button className="icon-button" onClick={() => shift(-7)}>‹</button><button className="secondary" onClick={() => setWeekStart(mondayOf(new Date()))}>Oggi</button><button className="icon-button" onClick={() => shift(7)}>›</button></div></div><div className="calendar">{days.map((day, index) => {
    const daily = trainings.filter(training => training.training_date === dateKey(day));
    const today = dateKey(day) === dateKey(new Date());
    return <div className={`day ${today ? "today" : ""}`} key={dateKey(day)}><div className="day-head"><span className="day-name">{dayNames[index]}</span><span className="day-number">{day.getDate()}</span></div>{daily.map(training => <button className="workout" key={training.id} onClick={() => onOpen(training)}><span>Seduta programmata</span><strong>{training.training_objectives.map(item => item.objective).join(" · ") || "Allenamento portieri"}</strong><span>{training.planned_duration_minutes} min · {training.goalkeeper_count} portieri</span></button>)}{!daily.length ? <div className="empty-day">Nessuna seduta</div> : null}</div>;
  })}</div></>;
}

function ExerciseModal({ exercise, categories, subcategories, onClose, onSave }: { exercise: Exercise | null; categories: ExerciseCategory[]; subcategories: ExerciseSubcategory[]; onClose: () => void; onSave: (draft: ExerciseDraft, schemaImage: File | null, photoImage: File | null) => Promise<void> }) {
  const firstCategory = categories[0];
  const firstSubcategory = subcategories.find(item => item.category_id === firstCategory?.id && item.fase !== "Generale");
  const initial: ExerciseDraft = exercise ? (({ id: _id, category: _category, subcategory: _subcategory, ...rest }) => rest)(exercise) : { ...emptyExercise, category_id: firstCategory?.id ?? 1, subcategory_id: firstSubcategory?.id ?? 1, categoria: firstCategory?.nome ?? emptyExercise.categoria, sottocategoria: firstSubcategory?.nome ?? emptyExercise.sottocategoria, fase: firstSubcategory?.fase === "Generale" ? "Analitico" : firstSubcategory?.fase ?? "Analitico" };
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [schemaImage, setSchemaImage] = useState<File | null>(null);
  const [photoImage, setPhotoImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const validSubcategories = subcategories.filter(item => item.category_id === draft.category_id && item.fase !== "Generale");
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  function changeCategory(categoryId: number) { const category = categories.find(item => item.id === categoryId); const first = subcategories.find(item => item.category_id === categoryId && item.fase !== "Generale"); if (!category || !first) return; setDraft(current => ({ ...current, category_id: categoryId, subcategory_id: first.id, categoria: category.nome, sottocategoria: first.nome, fase: first.fase as CatalogPhase })); }
  function changeSubcategory(subcategoryId: number) { const item = subcategories.find(subcategory => subcategory.id === subcategoryId); if (!item || item.fase === "Generale") return; setDraft(current => ({ ...current, subcategory_id: item.id, sottocategoria: item.nome, fase: item.fase })); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); await onSave(draft, schemaImage, photoImage); setSaving(false); }
  return <div className="modal-backdrop"><form className="modal exercise-form-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Catalogo esercizi</span><h2>{exercise ? "Modifica esercizio" : "Nuovo esercizio"}</h2><div className="form-grid modal-form"><div className="field"><label>Codice</label><input required value={draft.codice} onChange={event => set("codice", event.target.value)} /></div><div className="field"><label>Nome</label><input required value={draft.nome} onChange={event => set("nome", event.target.value)} /></div><div className="field"><label>Categoria</label><select required value={draft.category_id} onChange={event => changeCategory(Number(event.target.value))}>{categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><div className="field"><label>Sottocategoria</label><select required value={draft.subcategory_id} onChange={event => changeSubcategory(Number(event.target.value))}>{validSubcategories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><div className="field"><label>Fase metodologica</label><input value={draft.fase} readOnly /></div><div className="field"><label>Difficoltà</label><select value={draft.difficolta} onChange={event => set("difficolta", Number(event.target.value) as 1 | 2 | 3)}><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option></select></div><div className="field full"><label>Obiettivo</label><textarea required rows={2} value={draft.obiettivo} onChange={event => set("obiettivo", event.target.value)} /></div><div className="field full"><label>Descrizione</label><textarea required rows={4} value={draft.descrizione} onChange={event => set("descrizione", event.target.value)} /></div><div className="field"><label>Durata (minuti)</label><input required min="1" type="number" value={draft.durata_min} onChange={event => set("durata_min", Number(event.target.value))} /></div><div className="field"><label>Intensità</label><select value={draft.intensita} onChange={event => set("intensita", event.target.value as ExerciseDraft["intensita"])}><option>Bassa</option><option>Media</option><option>Alta</option></select></div><div className="field"><label>Portieri minimi</label><input required min="1" type="number" value={draft.portieri_min} onChange={event => set("portieri_min", Number(event.target.value))} /></div><div className="field"><label>Portieri massimi</label><input required min={draft.portieri_min} type="number" value={draft.portieri_max} onChange={event => set("portieri_max", Number(event.target.value))} /></div><div className="field full"><label>Materiale</label><input required value={draft.materiale} onChange={event => set("materiale", event.target.value)} /></div><div className="field full"><label>Variante</label><textarea rows={2} value={draft.variante ?? ""} onChange={event => set("variante", event.target.value)} /></div><div className="field full"><label>Coaching points</label><textarea required rows={3} value={draft.coaching_points} onChange={event => set("coaching_points", event.target.value)} /></div><div className="field full"><label>Errori comuni</label><textarea required rows={3} value={draft.errori_comuni} onChange={event => set("errori_comuni", event.target.value)} /></div><div className="field"><label>Schema tecnico</label><input accept="image/jpeg,image/png,image/webp" type="file" onChange={event => setSchemaImage(event.target.files?.[0] ?? null)} /><input className="url-input" placeholder="Oppure URL schema" value={draft.schema_url ?? ""} onChange={event => set("schema_url", event.target.value || null)} /></div><div className="field"><label>Foto dimostrativa</label><input accept="image/jpeg,image/png,image/webp" type="file" onChange={event => setPhotoImage(event.target.files?.[0] ?? null)} /><input className="url-input" placeholder="Oppure URL foto" value={draft.foto_url ?? ""} onChange={event => set("foto_url", event.target.value || null)} /></div><div className="field full checkbox-field"><label><input type="checkbox" checked={draft.attivo} onChange={event => set("attivo", event.target.checked)} /> Esercizio attivo</label></div></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving}>{saving ? "Salvataggio…" : "Salva esercizio"}</button></div></form></div>;
}

function ExerciseImageModal({ exercise, categories, subcategories, onClose, onSave, onImageChange }: {
  exercise: Exercise | null;
  categories: ExerciseCategory[];
  subcategories: ExerciseSubcategory[];
  onClose: () => void;
  onSave: (draft: ExerciseDraft, schemaImage: File | null, photoImage: File | null) => Promise<void>;
  onImageChange: (exercise: Exercise, kind: ExerciseImageKind, file: File | null) => Promise<string | null>;
}) {
  const firstCategory = categories[0];
  const firstSubcategory = subcategories.find(item => item.category_id === firstCategory?.id && item.fase !== "Generale");
  const initial: ExerciseDraft = exercise
    ? (({ id: _id, category: _category, subcategory: _subcategory, ...rest }) => rest)(exercise)
    : { ...emptyExercise, category_id: firstCategory?.id ?? 1, subcategory_id: firstSubcategory?.id ?? 1, categoria: firstCategory?.nome ?? emptyExercise.categoria, sottocategoria: firstSubcategory?.nome ?? emptyExercise.sottocategoria, fase: firstSubcategory?.fase === "Generale" ? "Analitico" : firstSubcategory?.fase ?? "Analitico" };
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [schemaImage, setSchemaImage] = useState<File | null>(null);
  const [photoImage, setPhotoImage] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState<ExerciseImageKind | null>(null);
  const [saving, setSaving] = useState(false);
  const validSubcategories = subcategories.filter(item => item.category_id === draft.category_id && item.fase !== "Generale");
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  function changeCategory(categoryId: number) {
    const category = categories.find(item => item.id === categoryId);
    const first = subcategories.find(item => item.category_id === categoryId && item.fase !== "Generale");
    if (!category || !first) return;
    setDraft(current => ({ ...current, category_id: categoryId, subcategory_id: first.id, categoria: category.nome, sottocategoria: first.nome, fase: first.fase as CatalogPhase }));
  }
  function changeSubcategory(subcategoryId: number) {
    const item = subcategories.find(subcategory => subcategory.id === subcategoryId);
    if (!item || item.fase === "Generale") return;
    setDraft(current => ({ ...current, subcategory_id: item.id, sottocategoria: item.nome, fase: item.fase }));
  }
  async function uploadImage(kind: ExerciseImageKind, file: File) {
    if (!exercise) {
      if (kind === "schema") setSchemaImage(file); else setPhotoImage(file);
      return;
    }
    setImageBusy(kind);
    try {
      const url = await onImageChange(exercise, kind, file);
      set(kind === "schema" ? "schema_url" : "foto_url", url);
    } finally { setImageBusy(null); }
  }
  async function removeImage(kind: ExerciseImageKind) {
    if (!exercise) {
      if (kind === "schema") setSchemaImage(null); else setPhotoImage(null);
      set(kind === "schema" ? "schema_url" : "foto_url", null);
      return;
    }
    setImageBusy(kind);
    try {
      await onImageChange(exercise, kind, null);
      set(kind === "schema" ? "schema_url" : "foto_url", null);
    } finally { setImageBusy(null); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    await onSave(draft, schemaImage, photoImage);
    setSaving(false);
  }

  return <div className="modal-backdrop"><form className="modal exercise-form-modal" onSubmit={submit}>
    <button type="button" className="modal-close" onClick={onClose}>×</button>
    <span className="eyebrow">Catalogo esercizi</span><h2>{exercise ? "Modifica esercizio" : "Nuovo esercizio"}</h2>
    <div className="form-grid modal-form">
      <div className="field"><label>Codice</label><input required readOnly={Boolean(exercise)} value={draft.codice} onChange={event => set("codice", event.target.value.toUpperCase())} /></div>
      <div className="field"><label>Nome</label><input required value={draft.nome} onChange={event => set("nome", event.target.value)} /></div>
      <div className="field"><label>Categoria</label><select required value={draft.category_id} onChange={event => changeCategory(Number(event.target.value))}>{categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div className="field"><label>Sottocategoria</label><select required value={draft.subcategory_id} onChange={event => changeSubcategory(Number(event.target.value))}>{validSubcategories.map(item => <option key={item.id} value={item.id}>{item.nome} · {item.fase}</option>)}</select></div>
      <div className="field"><label>Fase metodologica</label><input value={draft.fase} readOnly /></div>
      <div className="field"><label>Difficoltà</label><select value={draft.difficolta} onChange={event => set("difficolta", Number(event.target.value) as 1 | 2 | 3)}><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option></select></div>
      <div className="field full"><label>Obiettivo</label><textarea required rows={2} value={draft.obiettivo} onChange={event => set("obiettivo", event.target.value)} /></div>
      <div className="field full"><label>Descrizione</label><textarea required rows={4} value={draft.descrizione} onChange={event => set("descrizione", event.target.value)} /></div>
      <div className="field"><label>Durata (minuti)</label><input required min="1" type="number" value={draft.durata_min} onChange={event => set("durata_min", Number(event.target.value))} /></div>
      <div className="field"><label>Intensità</label><select value={draft.intensita} onChange={event => set("intensita", event.target.value as ExerciseDraft["intensita"])}><option>Bassa</option><option>Media</option><option>Alta</option></select></div>
      <div className="field"><label>Portieri minimi</label><input required min="1" type="number" value={draft.portieri_min} onChange={event => set("portieri_min", Number(event.target.value))} /></div>
      <div className="field"><label>Portieri massimi</label><input required min={draft.portieri_min} type="number" value={draft.portieri_max} onChange={event => set("portieri_max", Number(event.target.value))} /></div>
      <div className="field full"><label>Materiale</label><input required value={draft.materiale} onChange={event => set("materiale", event.target.value)} /></div>
      <div className="field full"><label>Variante</label><textarea rows={2} value={draft.variante ?? ""} onChange={event => set("variante", event.target.value)} /></div>
      <div className="field full"><label>Coaching points</label><textarea required rows={3} value={draft.coaching_points} onChange={event => set("coaching_points", event.target.value)} /></div>
      <div className="field full"><label>Errori comuni</label><textarea required rows={3} value={draft.errori_comuni} onChange={event => set("errori_comuni", event.target.value)} /></div>
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 1</label><textarea rows={2} value={draft.schema_step_1 ?? ""} onChange={event => set("schema_step_1", event.target.value || null)} /></div>
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 2</label><textarea rows={2} value={draft.schema_step_2 ?? ""} onChange={event => set("schema_step_2", event.target.value || null)} /></div>
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 3</label><textarea rows={2} value={draft.schema_step_3 ?? ""} onChange={event => set("schema_step_3", event.target.value || null)} /></div>
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 4</label><textarea rows={2} value={draft.schema_step_4 ?? ""} onChange={event => set("schema_step_4", event.target.value || null)} /></div>
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 5</label><textarea rows={2} value={draft.schema_step_5 ?? ""} onChange={event => set("schema_step_5", event.target.value || null)} /></div>
      <section className="exercise-images-section field full"><div className="exercise-images-title"><span>Immagini esercizio</span><small>WEBP, JPG, JPEG o PNG · salvataggio nello Storage Supabase</small></div><div className="exercise-images-grid">
        <ExerciseImageField label="Schema tecnico" kind="schema" url={draft.schema_url} selectedFile={schemaImage} busy={imageBusy === "schema"} immediate={Boolean(exercise)} onSelect={setSchemaImage} onUpload={file => uploadImage("schema", file)} onDelete={() => removeImage("schema")} />
        <ExerciseImageField label="Foto dimostrativa" kind="foto" url={draft.foto_url} selectedFile={photoImage} busy={imageBusy === "foto"} immediate={Boolean(exercise)} onSelect={setPhotoImage} onUpload={file => uploadImage("foto", file)} onDelete={() => removeImage("foto")} />
      </div></section>
      <div className="field full checkbox-field"><label><input type="checkbox" checked={draft.attivo} onChange={event => set("attivo", event.target.checked)} /> Esercizio attivo</label></div>
    </div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving || imageBusy !== null}>{saving ? "Salvataggio…" : "Salva esercizio"}</button></div>
  </form></div>;
}

function ExerciseDetailModal({ exercise, onClose, onEdit }: { exercise: Exercise; onClose: () => void; onEdit: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal exercise-card-modal" onClick={event => event.stopPropagation()}><button className="modal-close floating" onClick={onClose}>×</button><ExerciseCard exercise={exercise} onOpen={() => {}} onEdit={onEdit} onDeactivate={() => {}} showActions={false} variant="detail" /><div className="modal-actions"><button className="secondary" onClick={onClose}>Chiudi</button><button onClick={onEdit}>Modifica esercizio</button></div></div></div>;
}

function TrainingModal({ training, onClose }: { training: Training; onClose: () => void }) {
  const label = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${training.training_date}T12:00:00`));
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Seduta completa</span><h2>{label}</h2><p>{training.planned_duration_minutes} minuti · {training.goalkeeper_count} portieri · {training.training_objectives.map(item => item.objective).join(", ")}</p><div className="session-list">{training.training_exercises.map((item, index) => <div className="session-row" key={item.id}><div className="duration">{item.planned_duration_minutes}&apos;</div><div><strong>{index + 1}. {item.exercise.nome}</strong><small>{item.exercise.category?.nome} · {item.exercise.obiettivo}</small></div></div>)}</div></div></div>;
}

function SettingsModal({ settings, onClose, onSave }: { settings: AppSettings; onClose: () => void; onSave: (settings: AppSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft(current => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); await onSave(draft); setSaving(false); }
  return <div className="modal-backdrop"><form className="modal settings-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Personalizzazione</span><h2>Impostazioni</h2><p>Questi dati personalizzano la dashboard e i valori iniziali delle nuove sedute.</p>
    <div className="settings-section"><div className="settings-section-head"><span className="settings-section-icon">◎</span><div><h3>Account e preparatore</h3><small>Informazioni personali e di contatto</small></div></div><div className="form-grid"><div className="field"><label>Nome preparatore</label><input required value={draft.coach_name} onChange={event => set("coach_name", event.target.value)} /></div><div className="field"><label>Email account</label><input type="email" placeholder="nome@email.it" value={draft.account_email} onChange={event => set("account_email", event.target.value)} /></div><div className="field"><label>Telefono</label><input type="tel" placeholder="Facoltativo" value={draft.phone ?? ""} onChange={event => set("phone", event.target.value)} /></div><div className="field"><label>Ruolo</label><input required value={draft.role} onChange={event => set("role", event.target.value)} /></div></div></div>
    <div className="settings-section"><div className="settings-section-head"><span className="settings-section-icon">⌂</span><div><h3>Società e squadra</h3><small>Dati mostrati nella dashboard</small></div></div><div className="form-grid"><div className="field"><label>Società</label><input placeholder="Nome società" value={draft.club_name} onChange={event => set("club_name", event.target.value)} /></div><div className="field"><label>Squadra</label><input required value={draft.team_name} onChange={event => set("team_name", event.target.value)} /></div><div className="field"><label>Stagione</label><input required placeholder="2026/27" value={draft.season} onChange={event => set("season", event.target.value)} /></div><div className="field"><label>Campo di allenamento</label><input placeholder="Facoltativo" value={draft.training_location ?? ""} onChange={event => set("training_location", event.target.value)} /></div></div></div>
    <div className="settings-section"><div className="settings-section-head"><span className="settings-section-icon">◷</span><div><h3>Valori predefiniti</h3><small>Usati quando crei una nuova seduta</small></div></div><div className="form-grid"><div className="field"><label>Durata allenamento</label><select value={draft.default_duration_minutes} onChange={event => set("default_duration_minutes", Number(event.target.value))}>{[45, 60, 75, 90, 105, 120].map(value => <option key={value} value={value}>{value} minuti</option>)}</select></div><div className="field"><label>Numero portieri</label><select value={draft.default_goalkeeper_count} onChange={event => set("default_goalkeeper_count", Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div></div></div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving}>{saving ? "Salvataggio…" : "Salva impostazioni"}</button></div>
  </form></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return <div className="empty-state"><div className="brand-mark">K</div><h2>{title}</h2><p>{text}</p>{action}</div>;
}
