"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { AppSettings, CalendarDay, CalendarException, CatalogPhase, EditableExerciseSelection, EditableGeneratedSession, Exercise, ExerciseCategory, ExerciseDifficulty, ExercisePhysicalObjective, ExerciseSubcategory, GenerationMode, Goalkeeper, PhysicalAssessmentDimension, PhysicalObjective, PriorityRankingItem, ScoredExerciseCandidate, Season, SeasonMatch, SeasonPhaseConfig, SeasonRecallPeriod, SeasonTrainingProfile, SessionBlock, SessionProfile, SessionQualityResult, Training, TrainingExerciseVariant } from "../lib/types";
import { deleteExerciseImage, isAcceptedExerciseImage, parseExerciseImageName, uploadExerciseImage, type ExerciseImageKind } from "../lib/exercise-images";
import { ExerciseCard } from "./components/exercise-card";
import { BulkImageImportModal, ExerciseImageField, type BulkImageSummary } from "./components/exercise-image-tools";
import { PhysicalObjectivesPage } from "./components/physical-objectives";
import { ExercisePhysicalObjectivesEditor, type PhysicalMappingDraft } from "./components/exercise-physical-objectives-editor";
import { SeasonSettings, type SeasonConfiguration } from "./components/season-settings";
import { SeasonAgenda } from "./components/season-agenda";
import { CalendarDayModal } from "./components/calendar-day-modal";
import { GoalkeepersPage, type GoalkeeperAssessmentDraft, type GoalkeeperDraft } from "./components/goalkeepers-page";
import { SessionPlanner } from "./components/session-planner";
import { buildIndividualVariantSuggestions, buildSessionBlocks, buildSessionProfile, calculateSessionQuality, getReplacementCandidates, makeEditableSession, rankPhysicalPriorities, rankTechnicalPriorities, regenerateBlock, regenerateSession, scoreManualExercise, selectSessionExercises } from "../lib/session-planner/index";
import { ReplacementAlternativesModal } from "./components/replacement-alternatives-modal";
import { ManualExercisePicker } from "./components/manual-exercise-picker";
import { IndividualVariantsEditor } from "./components/individual-variants-editor";
import { SessionExerciseCard } from "./components/session-exercise-card";
import { SessionFieldMode } from "./components/session-field-mode";
import { SessionOverviewHeader } from "./components/session-overview-header";
import { groupSessionExercises, type SessionDisplayExercise } from "../lib/session-visualization";

type Section = "archive" | "builder" | "agenda" | "physical" | "goalkeepers";
type ExerciseDraft = Omit<Exercise, "id" | "category" | "subcategory" | "physical_mappings">;

const emptyExercise: ExerciseDraft = {
  codice: "", nome: "", category_id: 1, subcategory_id: 1,
  categoria: "Tecnica presa alta e rasoterra", sottocategoria: "Presa alta analitica", fase: "Analitico",
  obiettivo: "", descrizione: "", durata_min: 12, portieri_min: 1, portieri_max: 4,
  intensita: "Media", difficolta: 1, materiale: "", variante: null,
  coaching_points: "", errori_comuni: "", schema_step_1: null, schema_step_2: null,
  schema_step_3: null, schema_step_4: null, schema_step_5: null,
  schema_step_6: null,
  scenario_gara: null, numero_azioni: null,
  schema_url: null, foto_url: null, attivo: true,
};

const catalogPhases: CatalogPhase[] = ["Analitico", "Disturbo", "Situazionale", "Integrato guidato", "Integrato variabile", "Situazionale complesso", "Scenario aperto"];
const exerciseIntensities: Exercise["intensita"][] = ["Bassa", "Bassa-Media", "Media", "Media-Alta", "Alta"];
const exerciseDifficulties: ExerciseDifficulty[] = [1, 2, 3, 4, 5];

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

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  if (typeof error === "string") return error;
  return "errore sconosciuto";
}

function cleanSubcategoryLabel(value: string) {
  const specialNames: Record<string, string> = {
    "Presa alta con intervento attivo": "Presa alta",
    "Presa bassa con intervento attivo": "Presa rasoterra",
    "Deviazione con intervento attivo": "Deviazione",
  };
  const withoutDuplicate = value.replace(/\s+2$/i, "");
  const withoutPhase = withoutDuplicate
    .replace(/\s+analitic[oa]$/i, "")
    .replace(/\s+con disturbo$/i, "")
    .replace(/\s+disturbo$/i, "")
    .replace(/\s+situazionale$/i, "")
    .trim();
  const normalized = withoutPhase === "Presa rimbalzo" ? "Presa con rimbalzo" : withoutPhase;
  return specialNames[normalized] ?? normalized;
}

function catalogPhaseFromMethodological(phase: ExerciseSubcategory["fase"]): CatalogPhase {
  return phase === "Generale" ? "Analitico" : phase;
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
  const physicalMappings = Array.isArray(record.physical_mappings)
    ? record.physical_mappings.map(rawMapping => {
      const mapping = rawMapping as Record<string, unknown>;
      const relatedObjective = Array.isArray(mapping.physical_objective) ? mapping.physical_objective[0] : mapping.physical_objective;
      return { ...mapping, peso: Number(mapping.peso), physical_objective: relatedObjective } as ExercisePhysicalObjective;
    }).filter(mapping => mapping.attivo && mapping.physical_objective).sort((a, b) => b.peso - a.peso)
    : [];
  const rawPhase = String(record.fase ?? relatedPhase ?? "Analitico") as CatalogPhase;
  const fase: CatalogPhase = catalogPhases.includes(rawPhase) ? rawPhase : "Analitico";
  const rawIntensity = String(record.intensita ?? "Media") as Exercise["intensita"];
  return {
    ...record,
    categoria: String(record.categoria ?? category?.nome ?? record.legacy_category ?? "Categoria da definire"),
    sottocategoria: cleanSubcategoryLabel(String(record.sottocategoria ?? subcategory?.nome ?? record.legacy_subcategory ?? "Sottocategoria da definire")),
    fase,
    portieri_min: Number(record.portieri_min ?? record.numero_portieri_min ?? 1),
    portieri_max: Number(record.portieri_max ?? record.numero_portieri_max ?? 1),
    intensita: exerciseIntensities.includes(rawIntensity) ? rawIntensity : "Media",
    difficolta: (exerciseDifficulties.includes(Number(record.difficolta) as ExerciseDifficulty) ? Number(record.difficolta) : 1) as ExerciseDifficulty,
    coaching_points: String(record.coaching_points ?? "Da completare."),
    errori_comuni: String(record.errori_comuni ?? "Da completare."),
    schema_step_1: record.schema_step_1 ? String(record.schema_step_1) : null,
    schema_step_2: record.schema_step_2 ? String(record.schema_step_2) : null,
    schema_step_3: record.schema_step_3 ? String(record.schema_step_3) : null,
    schema_step_4: record.schema_step_4 ? String(record.schema_step_4) : null,
    schema_step_5: record.schema_step_5 ? String(record.schema_step_5) : null,
    schema_step_6: record.schema_step_6 ? String(record.schema_step_6) : null,
    scenario_gara: record.scenario_gara ? String(record.scenario_gara) : null,
    numero_azioni: record.numero_azioni ? String(record.numero_azioni) : null,
    schema_url: (record.schema_url ?? record.immagine_url ?? null) as string | null,
    foto_url: (record.foto_url ?? null) as string | null,
    category: category ?? undefined,
    subcategory: subcategory ?? undefined,
    physical_mappings: physicalMappings,
  } as Exercise;
}

export function KeeperApp() {
  const [section, setSection] = useState<Section>("agenda");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseCategories, setExerciseCategories] = useState<ExerciseCategory[]>([]);
  const [exerciseSubcategories, setExerciseSubcategories] = useState<ExerciseSubcategory[]>([]);
  const [physicalObjectives, setPhysicalObjectives] = useState<PhysicalObjective[]>([]);
  const [physicalAssessmentDimensions, setPhysicalAssessmentDimensions] = useState<PhysicalAssessmentDimension[]>([]);
  const [goalkeepers, setGoalkeepers] = useState<Goalkeeper[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [season, setSeason] = useState<Season | null>(null);
  const [seasonPhases, setSeasonPhases] = useState<SeasonPhaseConfig[]>([]);
  const [seasonRecall, setSeasonRecall] = useState<SeasonRecallPeriod | null>(null);
  const [seasonProfiles, setSeasonProfiles] = useState<SeasonTrainingProfile[]>([]);
  const [seasonMatches, setSeasonMatches] = useState<SeasonMatch[]>([]);
  const [calendarExceptions, setCalendarExceptions] = useState<CalendarException[]>([]);
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [seasonBusy, setSeasonBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | "all">("all");
  const [phaseFilter, setPhaseFilter] = useState<CatalogPhase | "all">("all");
  const [intensityFilter, setIntensityFilter] = useState<Exercise["intensita"] | "all">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<ExerciseDifficulty | "all">("all");
  const [physicalObjectiveFilter, setPhysicalObjectiveFilter] = useState<string | "all">("all");
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [selectedPhysicalObjectiveId, setSelectedPhysicalObjectiveId] = useState("");
  const [session, setSession] = useState<Exercise[]>([]);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("Automatico");
  const [selectedGoalkeeperIds, setSelectedGoalkeeperIds] = useState<string[]>([]);
  const [sessionProfile, setSessionProfile] = useState<SessionProfile | null>(null);
  const [technicalRanking, setTechnicalRanking] = useState<PriorityRankingItem[]>([]);
  const [physicalRanking, setPhysicalRanking] = useState<PriorityRankingItem[]>([]);
  const [technicalFocusId, setTechnicalFocusId] = useState<number | null>(null);
  const [technicalSecondaryFocusId, setTechnicalSecondaryFocusId] = useState<number | null>(null);
  const [physicalFocusId, setPhysicalFocusId] = useState<string | null>(null);
  const [sessionBlocks, setSessionBlocks] = useState<SessionBlock[]>([]);
  const [generatedExercises, setGeneratedExercises] = useState<EditableGeneratedSession | null>(null);
  const [sessionQuality, setSessionQuality] = useState<SessionQualityResult | null>(null);
  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [replacementTarget, setReplacementTarget] = useState<EditableExerciseSelection | null>(null);
  const [replacementCandidates, setReplacementCandidates] = useState<ScoredExerciseCandidate[]>([]);
  const [manualPickerBlock, setManualPickerBlock] = useState<number | null>(null);
  const [variantTarget, setVariantTarget] = useState<EditableExerciseSelection | null>(null);
  const [duration, setDuration] = useState(60);
  const [keepers, setKeepers] = useState(3);
  const [date, setDate] = useState(dateKey(new Date()));
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingExercise, setEditingExercise] = useState<Exercise | "new" | null>(null);
  const [openTraining, setOpenTraining] = useState<Training | null>(null);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [openExercise, setOpenExercise] = useState<Exercise | null>(null);
  const [sessionExerciseDetail, setSessionExerciseDetail] = useState<{ exercise: Exercise; plannedDuration: number; variants: TrainingExerciseVariant[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkImageOpen, setBulkImageOpen] = useState(false);
  const [seasonSettingsOpen, setSeasonSettingsOpen] = useState(false);
  const [openCalendarDay, setOpenCalendarDay] = useState<CalendarDay | null>(null);

  const loadExercises = useCallback(async () => {
    if (!supabase) return;
    let { data, error } = await supabase.from("exercises").select("*, category:exercise_categories(*), subcategory:exercise_subcategories(*), physical_mappings:exercise_physical_objectives(id,exercise_id,physical_objective_id,ruolo,peso,motivazione,attivo,physical_objective:physical_objectives(*))").order("codice");
    if (error) {
      const legacyResult = await supabase.from("exercises").select("*, category:exercise_categories(*), subcategory:exercise_subcategories(*)").order("codice");
      data = legacyResult.data as typeof data;
      error = legacyResult.error;
    }
    if (error) setToast(`Archivio non disponibile: ${error.message}`);
    else {
      const normalized = (data ?? []).map(item => normalizeExercise(item as Record<string, unknown>));
      setExercises(normalized);
      setOpenExercise(current => current ? normalized.find(item => item.id === current.id) ?? current : null);
      setEditingExercise(current => current && current !== "new" ? normalized.find(item => item.id === current.id) ?? current : current);
    }
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

  const loadPhysicalObjectives = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("physical_objectives").select("*").eq("attivo", true).order("codice");
    if (!error) setPhysicalObjectives((data ?? []) as PhysicalObjective[]);
  }, []);

  const loadGoalkeepers = useCallback(async () => {
    if (!supabase) return;
    const [goalkeeperResult, dimensionResult] = await Promise.all([
      supabase.from("goalkeepers").select("*, assessments:goalkeeper_assessments(id,goalkeeper_id,data_valutazione,note_generali,created_at,items:goalkeeper_assessment_items(id,assessment_id,tipo,exercise_category_id,physical_dimension_id,score,nota,category:exercise_categories(id,nome,attivo),physical_dimension:physical_assessment_dimensions(id,codice,nome,descrizione,ordine,attivo,objective_mappings:physical_assessment_dimension_objectives(peso,physical_objective:physical_objectives(*)))))").order("cognome").order("nome"),
      supabase.from("physical_assessment_dimensions").select("*, objective_mappings:physical_assessment_dimension_objectives(peso,physical_objective:physical_objectives(*))").eq("attivo", true).order("ordine"),
    ]);
    if (goalkeeperResult.error || dimensionResult.error) {
      setGoalkeepers([]); setPhysicalAssessmentDimensions([]);
      return;
    }
    const normalized = (goalkeeperResult.data ?? []).map(raw => {
      const goalkeeper = raw as unknown as Goalkeeper;
      const assessments = [...(goalkeeper.assessments ?? [])].map(assessment => ({
        ...assessment,
        items: (assessment.items ?? []).map(item => ({
          ...item, score: Number(item.score),
          category: Array.isArray(item.category) ? item.category[0] ?? null : item.category ?? null,
          physical_dimension: Array.isArray(item.physical_dimension) ? item.physical_dimension[0] ?? null : item.physical_dimension ?? null,
        })),
      })).sort((a, b) => b.data_valutazione.localeCompare(a.data_valutazione) || b.created_at.localeCompare(a.created_at));
      return { ...goalkeeper, assessments };
    });
    setGoalkeepers(normalized);
    setPhysicalAssessmentDimensions((dimensionResult.data ?? []) as unknown as PhysicalAssessmentDimension[]);
  }, []);

  const loadTrainings = useCallback(async () => {
    if (!supabase) return;
    let { data, error } = await supabase
      .from("trainings")
      .select("id, training_date, planned_duration_minutes, goalkeeper_count, notes, status, physical_objective_id, season_id, calendar_day_id, season_phase_id, session_number, session_type, technical_objective_primary, technical_objective_secondary, planned_load, match_day_offset, athletic_recall, generated_by_calendar, content_status, generation_mode, focus_source, technical_focus_primary_category_id, technical_focus_secondary_category_id, physical_focus_dimension_id, session_profile_code, session_profile_snapshot, technical_ranking_snapshot, physical_ranking_snapshot, generation_reason_snapshot,session_generation_snapshot,current_quality_snapshot,regeneration_count,revision_number,confirmed_at, physical_objective:physical_objectives(*), training_objectives(objective), training_exercises(id, position, planned_duration_minutes, notes,training_block_id,block_position,exercise_score,selection_snapshot,fallback_level,individual_variant_suggestion,locked,source,replacement_reason,replacement_note,variants:training_exercise_goalkeeper_variants(training_exercise_id,goalkeeper_id,tipo,variante_individuale,motivazione,priority_source,difficolta_delta,note), exercise:exercises(*)), training_goalkeepers(goalkeeper_id,individual_focus), training_blocks(id,training_id,tipo_blocco,ordine,durata_target,fase_metodologica_preferita,carico_target,technical_category_id,physical_dimension_id,notes,transition_minutes,regeneration_count)")
      .order("training_date");
    if (error) {
      const legacyResult = await supabase
        .from("trainings")
        .select("id, training_date, planned_duration_minutes, goalkeeper_count, notes, status, training_objectives(objective), training_exercises(id, position, planned_duration_minutes, notes, exercise:exercises(*))")
        .order("training_date");
      data = legacyResult.data as typeof data;
      error = legacyResult.error;
    }
    if (error) setToast(`Agenda non disponibile: ${error.message}`);
    else {
      const normalized = (data ?? []).map(training => ({
        ...training,
        physical_objective_id: "physical_objective_id" in training ? training.physical_objective_id : null,
        physical_objective: "physical_objective" in training ? (Array.isArray(training.physical_objective) ? training.physical_objective[0] ?? null : training.physical_objective ?? null) : null,
        training_exercises: [...(training.training_exercises ?? [])].sort((a, b) => a.position - b.position).map(item => ({
          ...item,
          exercise_score: "exercise_score" in item && item.exercise_score !== null ? Number(item.exercise_score) : null,
          exercise: item.exercise ? normalizeExercise(item.exercise as unknown as Record<string, unknown>) : item.exercise,
        })),
        training_blocks: "training_blocks" in training && Array.isArray(training.training_blocks) ? [...training.training_blocks].sort((a, b) => Number(a.ordine) - Number(b.ordine)) : [],
        training_goalkeepers: "training_goalkeepers" in training && Array.isArray(training.training_goalkeepers) ? training.training_goalkeepers : [],
      }));
      setTrainings(normalized as unknown as Training[]);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    if (!supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { data, error } = await supabase.from("app_settings").select("*").eq("owner_id", authData.user.id).maybeSingle();
    if (error) return;
    const next = (data ?? { ...defaultSettings, id: authData.user.id, owner_id: authData.user.id, account_email: authData.user.email ?? "" }) as AppSettings;
    setSettings(next);
    setDuration(next.default_duration_minutes);
    setKeepers(next.default_goalkeeper_count);
  }, []);

  const loadSeasonCalendar = useCallback(async () => {
    if (!supabase) return;
    const seasonResult = await supabase.from("seasons").select("*").eq("attiva", true).maybeSingle();
    if (seasonResult.error) {
      setSeason(null); setSeasonPhases([]); setSeasonRecall(null); setSeasonProfiles([]); setSeasonMatches([]); setCalendarExceptions([]); setCalendarDays([]);
      return;
    }
    const activeSeason = seasonResult.data as Season | null;
    setSeason(activeSeason);
    if (!activeSeason) { setSeasonPhases([]); setSeasonRecall(null); setSeasonProfiles([]); setSeasonMatches([]); setCalendarExceptions([]); setCalendarDays([]); return; }
    const [phaseResult, recallResult, profileResult, matchResult, exceptionResult, dayResult] = await Promise.all([
      supabase.from("season_phases").select("*").eq("season_id", activeSeason.id).order("data_inizio"),
      supabase.from("season_recall_periods").select("*").eq("season_id", activeSeason.id).eq("attivo", true).order("data_inizio").limit(1).maybeSingle(),
      supabase.from("season_training_profiles").select("*").eq("season_id", activeSeason.id).eq("attivo", true).order("match_day_offset"),
      supabase.from("matches").select("*").eq("season_id", activeSeason.id).eq("attiva", true).order("data"),
      supabase.from("calendar_exceptions").select("*").eq("season_id", activeSeason.id).order("data"),
      supabase.from("calendar_days").select("*, phase:season_phases(*), match:matches(*), profile:season_training_profiles(*)").eq("season_id", activeSeason.id).eq("attiva", true).order("data"),
    ]);
    setSeasonPhases((phaseResult.data ?? []) as SeasonPhaseConfig[]);
    setSeasonRecall((recallResult.data ?? null) as SeasonRecallPeriod | null);
    setSeasonProfiles((profileResult.data ?? []) as SeasonTrainingProfile[]);
    setSeasonMatches((matchResult.data ?? []) as SeasonMatch[]);
    setCalendarExceptions((exceptionResult.data ?? []) as CalendarException[]);
    setCalendarDays((dayResult.data ?? []).map(raw => {
      const item = raw as Record<string, unknown>;
      const one = <T,>(value: unknown) => (Array.isArray(value) ? value[0] ?? null : value ?? null) as T | null;
      return { ...item, phase: one<SeasonPhaseConfig>(item.phase), match: one<SeasonMatch>(item.match), profile: one<SeasonTrainingProfile>(item.profile) } as CalendarDay;
    }));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void Promise.all([loadCatalog(), loadExercises(), loadPhysicalObjectives(), loadGoalkeepers(), loadTrainings(), loadSettings(), loadSeasonCalendar()]).finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadCatalog, loadExercises, loadPhysicalObjectives, loadGoalkeepers, loadTrainings, loadSettings, loadSeasonCalendar]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!generatedExercises) { setSessionQuality(null); return; }
      setSessionQuality(calculateSessionQuality({ selections: generatedExercises.selections, blocks: sessionBlocks, durationTarget: duration, goalkeeperCount: selectedGoalkeeperIds.length || keepers, technicalPrimaryId: technicalFocusId, technicalSecondaryId: technicalSecondaryFocusId }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [generatedExercises, sessionBlocks, duration, selectedGoalkeeperIds, keepers, technicalFocusId, technicalSecondaryFocusId]);

  const availableSubcategories = useMemo(() => Array.from(new Set(exerciseSubcategories.filter(item => item.fase !== "Generale" && (categoryFilter === "all" || item.category_id === categoryFilter)).map(item => cleanSubcategoryLabel(item.nome)))).sort((a, b) => a.localeCompare(b, "it")), [exerciseSubcategories, categoryFilter]);
  const objectives = useMemo(() => Array.from(new Set([...fallbackObjectives, ...exercises.map(item => item.obiettivo)])).filter(Boolean), [exercises]);
  const filtered = useMemo(() => exercises.filter(exercise => {
    const matchesSearch = exercise.nome.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === "all" || exercise.category_id === categoryFilter;
    const matchesSubcategory = subcategoryFilter === "all" || cleanSubcategoryLabel(exercise.sottocategoria) === subcategoryFilter;
    const matchesPhase = phaseFilter === "all" || exercise.fase === phaseFilter;
    const matchesIntensity = intensityFilter === "all" || exercise.intensita === intensityFilter;
    const matchesDifficulty = difficultyFilter === "all" || exercise.difficolta === difficultyFilter;
    const matchesPhysicalObjective = physicalObjectiveFilter === "all" || exercise.physical_mappings?.some(mapping => mapping.physical_objective_id === physicalObjectiveFilter && mapping.attivo);
    return exercise.attivo && matchesSearch && matchesCategory && matchesSubcategory && matchesPhase && matchesIntensity && matchesDifficulty && matchesPhysicalObjective;
  }).sort((a, b) => {
    if (physicalObjectiveFilter !== "all") {
      const aWeight = a.physical_mappings?.find(mapping => mapping.physical_objective_id === physicalObjectiveFilter)?.peso ?? 0;
      const bWeight = b.physical_mappings?.find(mapping => mapping.physical_objective_id === physicalObjectiveFilter)?.peso ?? 0;
      if (aWeight !== bWeight) return bWeight - aWeight;
    }
    return a.codice.localeCompare(b.codice, "it");
  }), [exercises, search, categoryFilter, subcategoryFilter, phaseFilter, intensityFilter, difficultyFilter, physicalObjectiveFilter]);
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

  function generateSessionPlan() {
    const day = calendarDays.find(item => item.data === date);
    const selectedGoalkeepers = goalkeepers.filter(item => selectedGoalkeeperIds.includes(item.id));
    const preseason = day?.phase?.tipo === "Pre-campionato";
    const profile = buildSessionProfile({ matchDayOffset: day?.match_day_offset ?? null, preseason, athleticRecall: day?.richiamo_atletico ?? false, plannedLoad: day?.carico_previsto ?? null, duration });
    const categoryUsage: Record<number, number> = {}; const daysSinceUse: Record<number, number | null> = {};
    for (const category of exerciseCategories) {
      const usedDates = trainings.flatMap(training => [
        ...training.training_exercises.filter(item => item.exercise?.category_id === category.id).map(() => training.training_date),
        ...(training.training_blocks ?? []).filter(item => item.technical_category_id === category.id).map(() => training.training_date),
      ]).sort().reverse();
      categoryUsage[category.id] = usedDates.length;
      daysSinceUse[category.id] = usedDates.length ? Math.max(0, Math.floor((new Date(`${date}T12:00:00`).getTime() - new Date(`${usedDates[0]}T12:00:00`).getTime()) / 86_400_000)) : null;
    }
    const weekMonday = dateKey(mondayOf(new Date(`${date}T12:00:00`)));
    const weeklyPrimary = trainings.find(item => dateKey(mondayOf(new Date(`${item.training_date}T12:00:00`))) === weekMonday && item.technical_focus_primary_category_id)?.technical_focus_primary_category_id ?? null;
    const technical = rankTechnicalPriorities({ categories: exerciseCategories, goalkeepers: selectedGoalkeepers, matchDayOffset: profile.match_day_offset, usage: categoryUsage, daysSinceUse, weeklyPrimaryId: weeklyPrimary });
    const automaticTechnicalId = Number(technical[0]?.id) || null;
    const chosenTechnicalId = generationMode === "Manuale" && technicalFocusId ? technicalFocusId : automaticTechnicalId;
    const technicalLabel = exerciseCategories.find(item => item.id === chosenTechnicalId)?.nome;
    const physical = rankPhysicalPriorities({ dimensions: physicalAssessmentDimensions, goalkeepers: selectedGoalkeepers, matchDayOffset: profile.match_day_offset, preseason, athleticRecall: profile.athletic_recall, technicalFocusLabel: technicalLabel });
    const chosenPhysicalId = generationMode === "Manuale" && physicalFocusId ? physicalFocusId : physical[0]?.id ?? null;
    setSessionProfile(profile); setTechnicalRanking(technical); setPhysicalRanking(physical);
    setTechnicalFocusId(chosenTechnicalId); setTechnicalSecondaryFocusId(Number(technical.find(item => Number(item.id) !== chosenTechnicalId)?.id) || null); setPhysicalFocusId(chosenPhysicalId);
    setSessionBlocks(buildSessionBlocks(profile, chosenTechnicalId, chosenPhysicalId));
    setGeneratedExercises(null);
    if (selectedGoalkeepers.length) setKeepers(selectedGoalkeepers.length);
    setToast("Priorità e quattro blocchi calcolati");
  }

  function generateExercisePlan() {
    if (!sessionProfile || sessionBlocks.length !== 4 || !technicalFocusId) { setToast("Completa prima profilo, focus e blocchi"); return; }
    const result = makeEditableSession(selectSessionExercises(buildExerciseSelectionInput()));
    setGeneratedExercises(result); setRegenerationCount(0); setSessionConfirmed(false);
    setToast(result.selections.length ? `${result.selections.length} esercizi selezionati dal catalogo` : "Nessun candidato sicuro: controlla portieri e blocchi");
  }

  function buildExerciseSelectionInput() {
    if (!sessionProfile) throw new Error("Profilo seduta non disponibile");
    const history = trainings.filter(training => training.id !== editingTrainingId).flatMap(training => training.training_exercises.map(item => ({ exercise_id: item.exercise.id, training_date: training.training_date, season_id: training.season_id })));
    return { seed: editingTrainingId ?? `${date}:${season?.id ?? "no-season"}`, date, seasonId: season?.id, profile: sessionProfile, goalkeeperCount: selectedGoalkeeperIds.length || keepers, exercises, blocks: sessionBlocks, technicalPrimaryId: technicalFocusId, technicalSecondaryId: technicalSecondaryFocusId, physicalPrimaryId: physicalFocusId, physicalDimensions: physicalAssessmentDimensions, history, technicalPriorities: technicalRanking, physicalPriorities: physicalRanking };
  }

  function updateGeneratedSelections(selections: EditableExerciseSelection[]) {
    setGeneratedExercises(current => current ? { ...current, selections, net_minutes: selections.reduce((sum,item)=>sum+item.planned_duration_minutes,0), total_minutes: selections.reduce((sum,item)=>sum+item.planned_duration_minutes,0)+current.transition_minutes } : current);
  }

  function toggleExerciseLock(id:string){if(!generatedExercises)return;updateGeneratedSelections(generatedExercises.selections.map(x=>x.exercise.id===id?{...x,locked:!x.locked}:x));}
  function changePlannedDuration(id:string,value:number){if(!generatedExercises)return;updateGeneratedSelections(generatedExercises.selections.map(x=>x.exercise.id===id?{...x,planned_duration_minutes:Math.max(5,value)}:x));}
  function removeGeneratedExercise(id:string){if(!generatedExercises||!window.confirm("Rimuovere questo esercizio dalla seduta?"))return;updateGeneratedSelections(generatedExercises.selections.filter(x=>x.exercise.id!==id));}
  function moveGeneratedExercise(id:string,direction:-1|1){if(!generatedExercises)return;const list=[...generatedExercises.selections];const index=list.findIndex(x=>x.exercise.id===id);if(index<0)return;const same=list.filter(x=>x.block_order===list[index].block_order);const local=same.findIndex(x=>x.exercise.id===id);const swap=same[local+direction];if(!swap)return;const other=list.findIndex(x=>x.exercise.id===swap.exercise.id);[list[index],list[other]]=[list[other],list[index]];updateGeneratedSelections(list.map((x)=>({...x,block_position:list.filter(y=>y.block_order===x.block_order).indexOf(x)})));}
  function regenerateOneBlock(order:number){if(!generatedExercises||!window.confirm("Rigenerare gli esercizi non bloccati di questo blocco?"))return;const next=regenerateBlock(buildExerciseSelectionInput(),generatedExercises,order,regenerationCount+1);setRegenerationCount(x=>x+1);setGeneratedExercises(next);}
  function regenerateAllExercises(){if(!generatedExercises||!window.confirm("Rigenerare tutti gli esercizi non bloccati della seduta?"))return;const next=regenerateSession(buildExerciseSelectionInput(),generatedExercises,regenerationCount+1);setRegenerationCount(x=>x+1);setGeneratedExercises(next);}
  function openReplacement(id:string){if(!generatedExercises)return;const target=generatedExercises.selections.find(x=>x.exercise.id===id);if(!target)return;setReplacementTarget(target);setReplacementCandidates(getReplacementCandidates(buildExerciseSelectionInput(),generatedExercises,target));}
  function applyReplacement(candidate:ScoredExerciseCandidate,reason:string,source:"replacement"|"manual"="replacement"){if(!generatedExercises||!replacementTarget)return;updateGeneratedSelections(generatedExercises.selections.map(x=>x.exercise.id===replacementTarget.exercise.id?{...candidate,block_order:x.block_order,block_position:x.block_position,planned_duration_minutes:x.planned_duration_minutes,individual_variant_suggestion:null,locked:false,source,replacement_reason:reason,replacement_note:null,variants:[]}:x));setReplacementTarget(null);setManualPickerBlock(null);}
  function addManualExercise(candidate:ScoredExerciseCandidate){if(!generatedExercises||manualPickerBlock===null)return;if(generatedExercises.selections.some(x=>x.exercise.id===candidate.exercise.id)){setToast("Esercizio già presente nella seduta");return;}const position=generatedExercises.selections.filter(x=>x.block_order===manualPickerBlock).length;const item={...candidate,block_order:manualPickerBlock,block_position:position,planned_duration_minutes:candidate.exercise.durata_min,individual_variant_suggestion:null,locked:false,source:"manual" as const,variants:[]};updateGeneratedSelections([...generatedExercises.selections,item]);setManualPickerBlock(null);setReplacementTarget(null);}
  function openVariants(id:string){const target=generatedExercises?.selections.find(x=>x.exercise.id===id);if(target)setVariantTarget(target);}
  function saveVariants(variants:TrainingExerciseVariant[]){if(!generatedExercises||!variantTarget)return;updateGeneratedSelections(generatedExercises.selections.map(x=>x.exercise.id===variantTarget.exercise.id?{...x,variants}:x));setVariantTarget(null);}
  function recalculateWholeSession(){if(!generatedExercises||!window.confirm("Ricalcolare priorità, focus e struttura? Gli esercizi bloccati resteranno visibili e andranno verificati."))return;const locked=generatedExercises.selections.filter(x=>x.locked);generateSessionPlan();setGeneratedExercises({...generatedExercises,selections:locked,net_minutes:locked.reduce((s,x)=>s+x.planned_duration_minutes,0),total_minutes:locked.reduce((s,x)=>s+x.planned_duration_minutes,0)+generatedExercises.transition_minutes});setToast("Priorità ricalcolate: rigenera i blocchi non bloccati");}

  async function saveSession() {
    if (!supabase) return;
    if (!generatedExercises?.selections.length) { setToast("Genera prima la preview completa"); return; }
    if (!sessionBlocks.every(block => generatedExercises.selections.some(item => item.block_order === block.ordine))) { setToast("La preview deve contenere tutti e quattro i blocchi"); return; }
    const currentTraining = editingTrainingId ? trainings.find(item => item.id === editingTrainingId) : null;
    if (!sessionProfile || sessionBlocks.length !== 4) { setToast("Calcola prima priorità e blocchi"); return; }
    const technicalFocus = exerciseCategories.find(item => item.id === technicalFocusId);
    const secondaryTechnicalFocus = exerciseCategories.find(item => item.id === technicalSecondaryFocusId);
    const physicalDimension = physicalAssessmentDimensions.find(item => item.id === physicalFocusId);
    const existingInitialSnapshot = currentTraining?.session_generation_snapshot && Object.keys(currentTraining.session_generation_snapshot).length ? currentTraining.session_generation_snapshot : null;
    const initialSnapshot = existingInitialSnapshot ?? { profile: sessionProfile, technical_ranking: technicalRanking, physical_ranking: physicalRanking, technical_primary: technicalFocusId, technical_secondary: technicalSecondaryFocusId, physical_primary: physicalFocusId, quality: sessionQuality, exercises: generatedExercises.selections.map(x=>({exercise_id:x.exercise.id,code:x.exercise.codice,block_order:x.block_order,score:x.exercise_score,duration:x.planned_duration_minutes})), seed:generatedExercises.seed };
    const trainingPayload = {
      training_date: date,
      planned_duration_minutes: duration,
      goalkeeper_count: keepers,
      status: sessionConfirmed ? "confirmed" : "draft",
      physical_objective_id: selectedPhysicalObjectiveId || currentTraining?.physical_objective_id || null,
      technical_objective_primary: technicalFocus?.nome ?? currentTraining?.technical_objective_primary ?? null,
      technical_objective_secondary: secondaryTechnicalFocus?.nome ?? currentTraining?.technical_objective_secondary ?? null,
      content_status: "compiled",
      generation_mode: generationMode,
      focus_source: generationMode,
      technical_focus_primary_category_id: technicalFocusId,
      technical_focus_secondary_category_id: technicalSecondaryFocusId,
      physical_focus_dimension_id: physicalFocusId,
      session_profile_code: sessionProfile.code,
      session_profile_snapshot: sessionProfile,
      technical_ranking_snapshot: technicalRanking,
      physical_ranking_snapshot: physicalRanking,
      generation_reason_snapshot: { technical: technicalRanking[0]?.reason, physical: physicalRanking[0]?.reason, physical_label: physicalDimension?.nome },
      session_generation_snapshot: initialSnapshot,
      current_quality_snapshot: sessionQuality ?? {},
      regeneration_count: regenerationCount,
      revision_number: editingTrainingId ? (currentTraining?.revision_number ?? 1) + 1 : 1,
      confirmed_at: sessionConfirmed ? new Date().toISOString() : currentTraining?.confirmed_at ?? null,
    };
    const saveResult = editingTrainingId
      ? await supabase.from("trainings").update(trainingPayload).eq("id", editingTrainingId).select("id").single()
      : await supabase.from("trainings").insert(trainingPayload).select("id").single();
    const { data: training, error } = saveResult;
    if (error || !training) { setToast(`Salvataggio non riuscito: ${error?.message ?? "errore sconosciuto"}`); return; }

    if (editingTrainingId) {
      const cleanup = await Promise.all([
        supabase.from("training_goalkeepers").delete().eq("training_id", training.id),
        Promise.resolve({ error: null }),
      ]);
      if (cleanup.some(result => result.error)) { setToast("La seduta non è stata aggiornata completamente"); return; }
    }

    const [objectiveResult, exerciseResult] = await Promise.all([
      selectedGoalkeeperIds.length ? supabase.from("training_goalkeepers").insert(selectedGoalkeeperIds.map(goalkeeperId => ({ training_id: training.id, goalkeeper_id: goalkeeperId }))) : Promise.resolve({ error: null }),
      supabase.from("training_blocks").upsert(sessionBlocks.map(block => ({ ...block, training_id: training.id })), { onConflict: "training_id,ordine" }),
    ]);
    if (objectiveResult.error || exerciseResult.error) {
      if (!editingTrainingId) await supabase.from("trainings").delete().eq("id", training.id);
      setToast("La seduta non è stata salvata completamente");
      return;
    }
    const savedBlocks = await supabase.from("training_blocks").select("id,ordine").eq("training_id", training.id).order("ordine");
    if (savedBlocks.error || !savedBlocks.data?.length) { setToast("Blocchi salvati, ma associazione esercizi non disponibile"); return; }
    const blockIds = new Map(savedBlocks.data.map(block => [Number(block.ordine), block.id]));
    const exerciseItems = generatedExercises.selections.map((selection, position) => ({
      exercise_id: selection.exercise.id, position, planned_duration_minutes: selection.planned_duration_minutes,
      training_block_id: blockIds.get(selection.block_order), block_position: selection.block_position,
      exercise_score: selection.exercise_score, fallback_level: selection.fallback_level,
      individual_variant_suggestion: selection.individual_variant_suggestion,
      locked: selection.locked, source: selection.source, replacement_reason: selection.replacement_reason ?? null, replacement_note: selection.replacement_note ?? null,
      selection_snapshot: { version: "fase3-v1", seed: generatedExercises.seed, exercise_code: selection.exercise.codice, exercise_name: selection.exercise.nome, block_order: selection.block_order, exercise_score: selection.exercise_score, breakdown: selection.breakdown, group_weakness_bonus: selection.group_weakness_bonus, similarity_penalty: selection.similarity_penalty, usage: selection.usage, reasons: selection.reasons, penalties: selection.penalties, fallback_level: selection.fallback_level, session_profile: sessionProfile },
    }));
    const generatedResult = await supabase.rpc("replace_generated_training_exercises", { requested_training_id: training.id, requested_items: exerciseItems });
    if (generatedResult.error) { setToast(`Esercizi non salvati: ${generatedResult.error.message}`); return; }
    const savedExercises = await supabase.from("training_exercises").select("id,exercise_id").eq("training_id",training.id);
    if(!savedExercises.error){const variants=generatedExercises.selections.flatMap(selection=>(selection.variants??[]).map(variant=>({...variant,training_exercise_id:savedExercises.data?.find(row=>row.exercise_id===selection.exercise.id)?.id}))).filter(item=>item.training_exercise_id);if(variants.length)await supabase.from("training_exercise_goalkeeper_variants").upsert(variants,{onConflict:"training_exercise_id,goalkeeper_id"});}
    await loadTrainings();
    setToast(editingTrainingId ? "Seduta aggiornata" : "Allenamento salvato nell’agenda");
    setEditingTrainingId(null);
    setSection("agenda");
  }

  function startNewTraining() {
    setSeasonSettingsOpen(false);
    setEditingTrainingId(null);
    setDate(dateKey(new Date()));
    setDuration(settings.default_duration_minutes);
    setKeepers(settings.default_goalkeeper_count);
    setSelectedObjectives([]);
    setSelectedPhysicalObjectiveId("");
    setSession([]);
    setGenerationMode("Automatico");
    setSelectedGoalkeeperIds(goalkeepers.filter(item => item.attivo).map(item => item.id));
    setSessionProfile(null); setTechnicalRanking([]); setPhysicalRanking([]);
    setTechnicalFocusId(null); setTechnicalSecondaryFocusId(null); setPhysicalFocusId(null); setSessionBlocks([]); setGeneratedExercises(null); setSessionQuality(null); setSessionConfirmed(false); setRegenerationCount(0);
    setSection("builder");
  }

  function startEditTraining(training: Training) {
    setEditingTrainingId(training.id);
    setDate(training.training_date);
    setDuration(training.planned_duration_minutes);
    setKeepers(training.goalkeeper_count);
    setSelectedObjectives(training.training_objectives.map(item => item.objective));
    setSelectedPhysicalObjectiveId(training.physical_objective_id ?? "");
    setSession(training.training_exercises.map(item => item.exercise).filter(Boolean));
    setGenerationMode(training.generation_mode ?? "Assistito");
    setSelectedGoalkeeperIds(training.training_goalkeepers?.map(item => item.goalkeeper_id) ?? []);
    setSessionProfile(training.session_profile_snapshot && "code" in training.session_profile_snapshot ? training.session_profile_snapshot as SessionProfile : null);
    setTechnicalRanking(training.technical_ranking_snapshot ?? []); setPhysicalRanking(training.physical_ranking_snapshot ?? []);
    setTechnicalFocusId(training.technical_focus_primary_category_id ?? null); setTechnicalSecondaryFocusId(training.technical_focus_secondary_category_id ?? null); setPhysicalFocusId(training.physical_focus_dimension_id ?? null);
    setSessionBlocks(training.training_blocks ?? []);
    const blocks=training.training_blocks??[];
    const selections=training.training_exercises.map(item=>{const snapshot=item.selection_snapshot??{};const block=blocks.find(b=>b.id===item.training_block_id);return{exercise:item.exercise,exercise_score:Number(item.exercise_score??snapshot.exercise_score??50),breakdown:(snapshot.breakdown??{technical_fit:50,physical_fit:50,methodological_fit:50,rotation_score:50,md_load_fit:50,practical_fit:50}) as EditableExerciseSelection["breakdown"],group_weakness_bonus:Number(snapshot.group_weakness_bonus??0),similarity_penalty:Number(snapshot.similarity_penalty??0),fallback_level:Number(item.fallback_level??0),usage:(snapshot.usage??{last_used_date:null,days_since_last_use:null,uses_this_season:0,uses_last_30_days:0,uses_last_14_days:0,uses_last_7_days:0}) as EditableExerciseSelection["usage"],reasons:(snapshot.reasons??[]) as string[],penalties:(snapshot.penalties??[]) as string[],block_order:block?.ordine??Number(snapshot.block_order??1),block_position:Number(item.block_position??0),planned_duration_minutes:item.planned_duration_minutes,individual_variant_suggestion:item.individual_variant_suggestion??null,session_exercise_id:item.id,locked:Boolean(item.locked),source:item.source??"legacy",replacement_reason:item.replacement_reason??null,replacement_note:item.replacement_note??null,variants:item.variants??[]};});
    const transitions=blocks.reduce((s,b)=>s+(b.transition_minutes??2),0);const net=selections.reduce((s,x)=>s+x.planned_duration_minutes,0);setGeneratedExercises(selections.length?{seed:String(training.session_generation_snapshot?.seed??training.id),selections,debug:{},net_minutes:net,transition_minutes:transitions,total_minutes:net+transitions}:null);
    setSessionConfirmed(training.status==="confirmed");setRegenerationCount(training.regeneration_count??0);setSessionQuality(training.current_quality_snapshot&&"score" in training.current_quality_snapshot?training.current_quality_snapshot as SessionQualityResult:null);
    setOpenTraining(null);
    setSection("builder");
  }

  async function deleteTraining(training: Training) {
    if (!supabase || !window.confirm("Eliminare definitivamente questa seduta?")) return;
    const { error } = await supabase.from("trainings").delete().eq("id", training.id);
    if (error) {
      setToast(`Seduta non eliminata: ${error.message}`);
      return;
    }
    setOpenTraining(null);
    await loadTrainings();
    setToast("Seduta eliminata dall’agenda");
  }

  async function saveSeasonConfiguration(configuration: SeasonConfiguration) {
    if (!supabase) return null;
    setSeasonBusy(true);
    try {
      let seasonId = configuration.season.id || season?.id;
      const seasonPayload = { nome_stagione: configuration.season.nome_stagione, data_inizio: configuration.season.data_inizio, data_fine: configuration.season.data_fine, squadra: configuration.season.squadra, numero_portieri_standard: configuration.season.numero_portieri_standard, attiva: true };
      if (seasonId) {
        const { error } = await supabase.from("seasons").update(seasonPayload).eq("id", seasonId);
        if (error) throw error;
      } else {
        await supabase.from("seasons").update({ attiva: false }).eq("attiva", true);
        const { data, error } = await supabase.from("seasons").insert(seasonPayload).select("id").single();
        if (error || !data) throw error ?? new Error("Stagione non creata");
        seasonId = data.id;
      }
      const phasePayload = configuration.phases.map(item => {
        const { id, ...values } = item;
        return id ? { ...values, id, season_id: seasonId } : { ...values, season_id: seasonId };
      });
      const phaseResult = await supabase.from("season_phases").upsert(phasePayload, { onConflict: "season_id,tipo" });
      if (phaseResult.error) throw phaseResult.error;
      const { id: recallId, ...recallValues } = configuration.recall;
      const recallPayload = recallId ? { ...recallValues, id: recallId, season_id: seasonId } : { ...recallValues, season_id: seasonId };
      const recallResult = await supabase.from("season_recall_periods").upsert(recallPayload, { onConflict: "season_id" });
      if (recallResult.error) throw recallResult.error;
      const profilePayload = configuration.profiles.map(item => {
        const { id, ...values } = item;
        return id ? { ...values, id, season_id: seasonId } : { ...values, season_id: seasonId };
      });
      const profileResult = await supabase.from("season_training_profiles").upsert(profilePayload, { onConflict: "season_id,match_day_offset" });
      if (profileResult.error) throw profileResult.error;
      await loadSeasonCalendar();
      setToast("Impostazioni stagione salvate");
      return seasonId ?? null;
    } catch (error) {
      setToast(`Impostazioni non salvate: ${readableError(error)}`);
      return null;
    } finally { setSeasonBusy(false); }
  }

  async function generateSeasonAgenda(requestedSeasonId?: string) {
    const seasonId = requestedSeasonId || season?.id;
    if (!supabase || !seasonId) { setToast("Salva prima le impostazioni stagione"); return; }
    setSeasonBusy(true);
    try {
      const preview = await supabase.rpc("preview_season_agenda", { requested_season_id: seasonId });
      if (preview.error) throw preview.error;
      const values = preview.data as Record<string, number>;
      const confirmed = window.confirm(`Aggiornare l’agenda?\n\nGiornate vuote rigenerabili: ${values.giornate_vuote_rigenerabili ?? 0}\nSedute compilate preservate: ${values.sedute_compilate_preservate ?? 0}\nGare manuali preservate: ${values.gare_manuali_preservate ?? 0}\nEccezioni preservate: ${values.eccezioni_preservate ?? 0}`);
      if (!confirmed) return;
      const result = await supabase.rpc("generate_season_agenda", { requested_season_id: seasonId });
      if (result.error) throw result.error;
      await Promise.all([loadSeasonCalendar(), loadTrainings()]);
      setToast("Agenda stagione generata e sedute compilate preservate");
      setSeasonSettingsOpen(false);
    } catch (error) {
      setToast(`Agenda non generata: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
    } finally { setSeasonBusy(false); }
  }

  async function saveSeasonMatch(match: Partial<SeasonMatch> & Pick<SeasonMatch, "data" | "tipo">) {
    if (!supabase || !season) { setToast("Salva prima la stagione"); return; }
    const payload = { season_id: season.id, data: match.data, tipo: match.tipo, avversario: match.avversario || null, casa_trasferta: match.casa_trasferta || null, note: match.note || null, origine: "Manuale", bloccata: true, attiva: true };
    const result = match.id ? await supabase.from("matches").update(payload).eq("id", match.id) : await supabase.from("matches").insert(payload);
    if (result.error) setToast(`Gara non salvata: ${result.error.message}`); else { await loadSeasonCalendar(); setToast("Gara salvata"); }
  }

  async function deleteSeasonMatch(match: SeasonMatch) {
    if (!supabase || match.origine !== "Manuale" || !window.confirm("Rimuovere questa gara manuale?")) return;
    const { error } = await supabase.from("matches").delete().eq("id", match.id);
    if (error) setToast(`Gara non rimossa: ${error.message}`); else { await loadSeasonCalendar(); setToast("Gara rimossa"); }
  }

  async function saveCalendarException(exception: Partial<CalendarException> & Pick<CalendarException, "data" | "tipo_giornata">) {
    if (!supabase || !season) { setToast("Salva prima la stagione"); return; }
    const { error } = await supabase.from("calendar_exceptions").upsert({ season_id: season.id, data: exception.data, tipo_giornata: exception.tipo_giornata, durata_prevista: exception.durata_prevista ?? null, carico_previsto: exception.carico_previsto ?? null, numero_portieri_previsti: exception.numero_portieri_previsti ?? null, note: exception.note || null }, { onConflict: "season_id,data" });
    if (error) { setToast(`Eccezione non salvata: ${error.message}`); return; }
    await supabase.rpc("generate_season_agenda", { requested_season_id: season.id });
    await Promise.all([loadSeasonCalendar(), loadTrainings()]);
    setOpenCalendarDay(null); setToast("Eccezione applicata alla singola giornata");
  }

  async function deleteCalendarException(exception: CalendarException) {
    if (!supabase || !season || !window.confirm("Rimuovere questa eccezione?")) return;
    const { error } = await supabase.from("calendar_exceptions").delete().eq("id", exception.id);
    if (error) { setToast(`Eccezione non rimossa: ${error.message}`); return; }
    await supabase.rpc("generate_season_agenda", { requested_season_id: season.id });
    await Promise.all([loadSeasonCalendar(), loadTrainings()]);
    setToast("Eccezione rimossa");
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

  async function saveExercisePhysicalMapping(exercise: Exercise, draft: PhysicalMappingDraft) {
    if (!supabase) return;
    const { error } = await supabase.rpc("set_exercise_physical_objective", {
      requested_exercise_id: exercise.id,
      requested_physical_objective_id: draft.physical_objective_id,
      requested_role: draft.ruolo,
      requested_weight: draft.peso,
      requested_reason: draft.motivazione,
      requested_active: true,
    });
    if (error) { setToast(`Associazione non salvata: ${error.message}`); return; }
    await loadExercises();
    setToast("Obiettivo fisico associato");
  }

  async function removeExercisePhysicalMapping(mapping: ExercisePhysicalObjective) {
    if (!supabase || !window.confirm("Rimuovere questo obiettivo fisico dall’esercizio?")) return;
    const { error } = await supabase.from("exercise_physical_objectives").delete().eq("id", mapping.id);
    if (error) { setToast(`Associazione non rimossa: ${error.message}`); return; }
    await loadExercises();
    setToast("Associazione rimossa");
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

  async function saveGoalkeeper(draft: GoalkeeperDraft, id?: string) {
    if (!supabase) return false;
    const payload = { ...draft, nome: draft.nome.trim(), cognome: draft.cognome.trim(), data_nascita: draft.data_nascita || null, note: draft.note || null };
    const result = id ? await supabase.from("goalkeepers").update(payload).eq("id", id) : await supabase.from("goalkeepers").insert(payload);
    if (result.error) { setToast(`Portiere non salvato: ${result.error.message}`); return false; }
    await loadGoalkeepers();
    setToast(id ? "Anagrafica portiere aggiornata" : "Portiere aggiunto");
    return true;
  }

  async function deactivateGoalkeeper(goalkeeper: Goalkeeper) {
    if (!supabase || !window.confirm(`Disattivare ${goalkeeper.nome} ${goalkeeper.cognome}? Lo storico resterà disponibile.`)) return;
    const { error } = await supabase.from("goalkeepers").update({ attivo: false }).eq("id", goalkeeper.id);
    if (error) { setToast(`Portiere non disattivato: ${error.message}`); return; }
    await loadGoalkeepers();
    setToast("Portiere disattivato senza eliminare lo storico");
  }

  async function saveGoalkeeperAssessment(goalkeeper: Goalkeeper, draft: GoalkeeperAssessmentDraft) {
    if (!supabase) return false;
    const { error } = await supabase.rpc("create_goalkeeper_assessment", {
      requested_goalkeeper_id: goalkeeper.id,
      requested_assessment_date: draft.data_valutazione,
      requested_general_notes: draft.note_generali,
      requested_items: draft.items.map(item => ({ ...item, score: Number(item.score.toFixed(1)) })),
    });
    if (error) { setToast(`Valutazione non salvata: ${error.message}`); return false; }
    await loadGoalkeepers();
    setToast("Nuova valutazione salvata nello storico");
    return true;
  }

  async function saveSettings(next: AppSettings) {
    if (!supabase) return;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setToast("Sessione non valida: accedi nuovamente"); return; }
    const payload = { ...next, id: next.id || authData.user.id, owner_id: authData.user.id, phone: next.phone || null, training_location: next.training_location || null };
    const { error } = await supabase.from("app_settings").upsert(payload, { onConflict: "id" });
    if (error) { setToast(`Impostazioni non salvate: ${error.message}`); return; }
    setSettings(payload);
    setDuration(payload.default_duration_minutes);
    setKeepers(payload.default_goalkeeper_count);
    setSettingsOpen(false);
    setToast("Impostazioni salvate");
  }

  const initials = settings.coach_name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "KP";

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setToast(`Logout non riuscito: ${error.message}`);
  }

  const trainingNav = [
    { id: "agenda" as const, icon: "□", label: "Agenda settimanale" },
    { id: "builder" as const, icon: "+", label: "Crea allenamento" },
  ];
  const technicalNav = [{ id: "archive" as const, icon: "▦", label: "Archivio esercizi" }];
  const physicalNav = [{ id: "physical" as const, icon: "◇", label: "Obiettivi fisici" }];
  const teamNav = [{ id: "goalkeepers" as const, icon: "♙", label: "Portieri" }];
  const nav = [...trainingNav, ...technicalNav, ...physicalNav, ...teamNav];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">K</span> KeeperLab</div>
        <div className="side-label">Allenamento</div>
        {trainingNav.map(item => <button key={item.id} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); if (item.id === "agenda") setSeasonSettingsOpen(false); }}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        <div className="side-label group-side-label">Area tecnica</div>
        {technicalNav.map(item => <button key={item.id} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        <div className="side-label group-side-label">Preparazione fisica</div>
        {physicalNav.map(item => <button key={item.id} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        <div className="side-label group-side-label">Squadra</div>
        {teamNav.map(item => <button key={item.id} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}
        <div className="coach-card"><div className="avatar">{initials}</div><div><strong>{settings.coach_name}</strong><span>{settings.role}</span></div></div>
      </aside>

      <main className="main">
        <header className="topbar"><span className="eyebrow">{settings.club_name ? `${settings.club_name} · ` : ""}{settings.team_name} · {settings.season}</span><div className="topbar-actions"><span className="online">● {isSupabaseConfigured ? "Supabase connesso" : "Configurazione mancante"}</span><button className="settings-button" aria-label="Apri impostazioni" title="Impostazioni" onClick={() => setSettingsOpen(true)}>⚙</button><button className="logout-button" aria-label="Esci dall’app" title="Esci" onClick={signOut}>↪</button></div></header>
        <div className="content">
          {loading ? <div className="loading-state">Caricamento archivio e agenda…</div> : null}
          {!loading && section === "archive" && <Archive exercises={filtered} categories={exerciseCategories} subcategories={availableSubcategories} physicalObjectives={physicalObjectives} search={search} setSearch={setSearch} categoryFilter={categoryFilter} setCategoryFilter={value => { setCategoryFilter(value); setSubcategoryFilter("all"); }} subcategoryFilter={subcategoryFilter} setSubcategoryFilter={setSubcategoryFilter} phaseFilter={phaseFilter} setPhaseFilter={setPhaseFilter} intensityFilter={intensityFilter} setIntensityFilter={setIntensityFilter} difficultyFilter={difficultyFilter} setDifficultyFilter={setDifficultyFilter} physicalObjectiveFilter={physicalObjectiveFilter} setPhysicalObjectiveFilter={setPhysicalObjectiveFilter} onNew={() => setEditingExercise("new")} onImportImages={() => setBulkImageOpen(true)} onOpen={setOpenExercise} onEdit={setEditingExercise} onDelete={deleteExercise} />}
          {!loading && section === "physical" && <PhysicalObjectivesPage objectives={physicalObjectives} />}
          {!loading && section === "goalkeepers" && <GoalkeepersPage goalkeepers={goalkeepers} categories={exerciseCategories} physicalDimensions={physicalAssessmentDimensions} onSaveGoalkeeper={saveGoalkeeper} onDeactivate={deactivateGoalkeeper} onSaveAssessment={saveGoalkeeperAssessment} />}
          {!loading && section === "builder" && <SessionPlanner editing={Boolean(editingTrainingId)} date={date} duration={duration} keepers={keepers} mode={generationMode} seasonPhase={seasonPhases.find(item=>date>=item.data_inizio&&date<=item.data_fine)?.tipo??"Non specificata"} profile={sessionProfile} goalkeepers={goalkeepers} selectedGoalkeeperIds={selectedGoalkeeperIds} categories={exerciseCategories} physicalDimensions={physicalAssessmentDimensions} technicalRanking={technicalRanking} physicalRanking={physicalRanking} technicalFocusId={technicalFocusId} technicalSecondaryFocusId={technicalSecondaryFocusId} physicalFocusId={physicalFocusId} blocks={sessionBlocks} generatedExercises={generatedExercises} quality={sessionQuality} confirmed={sessionConfirmed} onDate={value => { setDate(value); setGeneratedExercises(null); }} onDuration={value => { setDuration(value); setSessionProfile(null); setSessionBlocks([]); setGeneratedExercises(null); }} onKeepers={value => { setKeepers(value); setGeneratedExercises(null); }} onMode={setGenerationMode} onGoalkeepers={value => { setSelectedGoalkeeperIds(value); setGeneratedExercises(null); }} onTechnicalFocus={value => { setTechnicalFocusId(value); setGeneratedExercises(null); if (sessionProfile) setSessionBlocks(buildSessionBlocks(sessionProfile, value, physicalFocusId)); }} onTechnicalSecondaryFocus={value => { setTechnicalSecondaryFocusId(value); setGeneratedExercises(null); }} onPhysicalFocus={value => { setPhysicalFocusId(value); setGeneratedExercises(null); if (sessionProfile) setSessionBlocks(buildSessionBlocks(sessionProfile, technicalFocusId, value)); }} onBlocks={value => { setSessionBlocks(value); setGeneratedExercises(null); }} onGenerate={generateSessionPlan} onGenerateExercises={generateExercisePlan} onOpenExercise={(exercise,plannedDuration,variants)=>setSessionExerciseDetail({exercise:exercises.find(item=>item.id===exercise.id)??exercise,plannedDuration,variants})} onToggleLock={toggleExerciseLock} onExerciseDuration={changePlannedDuration} onRemove={removeGeneratedExercise} onReplace={openReplacement} onVariants={openVariants} onMove={moveGeneratedExercise} onRegenerateBlock={regenerateOneBlock} onRegenerateSession={regenerateAllExercises} onRecalculateAll={recalculateWholeSession} onAdd={setManualPickerBlock} onConfirm={()=>setSessionConfirmed(true)} onSave={saveSession} />}
          {!loading && section === "agenda" && (seasonSettingsOpen
            ? <SeasonSettings settings={settings} season={season} phases={seasonPhases} recall={seasonRecall} profiles={seasonProfiles} matches={seasonMatches} exceptions={calendarExceptions} busy={seasonBusy} onClose={() => setSeasonSettingsOpen(false)} onSave={saveSeasonConfiguration} onGenerate={generateSeasonAgenda} onSaveMatch={saveSeasonMatch} onDeleteMatch={deleteSeasonMatch} onSaveException={saveCalendarException} onDeleteException={deleteCalendarException} />
            : <SeasonAgenda calendarDays={calendarDays} trainings={trainings} weekStart={weekStart} setWeekStart={setWeekStart} onOpenTraining={setOpenTraining} onOpenDay={setOpenCalendarDay} onCreate={startNewTraining} onSettings={() => setSeasonSettingsOpen(true)} />)}
        </div>
      </main>

      <nav className="mobile-nav">{nav.map(item => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => setSection(item.id)}><b>{item.icon}</b>{item.label.replace(" settimanale", "")}</button>)}</nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      {editingExercise && <ExerciseImageModal exercise={editingExercise === "new" ? null : editingExercise} categories={exerciseCategories} subcategories={exerciseSubcategories} physicalObjectives={physicalObjectives} onClose={() => setEditingExercise(null)} onSave={saveExercise} onImageChange={changeExerciseImage} onSavePhysicalMapping={saveExercisePhysicalMapping} onRemovePhysicalMapping={removeExercisePhysicalMapping} />}
      {openExercise && <ExerciseDetailModal exercise={openExercise} onClose={() => setOpenExercise(null)} onEdit={() => { setOpenExercise(null); setEditingExercise(openExercise); }} />}
      {bulkImageOpen && <BulkImageImportModal onClose={() => setBulkImageOpen(false)} onImport={importExerciseImages} />}
      {openTraining && <PlannerTrainingModal training={openTraining} catalog={exercises} goalkeepers={goalkeepers} categories={exerciseCategories} physicalDimensions={physicalAssessmentDimensions} seasonPhases={seasonPhases} onOpenExercise={(exercise,plannedDuration,variants)=>setSessionExerciseDetail({exercise,plannedDuration,variants})} onClose={() => setOpenTraining(null)} onEdit={() => startEditTraining(openTraining)} onDelete={() => deleteTraining(openTraining)} />}
      {sessionExerciseDetail && <ExerciseDetailModal exercise={sessionExerciseDetail.exercise} plannedDuration={sessionExerciseDetail.plannedDuration} variants={sessionExerciseDetail.variants} goalkeepers={goalkeepers} onClose={() => setSessionExerciseDetail(null)} onEdit={() => { setSessionExerciseDetail(null); setOpenTraining(null); setEditingExercise(sessionExerciseDetail.exercise); }} />}
      {openCalendarDay && <CalendarDayModal day={openCalendarDay} trainings={trainings.filter(training => training.training_date === openCalendarDay.data)} onClose={() => setOpenCalendarDay(null)} onOpenTraining={training => { setOpenCalendarDay(null); setOpenTraining(training); }} onSaveException={saveCalendarException} />}
      {settingsOpen && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />}
      {replacementTarget && manualPickerBlock === null && <ReplacementAlternativesModal target={replacementTarget} candidates={replacementCandidates} onClose={()=>setReplacementTarget(null)} onSelect={(candidate,reason)=>applyReplacement(candidate,reason)} onManual={()=>setManualPickerBlock(replacementTarget.block_order)} />}
      {manualPickerBlock !== null && generatedExercises && <ManualExercisePicker exercises={exercises} score={exercise=>scoreManualExercise(buildExerciseSelectionInput(),generatedExercises,exercise,manualPickerBlock)} onClose={()=>{setManualPickerBlock(null);setReplacementTarget(null);}} onSelect={candidate=>replacementTarget?applyReplacement(candidate,"Preferenza personale","manual"):addManualExercise(candidate)} />}
      {variantTarget && <IndividualVariantsEditor selection={variantTarget} goalkeepers={goalkeepers.filter(g=>selectedGoalkeeperIds.includes(g.id))} suggestions={buildIndividualVariantSuggestions(variantTarget,goalkeepers.filter(g=>selectedGoalkeeperIds.includes(g.id)))} onClose={()=>setVariantTarget(null)} onSave={saveVariants} />}
    </div>
  );
}

function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>;
}

type ArchiveProps = { exercises: Exercise[]; categories: ExerciseCategory[]; subcategories: string[]; physicalObjectives: PhysicalObjective[]; search: string; setSearch: (value: string) => void; categoryFilter: number | "all"; setCategoryFilter: (value: number | "all") => void; subcategoryFilter: string | "all"; setSubcategoryFilter: (value: string | "all") => void; phaseFilter: CatalogPhase | "all"; setPhaseFilter: (value: CatalogPhase | "all") => void; intensityFilter: Exercise["intensita"] | "all"; setIntensityFilter: (value: Exercise["intensita"] | "all") => void; difficultyFilter: ExerciseDifficulty | "all"; setDifficultyFilter: (value: ExerciseDifficulty | "all") => void; physicalObjectiveFilter: string | "all"; setPhysicalObjectiveFilter: (value: string | "all") => void; onNew: () => void; onImportImages: () => void; onOpen: (exercise: Exercise) => void; onEdit: (exercise: Exercise) => void; onDelete: (exercise: Exercise) => void };
function Archive(props: ArchiveProps) {
  const hasActiveFilters = props.search !== "" || props.categoryFilter !== "all" || props.subcategoryFilter !== "all" || props.phaseFilter !== "all" || props.intensityFilter !== "all" || props.difficultyFilter !== "all" || props.physicalObjectiveFilter !== "all";
  const resetFilters = () => {
    props.setSearch("");
    props.setCategoryFilter("all");
    props.setSubcategoryFilter("all");
    props.setPhaseFilter("all");
    props.setIntensityFilter("all");
    props.setDifficultyFilter("all");
    props.setPhysicalObjectiveFilter("all");
  };

  return <>
    <PageHead eyebrow="Catalogo tecnico ufficiale" title="Archivio esercizi" subtitle={`${props.exercises.length} esercizi nella selezione corrente.`} action={<div className="page-actions"><button className="secondary" onClick={props.onImportImages}>⇧ Importa immagini</button><button className="primary" onClick={props.onNew}>+ Nuovo esercizio</button></div>} />
    <section className="archive-filter-panel" aria-labelledby="archive-filters-title">
      <div className="archive-filter-head">
        <div className="archive-filter-heading"><span className="archive-filter-icon">⌕</span><div><h2 id="archive-filters-title">Cerca e filtra</h2><p>Restringi il catalogo usando uno o più criteri tecnici.</p></div></div>
        {hasActiveFilters && <button className="filter-reset" type="button" onClick={resetFilters}>Azzera filtri</button>}
      </div>
      <div className="filter-search-card">
        <label htmlFor="exercise-search">Nome esercizio</label>
        <div className="search"><span>⌕</span><input id="exercise-search" placeholder="Cerca un esercizio per nome…" value={props.search} onChange={event => props.setSearch(event.target.value)} /></div>
      </div>
      <div className="archive-filter-grid">
        <label className="filter-field"><span>Categoria</span><select className="filter-select" aria-label="Filtra categoria" value={props.categoryFilter} onChange={event => props.setCategoryFilter(event.target.value === "all" ? "all" : Number(event.target.value))}><option value="all">Tutte le categorie</option>{props.categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <label className="filter-field"><span>Sottocategoria</span><select className="filter-select" aria-label="Filtra sottocategoria" value={props.subcategoryFilter} onChange={event => props.setSubcategoryFilter(event.target.value)}><option value="all">Tutte le sottocategorie</option>{props.subcategories.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Fase metodologica</span><select className="filter-select" aria-label="Filtra fase metodologica" value={props.phaseFilter} onChange={event => props.setPhaseFilter(event.target.value as CatalogPhase | "all")}><option value="all">Tutte le fasi</option>{catalogPhases.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Intensità</span><select className="filter-select" aria-label="Filtra intensità" value={props.intensityFilter} onChange={event => props.setIntensityFilter(event.target.value as Exercise["intensita"] | "all")}><option value="all">Tutte le intensità</option>{exerciseIntensities.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Difficoltà</span><select className="filter-select" aria-label="Filtra difficoltà" value={props.difficultyFilter} onChange={event => props.setDifficultyFilter(event.target.value === "all" ? "all" : Number(event.target.value) as ExerciseDifficulty)}><option value="all">Tutte le difficoltà</option><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option><option value="4">★★★★ Élite</option><option value="5">★★★★★ Master</option></select></label>
        <label className="filter-field physical-filter-field"><span>Obiettivo fisico</span><select className="filter-select" aria-label="Filtra obiettivo fisico" value={props.physicalObjectiveFilter} onChange={event => props.setPhysicalObjectiveFilter(event.target.value)}><option value="all">Tutti gli obiettivi fisici</option>{props.physicalObjectives.map(item => <option key={item.id} value={item.id}>{item.macro_area} &gt; {item.obiettivo_fisico}</option>)}</select></label>
      </div>
    </section>
    {!props.exercises.length ? <EmptyState title="Nessun esercizio trovato" text="Modifica i filtri oppure aggiungi un nuovo esercizio." action={<button className="primary" onClick={props.onNew}>Aggiungi esercizio</button>} /> : null}
    <div className="exercise-grid technical-grid">{props.exercises.map(exercise => <ExerciseCard key={exercise.id} exercise={exercise} onOpen={props.onOpen} onEdit={props.onEdit} onDeactivate={props.onDelete} />)}</div>
  </>;
}

type BuilderProps = { editing: boolean; date: string; setDate: (value: string) => void; duration: number; setDuration: (value: number) => void; keepers: number; setKeepers: (value: number) => void; objectives: string[]; selectedObjectives: string[]; setSelectedObjectives: (value: string[]) => void; physicalObjectives: PhysicalObjective[]; selectedPhysicalObjectiveId: string; setSelectedPhysicalObjectiveId: (value: string) => void; session: Exercise[]; totalMinutes: number; onGenerate: () => void; onSwap: (index: number) => void; onSave: () => void };
function Builder(props: BuilderProps) {
  const selectedPhysical = props.physicalObjectives.find(item => item.id === props.selectedPhysicalObjectiveId);
  const selectedPhysicalLabel = selectedPhysical ? `${selectedPhysical.macro_area} > ${selectedPhysical.obiettivo_fisico}` : "";
  const [physicalSearch, setPhysicalSearch] = useState(selectedPhysicalLabel);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPhysicalSearch(selectedPhysicalLabel));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPhysicalLabel]);
  const chooseTechnicalObjective = (objective: string) => props.setSelectedObjectives(props.selectedObjectives[0] === objective ? [] : [objective]);
  const choosePhysicalObjective = (value: string) => {
    setPhysicalSearch(value);
    const match = props.physicalObjectives.find(item => `${item.macro_area} > ${item.obiettivo_fisico}` === value);
    props.setSelectedPhysicalObjectiveId(match?.id ?? "");
  };
  return <><PageHead eyebrow="Pianificazione" title={props.editing ? "Modifica allenamento" : "Crea allenamento"} subtitle="Imposta separatamente l’obiettivo tecnico e quello fisico principale." />
    <div className="builder"><section className="panel"><h2>Parametri della seduta</h2><div className="form-grid"><div className="field"><label>Data</label><input type="date" value={props.date} onChange={event => props.setDate(event.target.value)} /></div><div className="field"><label>Durata totale</label><select value={props.duration} onChange={event => props.setDuration(Number(event.target.value))}>{[45, 60, 75, 90].map(value => <option key={value} value={value}>{value} minuti</option>)}</select></div><div className="field"><label>Numero portieri</label><select value={props.keepers} onChange={event => props.setKeepers(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="field"><label>Contesto</label><select><option>Allenamento standard</option><option>Pre-gara</option><option>Recupero</option></select></div>
      <div className="field full objective-panel technical-objective-panel"><label>Obiettivo tecnico principale</label><p>Scegli il focus tecnico prevalente della seduta.</p><div className="chips">{props.objectives.map(objective => <button type="button" key={objective} className={`chip ${props.selectedObjectives[0] === objective ? "selected" : ""}`} onClick={() => chooseTechnicalObjective(objective)}>{objective}</button>)}</div></div>
      <div className="field full objective-panel physical-objective-panel"><label htmlFor="physical-objective-select">Obiettivo fisico principale</label><p>Campo indipendente e facoltativo. Cerca per macro-area o nome.</p><input id="physical-objective-select" className="physical-objective-search" list="physical-objective-options" placeholder={props.physicalObjectives.length ? "Cerca: Esplosività > Spinta laterale" : "Applica la migration 0010 per caricare gli obiettivi"} value={physicalSearch} disabled={!props.physicalObjectives.length} onChange={event => choosePhysicalObjective(event.target.value)} /><datalist id="physical-objective-options">{props.physicalObjectives.map(item => <option key={item.id} value={`${item.macro_area} > ${item.obiettivo_fisico}`}>{item.codice}</option>)}</datalist>{selectedPhysical && <div className="selected-physical-objective"><span>{selectedPhysical.macro_area}</span><strong>{selectedPhysical.obiettivo_fisico}</strong><button type="button" onClick={() => { setPhysicalSearch(""); props.setSelectedPhysicalObjectiveId(""); }}>Rimuovi</button></div>}</div>
    </div><button className="primary generate" onClick={props.onGenerate}>Genera proposta tecnica compatibile</button></section>
    <section className="panel"><h2>Proposta seduta</h2><p className="panel-hint">L’obiettivo fisico viene salvato nella seduta ma non influenza ancora la generazione degli esercizi.</p>{!props.session.length ? <p className="panel-hint">Seleziona l’obiettivo tecnico e genera la proposta.</p> : null}<div className="session-list">{props.session.map((item, index) => <div className="session-row" key={`${item.id}-${index}`}><div className="duration">{item.durata_min}&apos;</div><div><strong>{item.nome}</strong><small>{item.category?.nome} · {item.obiettivo}</small></div><button className="swap" aria-label={`Sostituisci ${item.nome}`} onClick={() => props.onSwap(index)}>↻</button></div>)}</div><div className="session-total"><span>Durata esercizi</span><span>{props.totalMinutes} min</span></div><div className="save-row"><button className="secondary" onClick={props.onGenerate}>Rigenera</button><button className="primary" onClick={props.onSave}>{props.editing ? "Aggiorna seduta" : "Salva seduta"}</button></div></section></div>
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
    return <div className={`day ${today ? "today" : ""}`} key={dateKey(day)}><div className="day-head"><span className="day-name">{dayNames[index]}</span><span className="day-number">{day.getDate()}</span></div>{daily.map(training => <button className="workout" key={training.id} onClick={() => onOpen(training)}><span>Seduta programmata</span><strong>{training.training_objectives.map(item => item.objective).join(" · ") || "Allenamento portieri"}</strong>{training.physical_objective && <em>{training.physical_objective.macro_area} › {training.physical_objective.obiettivo_fisico}</em>}<span>{training.planned_duration_minutes} min · {training.goalkeeper_count} portieri</span></button>)}{!daily.length ? <div className="empty-day">Nessuna seduta</div> : null}</div>;
  })}</div></>;
}

function ExerciseModal({ exercise, categories, subcategories, onClose, onSave }: { exercise: Exercise | null; categories: ExerciseCategory[]; subcategories: ExerciseSubcategory[]; onClose: () => void; onSave: (draft: ExerciseDraft, schemaImage: File | null, photoImage: File | null) => Promise<void> }) {
  const firstCategory = categories[0];
  const firstSubcategory = subcategories.find(item => item.category_id === firstCategory?.id && item.fase !== "Generale");
  const initial: ExerciseDraft = exercise ? (({ id: _id, category: _category, subcategory: _subcategory, physical_mappings: _physicalMappings, ...rest }) => rest)(exercise) : { ...emptyExercise, category_id: firstCategory?.id ?? 1, subcategory_id: firstSubcategory?.id ?? 1, categoria: firstCategory?.nome ?? emptyExercise.categoria, sottocategoria: firstSubcategory?.nome ?? emptyExercise.sottocategoria, fase: firstSubcategory?.fase === "Generale" ? "Analitico" : firstSubcategory?.fase ?? "Analitico" };
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [schemaImage, setSchemaImage] = useState<File | null>(null);
  const [photoImage, setPhotoImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const validSubcategories = subcategories.filter(item => item.category_id === draft.category_id && item.fase === draft.fase);
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  function changeCategory(categoryId: number) { const category = categories.find(item => item.id === categoryId); const first = subcategories.find(item => item.category_id === categoryId && item.fase !== "Generale"); if (!category || !first) return; setDraft(current => ({ ...current, category_id: categoryId, subcategory_id: first.id, categoria: category.nome, sottocategoria: first.nome, fase: first.fase as CatalogPhase })); }
  function changeSubcategory(subcategoryId: number) { const item = subcategories.find(subcategory => subcategory.id === subcategoryId); if (!item || item.fase === "Generale") return; setDraft(current => ({ ...current, subcategory_id: item.id, sottocategoria: item.nome, fase: catalogPhaseFromMethodological(item.fase) })); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setSaving(true); await onSave(draft, schemaImage, photoImage); setSaving(false); }
  return <div className="modal-backdrop"><form className="modal exercise-form-modal" onSubmit={submit}><button type="button" className="modal-close" onClick={onClose}>×</button><span className="eyebrow">Catalogo esercizi</span><h2>{exercise ? "Modifica esercizio" : "Nuovo esercizio"}</h2><div className="form-grid modal-form"><div className="field"><label>Codice</label><input required value={draft.codice} onChange={event => set("codice", event.target.value)} /></div><div className="field"><label>Nome</label><input required value={draft.nome} onChange={event => set("nome", event.target.value)} /></div><div className="field"><label>Categoria</label><select required value={draft.category_id} onChange={event => changeCategory(Number(event.target.value))}>{categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><div className="field"><label>Sottocategoria</label><select required value={draft.subcategory_id} onChange={event => changeSubcategory(Number(event.target.value))}>{validSubcategories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><div className="field"><label>Fase metodologica</label><input value={draft.fase} readOnly /></div><div className="field"><label>Difficoltà</label><select value={draft.difficolta} onChange={event => set("difficolta", Number(event.target.value) as 1 | 2 | 3 | 4)}><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option><option value="4">★★★★ Élite</option></select></div><div className="field full"><label>Obiettivo</label><textarea required rows={2} value={draft.obiettivo} onChange={event => set("obiettivo", event.target.value)} /></div><div className="field full"><label>Descrizione</label><textarea required rows={4} value={draft.descrizione} onChange={event => set("descrizione", event.target.value)} /></div><div className="field"><label>Durata (minuti)</label><input required min="1" type="number" value={draft.durata_min} onChange={event => set("durata_min", Number(event.target.value))} /></div><div className="field"><label>Intensità</label><select value={draft.intensita} onChange={event => set("intensita", event.target.value as ExerciseDraft["intensita"])}><option>Bassa</option><option>Media</option><option>Alta</option></select></div><div className="field"><label>Portieri minimi</label><input required min="1" type="number" value={draft.portieri_min} onChange={event => set("portieri_min", Number(event.target.value))} /></div><div className="field"><label>Portieri massimi</label><input required min={draft.portieri_min} type="number" value={draft.portieri_max} onChange={event => set("portieri_max", Number(event.target.value))} /></div><div className="field full"><label>Materiale</label><input required value={draft.materiale} onChange={event => set("materiale", event.target.value)} /></div><div className="field full"><label>Variante</label><textarea rows={2} value={draft.variante ?? ""} onChange={event => set("variante", event.target.value)} /></div><div className="field full"><label>Coaching points</label><textarea required rows={3} value={draft.coaching_points} onChange={event => set("coaching_points", event.target.value)} /></div><div className="field full"><label>Errori comuni</label><textarea required rows={3} value={draft.errori_comuni} onChange={event => set("errori_comuni", event.target.value)} /></div><div className="field"><label>Schema tecnico</label><input accept="image/jpeg,image/png,image/webp" type="file" onChange={event => setSchemaImage(event.target.files?.[0] ?? null)} /><input className="url-input" placeholder="Oppure URL schema" value={draft.schema_url ?? ""} onChange={event => set("schema_url", event.target.value || null)} /></div><div className="field"><label>Foto dimostrativa</label><input accept="image/jpeg,image/png,image/webp" type="file" onChange={event => setPhotoImage(event.target.files?.[0] ?? null)} /><input className="url-input" placeholder="Oppure URL foto" value={draft.foto_url ?? ""} onChange={event => set("foto_url", event.target.value || null)} /></div><div className="field full checkbox-field"><label><input type="checkbox" checked={draft.attivo} onChange={event => set("attivo", event.target.checked)} /> Esercizio attivo</label></div></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving}>{saving ? "Salvataggio…" : "Salva esercizio"}</button></div></form></div>;
}

function ExerciseImageModal({ exercise, categories, subcategories, physicalObjectives, onClose, onSave, onImageChange, onSavePhysicalMapping, onRemovePhysicalMapping }: {
  exercise: Exercise | null;
  categories: ExerciseCategory[];
  subcategories: ExerciseSubcategory[];
  physicalObjectives: PhysicalObjective[];
  onClose: () => void;
  onSave: (draft: ExerciseDraft, schemaImage: File | null, photoImage: File | null) => Promise<void>;
  onImageChange: (exercise: Exercise, kind: ExerciseImageKind, file: File | null) => Promise<string | null>;
  onSavePhysicalMapping: (exercise: Exercise, draft: PhysicalMappingDraft) => Promise<void>;
  onRemovePhysicalMapping: (mapping: ExercisePhysicalObjective) => Promise<void>;
}) {
  const firstCategory = categories[0];
  const firstSubcategory = subcategories.find(item => item.category_id === firstCategory?.id && item.fase !== "Generale");
  const initial: ExerciseDraft = exercise
    ? (({ id: _id, category: _category, subcategory: _subcategory, physical_mappings: _physicalMappings, ...rest }) => rest)(exercise)
    : { ...emptyExercise, category_id: firstCategory?.id ?? 1, subcategory_id: firstSubcategory?.id ?? 1, categoria: firstCategory?.nome ?? emptyExercise.categoria, sottocategoria: firstSubcategory?.nome ?? emptyExercise.sottocategoria, fase: firstSubcategory?.fase === "Generale" ? "Analitico" : firstSubcategory?.fase ?? "Analitico" };
  const [draft, setDraft] = useState<ExerciseDraft>(initial);
  const [schemaImage, setSchemaImage] = useState<File | null>(null);
  const [photoImage, setPhotoImage] = useState<File | null>(null);
  const [imageBusy, setImageBusy] = useState<ExerciseImageKind | null>(null);
  const [saving, setSaving] = useState(false);
  const [mappingBusyId, setMappingBusyId] = useState<string | null>(null);
  const validSubcategories = subcategories.filter(item => item.category_id === draft.category_id && item.fase === draft.fase);
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  function changeCategory(categoryId: number) {
    const category = categories.find(item => item.id === categoryId);
    const first = subcategories.find(item => item.category_id === categoryId && item.fase === draft.fase)
      ?? subcategories.find(item => item.category_id === categoryId && item.fase !== "Generale");
    if (!category || !first) return;
    setDraft(current => ({ ...current, category_id: categoryId, subcategory_id: first.id, categoria: category.nome, sottocategoria: cleanSubcategoryLabel(first.nome), fase: first.fase as CatalogPhase }));
  }
  function changePhase(fase: CatalogPhase) {
    const first = subcategories.find(item => item.category_id === draft.category_id && item.fase === fase);
    if (!first) return;
    setDraft(current => ({ ...current, fase, subcategory_id: first.id, sottocategoria: cleanSubcategoryLabel(first.nome) }));
  }
  function changeSubcategory(subcategoryId: number) {
    const item = subcategories.find(subcategory => subcategory.id === subcategoryId);
    if (!item || item.fase === "Generale") return;
    setDraft(current => ({ ...current, subcategory_id: item.id, sottocategoria: cleanSubcategoryLabel(item.nome), fase: catalogPhaseFromMethodological(item.fase) }));
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
  async function savePhysicalMapping(mappingDraft: PhysicalMappingDraft) {
    if (!exercise) return;
    const existingMapping = exercise.physical_mappings?.find(mapping => mapping.physical_objective_id === mappingDraft.physical_objective_id);
    setMappingBusyId(existingMapping?.id ?? "new");
    try { await onSavePhysicalMapping(exercise, mappingDraft); }
    finally { setMappingBusyId(null); }
  }
  async function removePhysicalMapping(mapping: ExercisePhysicalObjective) {
    setMappingBusyId(mapping.id);
    try { await onRemovePhysicalMapping(mapping); }
    finally { setMappingBusyId(null); }
  }

  return <div className="modal-backdrop"><form className="modal exercise-form-modal" onSubmit={submit}>
    <button type="button" className="modal-close" onClick={onClose}>×</button>
    <span className="eyebrow">Catalogo esercizi</span><h2>{exercise ? "Modifica esercizio" : "Nuovo esercizio"}</h2>
    <div className="form-grid modal-form">
      <div className="field"><label>Codice</label><input required readOnly={Boolean(exercise)} value={draft.codice} onChange={event => set("codice", event.target.value.toUpperCase())} /></div>
      <div className="field"><label>Nome</label><input required value={draft.nome} onChange={event => set("nome", event.target.value)} /></div>
      <div className="field"><label>Categoria</label><select required value={draft.category_id} onChange={event => changeCategory(Number(event.target.value))}>{categories.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div>
      <div className="field"><label>Fase metodologica</label><select value={draft.fase} onChange={event => changePhase(event.target.value as CatalogPhase)}>{catalogPhases.map(item => <option key={item}>{item}</option>)}</select></div>
      <div className="field"><label>Sottocategoria</label><select required value={draft.subcategory_id} onChange={event => changeSubcategory(Number(event.target.value))}>{validSubcategories.map(item => <option key={item.id} value={item.id}>{cleanSubcategoryLabel(item.nome)}</option>)}</select></div>
      <div className="field"><label>Difficoltà</label><select value={draft.difficolta} onChange={event => set("difficolta", Number(event.target.value) as ExerciseDifficulty)}><option value="1">★ Base</option><option value="2">★★ Intermedio</option><option value="3">★★★ Avanzato</option><option value="4">★★★★ Élite</option><option value="5">★★★★★ Master</option></select></div>
      <div className="field full"><label>Obiettivo</label><textarea required rows={2} value={draft.obiettivo} onChange={event => set("obiettivo", event.target.value)} /></div>
      <div className="field full"><label>Descrizione</label><textarea required rows={4} value={draft.descrizione} onChange={event => set("descrizione", event.target.value)} /></div>
      <div className="field"><label>Durata (minuti)</label><input required min="1" type="number" value={draft.durata_min} onChange={event => set("durata_min", Number(event.target.value))} /></div>
      <div className="field"><label>Intensità</label><select value={draft.intensita} onChange={event => set("intensita", event.target.value as ExerciseDraft["intensita"])}>{exerciseIntensities.map(item => <option key={item}>{item}</option>)}</select></div>
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
      <div className="field full procedure-fields"><label>Svolgimento · Passaggio 6</label><textarea rows={2} value={draft.schema_step_6 ?? ""} onChange={event => set("schema_step_6", event.target.value || null)} /></div>
      {draft.categoria === "Match Simulation" && <><div className="field full"><label>Scenario gara</label><textarea rows={3} value={draft.scenario_gara ?? ""} onChange={event => set("scenario_gara", event.target.value || null)} /></div><div className="field"><label>Numero azioni</label><input value={draft.numero_azioni ?? ""} onChange={event => set("numero_azioni", event.target.value || null)} /></div></>}
      {exercise && <ExercisePhysicalObjectivesEditor mappings={exercise.physical_mappings ?? []} objectives={physicalObjectives} busyId={mappingBusyId} onSave={savePhysicalMapping} onRemove={removePhysicalMapping} />}
      <section className="exercise-images-section field full"><div className="exercise-images-title"><span>Immagini esercizio</span><small>WEBP, JPG, JPEG o PNG · salvataggio nello Storage Supabase</small></div><div className="exercise-images-grid">
        <ExerciseImageField label="Schema tecnico" kind="schema" url={draft.schema_url} selectedFile={schemaImage} busy={imageBusy === "schema"} immediate={Boolean(exercise)} onSelect={setSchemaImage} onUpload={file => uploadImage("schema", file)} onDelete={() => removeImage("schema")} />
        <ExerciseImageField label="Foto dimostrativa" kind="foto" url={draft.foto_url} selectedFile={photoImage} busy={imageBusy === "foto"} immediate={Boolean(exercise)} onSelect={setPhotoImage} onUpload={file => uploadImage("foto", file)} onDelete={() => removeImage("foto")} />
      </div></section>
      <div className="field full checkbox-field"><label><input type="checkbox" checked={draft.attivo} onChange={event => set("attivo", event.target.checked)} /> Esercizio attivo</label></div>
    </div>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Annulla</button><button className="primary" disabled={saving || imageBusy !== null}>{saving ? "Salvataggio…" : "Salva esercizio"}</button></div>
  </form></div>;
}

function ExerciseDetailModal({ exercise, onClose, onEdit, plannedDuration, variants = [], goalkeepers = [] }: { exercise: Exercise; onClose: () => void; onEdit: () => void; plannedDuration?: number; variants?: TrainingExerciseVariant[]; goalkeepers?: Goalkeeper[] }) {
  const goalkeeperName=(id:string)=>{const goalkeeper=goalkeepers.find(item=>item.id===id);return goalkeeper?`${goalkeeper.nome} ${goalkeeper.cognome}`:"Portiere";};
  return <div className="modal-backdrop session-exercise-detail-backdrop" onClick={onClose}><div className="modal exercise-card-modal session-exercise-detail-modal" onClick={event => event.stopPropagation()}><button className="modal-close floating" onClick={onClose} aria-label="Chiudi scheda esercizio">×</button>
    {plannedDuration !== undefined && <div className="exercise-session-context"><div><small>Durata pianificata</small><strong>{plannedDuration} min</strong></div><div><small>Durata standard catalogo</small><strong>{exercise.durata_min} min</strong></div></div>}
    <ExerciseCard exercise={exercise} onOpen={() => {}} onEdit={onEdit} onDeactivate={() => {}} showActions={false} variant="detail" />
    {variants.some(item=>item.variante_individuale) && <section className="exercise-detail-variants"><h3>Varianti individuali</h3>{variants.filter(item=>item.variante_individuale).map((variant,index)=><article key={`${variant.goalkeeper_id}-${index}`}><strong>{goalkeeperName(variant.goalkeeper_id)}</strong><p>{variant.variante_individuale}</p>{variant.motivazione&&<small>{variant.motivazione}</small>}</article>)}</section>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Chiudi</button><button onClick={onEdit}>Modifica esercizio</button></div></div></div>;
}

function PlannerTrainingModal({ training, catalog, goalkeepers, categories, physicalDimensions, seasonPhases, onOpenExercise, onClose, onEdit, onDelete }: { training: Training; catalog:Exercise[];goalkeepers:Goalkeeper[];categories:ExerciseCategory[];physicalDimensions:PhysicalAssessmentDimension[];seasonPhases:SeasonPhaseConfig[];onOpenExercise:(exercise:Exercise,plannedDuration:number,variants:TrainingExerciseVariant[])=>void;onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [expanded,setExpanded]=useState<Record<number,boolean>>({});
  const [fieldMode,setFieldMode]=useState(false);
  const blocks=useMemo(()=>[...(training.training_blocks??[])].sort((a,b)=>a.ordine-b.ordine),[training.training_blocks]);
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>{const compact=window.matchMedia("(max-width: 640px)").matches;setExpanded(Object.fromEntries(blocks.map((block,index)=>[block.ordine,!compact||index===0])));});return()=>window.cancelAnimationFrame(frame);},[training.id,blocks]);
  const catalogById=new Map(catalog.map(exercise=>[exercise.id,exercise]));
  const displayItems:SessionDisplayExercise[]=training.training_exercises.map((item,index)=>{
    const snapshot=item.selection_snapshot??{};
    const block=blocks.find(candidate=>candidate.id===item.training_block_id);
    const snapshotOrder=typeof snapshot.block_order==="number"?snapshot.block_order:Number(snapshot.block_order??1);
    return{id:item.id,exercise:catalogById.get(item.exercise.id)??item.exercise,plannedDuration:item.planned_duration_minutes,blockOrder:block?.ordine??snapshotOrder,blockPosition:item.block_position??index,locked:Boolean(item.locked),reasons:Array.isArray(snapshot.reasons)?snapshot.reasons.filter((reason):reason is string=>typeof reason==="string"):[],variants:item.variants??[]};
  });
  const technicalPrimary=training.technical_objective_primary||categories.find(item=>item.id===training.technical_focus_primary_category_id)?.nome||training.training_objectives[0]?.objective||"Non specificato";
  const technicalSecondary=training.technical_objective_secondary||categories.find(item=>item.id===training.technical_focus_secondary_category_id)?.nome||null;
  const physicalLabel=training.generation_reason_snapshot?.physical_label as string|undefined;
  const physicalPrimary=physicalLabel||physicalDimensions.find(item=>item.id===training.physical_focus_dimension_id)?.nome||(training.physical_objective?`${training.physical_objective.macro_area} > ${training.physical_objective.obiettivo_fisico}`:"Non specificato");
  const phase=seasonPhases.find(item=>item.id===training.season_phase_id)||seasonPhases.find(item=>training.training_date>=item.data_inizio&&training.training_date<=item.data_fine);
  const selectedGoalkeepers=goalkeepers.filter(goalkeeper=>training.training_goalkeepers?.some(item=>item.goalkeeper_id===goalkeeper.id));
  const goalkeeperName=(id:string)=>{const goalkeeper=goalkeepers.find(item=>item.id===id);return goalkeeper?`${goalkeeper.nome} ${goalkeeper.cognome}`:"Portiere";};
  const quality=training.current_quality_snapshot&&"score" in training.current_quality_snapshot?Number(training.current_quality_snapshot.score):null;
  return <><div className="modal-backdrop" onClick={onClose}><div className="modal training-detail-modal rich-training-modal" onClick={event => event.stopPropagation()}><button className="training-modal-close" onClick={onClose} aria-label="Chiudi finestra" title="Chiudi">×</button>
    <SessionOverviewHeader date={training.training_date} matchDay={training.session_profile_code||(training.match_day_offset!==null&&training.match_day_offset!==undefined?`MD${training.match_day_offset}`:"MD")} seasonPhase={phase?.tipo??"Non specificata"} duration={training.planned_duration_minutes} load={training.planned_load||((training.session_profile_snapshot as SessionProfile|undefined)?.load)||"Non specificato"} goalkeeperCount={training.goalkeeper_count} technicalPrimary={technicalPrimary} technicalSecondary={technicalSecondary} physicalPrimary={physicalPrimary} goalkeeperNames={selectedGoalkeepers.map(item=>`${item.nome} ${item.cognome}`)} quality={quality} onFieldMode={()=>setFieldMode(true)}/>
    <div className="saved-session-blocks">{blocks.map((block,index)=>{const items=groupSessionExercises(displayItems,block.ordine);const isOpen=expanded[block.ordine]??true;const blockTechnical=categories.find(item=>item.id===block.technical_category_id)?.nome;const blockPhysical=physicalDimensions.find(item=>item.id===block.physical_dimension_id)?.nome;return <article className={`generated-block rich-block ${isOpen?"open":"collapsed"}`} key={block.ordine}><header><button className="block-collapse" onClick={()=>setExpanded(current=>({...current,[block.ordine]:!isOpen}))} aria-expanded={isOpen} aria-label={`${isOpen?"Comprimi":"Espandi"} blocco ${String.fromCharCode(65+index)}`}><b>{String.fromCharCode(65+index)}</b><span>{isOpen?"⌃":"⌄"}</span></button><div className="rich-block-heading"><strong>{block.tipo_blocco}</strong><small>{block.durata_target} min · {items.length} {items.length===1?"esercizio":"esercizi"}</small></div><div className="rich-block-targets"><span>{block.fase_metodologica_preferita||"Fase libera"}</span><span>Carico {block.carico_target||"libero"}</span>{blockTechnical&&<span>Focus {blockTechnical}</span>}{blockPhysical&&<span>Fisico {blockPhysical}</span>}</div></header>{isOpen&&<div className="rich-block-body">{items.length?items.map(item=><SessionExerciseCard key={item.id} item={item} number={displayItems.findIndex(candidate=>candidate.id===item.id)+1} goalkeeperName={goalkeeperName} onOpen={()=>onOpenExercise(item.exercise,item.plannedDuration,item.variants)}/>):<p className="planner-empty">Nessun esercizio salvato in questo blocco.</p>}</div>}</article>})}</div>
    <div className="training-modal-footer"><button className="training-icon-action edit" onClick={onEdit} aria-label="Modifica seduta" title="Modifica seduta">✎</button><button className="training-icon-action delete" onClick={onDelete} aria-label="Elimina seduta" title="Elimina seduta">🗑</button></div></div></div>{fieldMode&&<SessionFieldMode items={displayItems} blocks={blocks} goalkeeperName={goalkeeperName} onClose={()=>setFieldMode(false)}/>}</>;
}

function TrainingModal({ training, onClose, onEdit, onDelete }: { training: Training; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const label = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${training.training_date}T12:00:00`));
  const technicalObjective = training.technical_objective_primary || training.training_objectives[0]?.objective || "Non specificato";
  return <div className="modal-backdrop" onClick={onClose}><div className="modal training-detail-modal" onClick={event => event.stopPropagation()}><div className="training-modal-tools"><button className="training-icon-action edit" onClick={onEdit} aria-label="Modifica seduta" title="Modifica seduta">✎</button><button className="training-icon-action delete" onClick={onDelete} aria-label="Elimina seduta" title="Elimina seduta">×</button></div><span className="eyebrow">Seduta completa</span><h2>{label}</h2><p>{training.planned_duration_minutes} minuti · {training.goalkeeper_count} portieri</p><div className="training-objective-panels"><section className="training-objective technical"><span>Obiettivo tecnico</span><strong>{technicalObjective}</strong></section><section className="training-objective physical"><span>Obiettivo fisico</span><strong>{training.physical_objective ? `${training.physical_objective.macro_area} > ${training.physical_objective.obiettivo_fisico}` : "Non specificato"}</strong></section></div><div className="session-list">{training.training_exercises.map((item, index) => <div className="session-row" key={item.id}><div className="duration">{item.planned_duration_minutes}&apos;</div><div><strong>{index + 1}. {item.exercise.nome}</strong><small>{item.exercise.category?.nome} · {item.exercise.obiettivo}</small></div></div>)}</div><div className="modal-actions"><button className="secondary" onClick={onClose}>Chiudi</button></div></div></div>;
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
