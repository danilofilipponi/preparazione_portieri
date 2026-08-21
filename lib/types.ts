export type ExerciseCategory = {
  id: number;
  nome: string;
  attivo: boolean;
};

export type CatalogPhase = "Analitico" | "Disturbo" | "Situazionale" | "Integrato guidato" | "Integrato variabile" | "Situazionale complesso" | "Scenario aperto";
export type MethodologicalPhase = CatalogPhase | "Generale";
export type ExerciseIntensity = "Bassa" | "Bassa-Media" | "Media" | "Media-Alta" | "Alta";
export type ExerciseDifficulty = 1 | 2 | 3 | 4 | 5;
export type TacticalViewType = "front_goal" | "half_pitch" | "penalty_area" | "full_pitch";
export type TacticalElementType = "goalkeeper" | "coach" | "attacker" | "player" | "ball" | "cone" | "mannequin" | "hurdle" | "mini_goal" | "goal" | "marker";
export type TacticalActionType = "movimento" | "passaggio" | "tiro" | "cross" | "tuffo" | "recupero" | "corsa" | "conduzione";
export type DiagramSource = "automatic" | "manual" | "automatic_edited";

export type TacticalDiagramElement = {
  id: string;
  type: TacticalElementType;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  label?: string;
  role?: string;
};

export type TacticalDiagramAction = {
  id: string;
  type: TacticalActionType;
  fromElementId?: string;
  toElementId?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  sequence: number;
  style?: "solid" | "dashed" | "curved";
  label?: string;
};

export type TacticalDiagram = {
  version: 1;
  canvas: { viewType: TacticalViewType; widthRatio: number; heightRatio: number };
  elements: TacticalDiagramElement[];
  actions: TacticalDiagramAction[];
};
export type PhysicalPriority = "Molto alta" | "Alta" | "Media" | "Bassa";
export type SeasonalSuitability = PhysicalPriority | "Non prevista";
export type SeasonPhase = "precampionato" | "periodo_competitivo" | "richiamo_mantenimento" | "recupero_rigenerazione";

export type PhysicalObjective = {
  id: string;
  codice: string;
  macro_area: string;
  obiettivo_fisico: string;
  descrizione: string;
  priorita_portiere: PhysicalPriority;
  precampionato: SeasonalSuitability;
  periodo_competitivo: SeasonalSuitability;
  richiamo_mantenimento: SeasonalSuitability;
  recupero_rigenerazione: SeasonalSuitability;
  abbinamenti_tecnici: string;
  note_programmazione: string;
  attivo: boolean;
};

export type ExercisePhysicalObjectiveRole = "Principale" | "Secondario" | "Complementare";

export type ExercisePhysicalObjective = {
  id: string;
  exercise_id: string;
  physical_objective_id: string;
  ruolo: ExercisePhysicalObjectiveRole;
  peso: 1 | 2 | 3 | 4 | 5;
  motivazione: string | null;
  attivo: boolean;
  physical_objective: PhysicalObjective;
};

export type ExerciseSubcategory = {
  id: number;
  category_id: number;
  nome: string;
  fase: MethodologicalPhase;
  attivo: boolean;
};

export type Exercise = {
  id: string;
  codice: string;
  nome: string;
  category_id: number;
  subcategory_id: number;
  categoria: string;
  sottocategoria: string;
  fase: CatalogPhase;
  obiettivo: string;
  descrizione: string;
  durata_min: number;
  portieri_min: number;
  portieri_max: number;
  intensita: ExerciseIntensity;
  difficolta: ExerciseDifficulty;
  materiale: string;
  variante: string | null;
  coaching_points: string;
  errori_comuni: string;
  schema_step_1: string | null;
  schema_step_2: string | null;
  schema_step_3: string | null;
  schema_step_4: string | null;
  schema_step_5: string | null;
  schema_step_6: string | null;
  scenario_gara: string | null;
  numero_azioni: string | null;
  tactical_diagram?: TacticalDiagram | null;
  diagram_source?: DiagramSource | null;
  diagram_updated_at?: string | null;
  attivo: boolean;
  category?: ExerciseCategory;
  subcategory?: ExerciseSubcategory;
  physical_mappings?: ExercisePhysicalObjective[];
  evaluation_mappings?: ExerciseEvaluationMapping[];
};

export type ExerciseEvaluationMapping = {
  id: string;
  exercise_id: string;
  target_type: "Technical" | "Physical";
  technical_subcategory_id: number | null;
  physical_objective_id: string | null;
  evidence_notes: string;
  mapping_status: "auto_approved" | "needs_review" | "rejected";
  attivo: boolean;
};

export type SessionExerciseSource = "legacy" | "generated" | "manual" | "replacement" | "regenerated";
export type TrainingExercise = {
  id: string;
  position: number;
  planned_duration_minutes: number;
  notes: string | null;
  training_block_id?: string | null;
  block_position?: number | null;
  exercise_score?: number | null;
  selection_snapshot?: Record<string, unknown>;
  fallback_level?: number;
  individual_variant_suggestion?: string | null;
  locked?: boolean;
  source?: SessionExerciseSource;
  replacement_reason?: string | null;
  replacement_note?: string | null;
  variants?: TrainingExerciseVariant[];
  exercise: Exercise;
};

export type Training = {
  id: string;
  training_date: string;
  planned_duration_minutes: number;
  goalkeeper_count: number;
  notes: string | null;
  status: "planned" | "draft" | "confirmed" | "completed" | "cancelled";
  physical_objective_id: string | null;
  physical_objective: PhysicalObjective | null;
  season_id?: string | null;
  calendar_day_id?: string | null;
  season_phase_id?: string | null;
  session_number?: number;
  session_type?: string | null;
  technical_objective_primary?: string | null;
  technical_objective_secondary?: string | null;
  planned_load?: string | null;
  match_day_offset?: number | null;
  athletic_recall?: boolean;
  generated_by_calendar?: boolean;
  content_status?: "empty" | "compiled" | "manual";
  generation_mode?: GenerationMode;
  focus_source?: string | null;
  technical_focus_primary_category_id?: number | null;
  technical_focus_secondary_category_id?: number | null;
  physical_focus_dimension_id?: string | null;
  session_profile_code?: string | null;
  session_profile_snapshot?: SessionProfile | Record<string, never>;
  technical_ranking_snapshot?: PriorityRankingItem[];
  physical_ranking_snapshot?: PriorityRankingItem[];
  generation_reason_snapshot?: Record<string, unknown>;
  session_generation_snapshot?: Record<string, unknown>;
  current_quality_snapshot?: SessionQualityResult | Record<string, never>;
  regeneration_count?: number;
  revision_number?: number;
  confirmed_at?: string | null;
  training_goalkeepers?: TrainingGoalkeeper[];
  training_blocks?: SessionBlock[];
  training_objectives: { objective: string }[];
  training_exercises: TrainingExercise[];
  evaluation_session?: EvaluationSessionSummary | null;
};

export type EvaluationSessionSummary = {
  id: string;
  evaluation_type: "Complete" | "Targeted" | "Custom" | "Reassessment";
  status: "Draft" | "Ready" | "InProgress" | "Completed" | "Cancelled";
  goalkeeper_id: string;
  minimum_observations: number;
  context_preference?: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type CalendarDayType = "Allenamento" | "Gara" | "Amichevole" | "Riposo" | "Recupero" | "Allenamento extra" | "Annullato" | "Altro";
export type SeasonPhaseType = "Pre-campionato" | "Campionato";
export type MatchType = "Campionato" | "Coppa" | "Amichevole" | "Torneo" | "Altro";

export type Season = {
  id: string;
  nome_stagione: string;
  data_inizio: string;
  data_fine: string;
  squadra: string;
  numero_portieri_standard: number;
  attiva: boolean;
};

export type SeasonPhaseConfig = {
  id: string;
  season_id: string;
  tipo: SeasonPhaseType;
  data_inizio: string;
  data_fine: string;
  giorni_standard_allenamento: number[];
  giorni_riposo: number[];
  possibilita_doppia_seduta: boolean;
  durata_standard_seduta: number;
  giorno_gara_standard: number | null;
  note: string | null;
};

export type SeasonRecallPeriod = {
  id: string;
  season_id: string;
  data_inizio: string;
  data_fine: string;
  giorni_allenamento: number[];
  giorni_riposo: number[];
  livello_incremento_carico_fisico: string | null;
  note: string | null;
  attivo: boolean;
};

export type SeasonTrainingProfile = {
  id: string;
  season_id: string;
  nome: string;
  match_day_offset: number;
  tipo_seduta: string;
  carico_previsto: string | null;
  durata_standard: number | null;
  caratteristiche: string[];
  progressione_tecnica: string[];
  attivo: boolean;
};

export type SeasonMatch = {
  id: string;
  season_id: string;
  data: string;
  tipo: MatchType;
  avversario: string | null;
  casa_trasferta: "Casa" | "Trasferta" | null;
  note: string | null;
  origine: "Generata" | "Manuale";
  bloccata: boolean;
  attiva: boolean;
};

export type CalendarException = {
  id: string;
  season_id: string;
  data: string;
  tipo_giornata: CalendarDayType;
  durata_prevista: number | null;
  carico_previsto: string | null;
  numero_portieri_previsti: number | null;
  note: string | null;
};

export type CalendarDay = {
  id: string;
  season_id: string;
  season_phase_id: string | null;
  data: string;
  tipo_giornata: CalendarDayType;
  richiamo_atletico: boolean;
  match_day_offset: number | null;
  match_day_relation: string | null;
  durata_prevista: number | null;
  carico_previsto: string | null;
  numero_portieri_previsti: number | null;
  note: string | null;
  origine: "Generata" | "Manuale" | "Eccezione";
  match: SeasonMatch | null;
  phase: SeasonPhaseConfig | null;
  profile: SeasonTrainingProfile | null;
};

export type AppSettings = {
  id: string;
  owner_id?: string;
  coach_name: string;
  account_email: string;
  phone: string | null;
  role: string;
  club_name: string;
  team_name: string;
  season: string;
  training_location: string | null;
  default_duration_minutes: number;
  default_goalkeeper_count: number;
};

export type PhysicalAssessmentDimension = {
  id: string;
  codice: string;
  nome: string;
  descrizione: string;
  ordine: number;
  attivo: boolean;
  objective_mappings?: Array<{
    peso: number;
    physical_objective: PhysicalObjective;
  }>;
};

export type GoalkeeperAssessmentItemType = "Tecnica" | "Fisica";

export type GoalkeeperAssessmentItem = {
  id: string;
  assessment_id: string;
  tipo: GoalkeeperAssessmentItemType;
  exercise_category_id: number | null;
  physical_dimension_id: string | null;
  score: number;
  nota: string | null;
  category?: ExerciseCategory | null;
  physical_dimension?: PhysicalAssessmentDimension | null;
};

export type GoalkeeperAssessment = {
  id: string;
  goalkeeper_id: string;
  data_valutazione: string;
  note_generali: string | null;
  created_at: string;
  items: GoalkeeperAssessmentItem[];
};

export type Goalkeeper = {
  id: string;
  nome: string;
  cognome: string;
  data_nascita: string | null;
  attivo: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  assessments: GoalkeeperAssessment[];
};

export type AssessmentBand = "Carenza alta" | "Da sviluppare" | "Adeguato" | "Buono" | "Punto forte";

export type TrainingPriority = {
  key: string;
  label: string;
  score: number;
  bonus: number;
  type: GoalkeeperAssessmentItemType;
  physical_objective_codes?: string[];
};

export type GoalkeeperTrainingPriorities = {
  goalkeeper_id: string;
  technical_priorities: TrainingPriority[];
  physical_priorities: TrainingPriority[];
  strengths: TrainingPriority[];
  weaknesses: TrainingPriority[];
  assessment_date: string | null;
  assessment_age_days: number | null;
};

export type GroupTrainingPriority = TrainingPriority & {
  average: number;
  minimum: number;
  standard_deviation: number;
  below_threshold_count: number;
  assessed_goalkeepers: number;
  selected_goalkeepers: number;
  group_bonus: number;
};

export type GenerationMode = "Automatico" | "Assistito" | "Manuale";
export type SessionBlockKind = "Attivazione" | "Tecnico principale" | "Disturbo / tecnico-fisico" | "Situazionale / Match Simulation";

export type PriorityRankingItem = {
  id: string;
  label: string;
  score: number;
  reason: string;
  factors: Record<string, number>;
  assessed: number;
  selected: number;
};

export type SessionProfile = {
  code: string;
  label: string;
  load: string;
  duration: number;
  match_day_offset: number | null;
  athletic_recall: boolean;
};

export type SessionBlock = {
  id?: string;
  training_id?: string;
  tipo_blocco: SessionBlockKind;
  ordine: number;
  durata_target: number;
  fase_metodologica_preferita: string | null;
  carico_target: string | null;
  technical_category_id: number | null;
  physical_dimension_id: string | null;
  notes: string | null;
  transition_minutes?: number;
};

export type ExerciseUsageStats = { last_used_date: string | null; days_since_last_use: number | null; uses_this_season: number; uses_last_30_days: number; uses_last_14_days: number; uses_last_7_days: number };
export type ExerciseScoreBreakdown = { technical_fit: number; physical_fit: number; methodological_fit: number; rotation_score: number; md_load_fit: number; practical_fit: number };
export type ScoredExerciseCandidate = { exercise: Exercise; exercise_score: number; breakdown: ExerciseScoreBreakdown; group_weakness_bonus: number; similarity_penalty: number; fallback_level: number; usage: ExerciseUsageStats; reasons: string[]; penalties: string[] };
export type GeneratedExerciseSelection = ScoredExerciseCandidate & { block_order: number; block_position: number; planned_duration_minutes: number; individual_variant_suggestion: string | null };
export type GeneratedSessionExercises = { seed: string; selections: GeneratedExerciseSelection[]; debug: Record<number, ScoredExerciseCandidate[]>; net_minutes: number; transition_minutes: number; total_minutes: number };

export type EditableExerciseSelection = GeneratedExerciseSelection & { session_exercise_id?: string; locked: boolean; source: SessionExerciseSource; replacement_reason?: string | null; replacement_note?: string | null; variants?: TrainingExerciseVariant[] };
export type EditableGeneratedSession = Omit<GeneratedSessionExercises,"selections"> & { selections: EditableExerciseSelection[] };
export type SessionValidationItem = { level: "success" | "warning" | "error"; code: string; message: string };
export type SessionQualityResult = { score: number; components: { technical: number; physical: number; md_load: number; methodology: number; rotation: number; duration: number; practical: number }; validation: SessionValidationItem[] };
export type TrainingExerciseVariant = { training_exercise_id?: string; goalkeeper_id: string; tipo: string; variante_individuale: string | null; motivazione: string | null; priority_source: string | null; difficolta_delta?: number | null; note?: string | null };

export type TrainingGoalkeeper = {
  goalkeeper_id: string;
  individual_focus: string | null;
};
