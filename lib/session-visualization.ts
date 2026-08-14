import type { Exercise, TrainingExerciseVariant } from "./types";

export type SessionDisplayExercise = {
  id: string;
  exercise: Exercise;
  plannedDuration: number;
  blockOrder: number;
  blockPosition: number;
  locked: boolean;
  reasons: string[];
  variants: TrainingExerciseVariant[];
};

export function groupSessionExercises(items: SessionDisplayExercise[], blockOrder: number) {
  return items
    .filter(item => item.blockOrder === blockOrder)
    .sort((left, right) => left.blockPosition - right.blockPosition);
}

export function getExerciseProcedure(exercise: Exercise) {
  return [exercise.schema_step_1, exercise.schema_step_2, exercise.schema_step_3, exercise.schema_step_4, exercise.schema_step_5]
    .filter((step): step is string => Boolean(step?.trim()));
}

export function getQuickCoachingPoints(exercise: Exercise) {
  return (exercise.coaching_points || "")
    .split(/[;\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function getFieldModeIndex(current: number, direction: -1 | 1, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(total - 1, current + direction));
}

export function variantsForGoalkeeper(items: TrainingExerciseVariant[], goalkeeperId: string) {
  return items.filter(item => item.goalkeeper_id === goalkeeperId && Boolean(item.variante_individuale));
}
