export type ExerciseCategory = {
  id: number;
  nome: string;
  attivo: boolean;
};

export type MethodologicalPhase = "Analitico" | "Disturbo" | "Situazionale" | "Generale";
export type CatalogPhase = Exclude<MethodologicalPhase, "Generale">;
export type ExerciseIntensity = "Bassa" | "Media" | "Alta";

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
  difficolta: 1 | 2 | 3;
  materiale: string;
  variante: string | null;
  coaching_points: string;
  errori_comuni: string;
  schema_step_1: string | null;
  schema_step_2: string | null;
  schema_step_3: string | null;
  schema_step_4: string | null;
  schema_step_5: string | null;
  schema_url: string | null;
  foto_url: string | null;
  attivo: boolean;
  category?: ExerciseCategory;
  subcategory?: ExerciseSubcategory;
};

export type TrainingExercise = {
  id: string;
  position: number;
  planned_duration_minutes: number;
  notes: string | null;
  exercise: Exercise;
};

export type Training = {
  id: string;
  training_date: string;
  planned_duration_minutes: number;
  goalkeeper_count: number;
  notes: string | null;
  status: "planned" | "completed" | "cancelled";
  training_objectives: { objective: string }[];
  training_exercises: TrainingExercise[];
};

export type AppSettings = {
  id: "default";
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
