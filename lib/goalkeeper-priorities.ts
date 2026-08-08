import { supabase } from "./supabase";
import type { AssessmentBand, GoalkeeperAssessment, GoalkeeperAssessmentItem, GoalkeeperTrainingPriorities, GroupTrainingPriority, TrainingPriority } from "./types";

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function assessmentPriorityBonus(score: number) {
  return Math.pow(clamp((9 - score) / 6), 1.35);
}

export function assessmentBand(score: number): AssessmentBand {
  if (score < 5) return "Carenza alta";
  if (score < 6.5) return "Da sviluppare";
  if (score < 8) return "Adeguato";
  if (score < 9) return "Buono";
  return "Punto forte";
}

export function formatAssessmentScore(score: number) {
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(score);
}

export function assessmentAgeDays(date: string, today = new Date()) {
  const assessmentDate = new Date(`${date}T12:00:00`);
  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.max(0, Math.floor((currentDate.getTime() - assessmentDate.getTime()) / 86_400_000));
}

export function assessmentAverage(assessment: GoalkeeperAssessment | null, type: "Tecnica" | "Fisica") {
  const scores = assessment?.items.filter(item => item.tipo === type).map(item => Number(item.score)) ?? [];
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function itemLabel(item: GoalkeeperAssessmentItem) {
  return item.tipo === "Tecnica" ? item.category?.nome ?? "Categoria tecnica" : item.physical_dimension?.nome ?? "Capacità fisica";
}

function itemKey(item: GoalkeeperAssessmentItem) {
  return item.tipo === "Tecnica" ? `technical:${item.exercise_category_id}` : `physical:${item.physical_dimension_id}`;
}

function toPriority(item: GoalkeeperAssessmentItem): TrainingPriority {
  return {
    key: itemKey(item),
    label: itemLabel(item),
    score: Number(item.score),
    bonus: assessmentPriorityBonus(Number(item.score)),
    type: item.tipo,
    physical_objective_codes: item.physical_dimension?.objective_mappings?.map(mapping => mapping.physical_objective.codice),
  };
}

export function prioritiesFromAssessment(goalkeeperId: string, assessment: GoalkeeperAssessment | null): GoalkeeperTrainingPriorities {
  const priorities = assessment?.items.map(toPriority).sort((a, b) => b.bonus - a.bonus) ?? [];
  return {
    goalkeeper_id: goalkeeperId,
    technical_priorities: priorities.filter(item => item.type === "Tecnica"),
    physical_priorities: priorities.filter(item => item.type === "Fisica"),
    strengths: priorities.filter(item => item.score >= 9).sort((a, b) => b.score - a.score),
    weaknesses: priorities.filter(item => item.score < 6.5),
    assessment_date: assessment?.data_valutazione ?? null,
    assessment_age_days: assessment ? assessmentAgeDays(assessment.data_valutazione) : null,
  };
}

const assessmentSelect = "id,goalkeeper_id,data_valutazione,note_generali,created_at,items:goalkeeper_assessment_items(id,assessment_id,tipo,exercise_category_id,physical_dimension_id,score,nota,category:exercise_categories(id,nome,attivo),physical_dimension:physical_assessment_dimensions(id,codice,nome,descrizione,ordine,attivo,objective_mappings:physical_assessment_dimension_objectives(peso,physical_objective:physical_objectives(*))))";

export async function getGoalkeeperTrainingPriorities(goalkeeperId: string): Promise<GoalkeeperTrainingPriorities> {
  if (!supabase) return prioritiesFromAssessment(goalkeeperId, null);
  const { data, error } = await supabase.from("goalkeeper_assessments").select(assessmentSelect).eq("goalkeeper_id", goalkeeperId).order("data_valutazione", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return prioritiesFromAssessment(goalkeeperId, (data ?? null) as unknown as GoalkeeperAssessment | null);
}

export async function getGroupTrainingPriorities(goalkeeperIds: string[], threshold = 6.5): Promise<GroupTrainingPriority[]> {
  const individual = await Promise.all(goalkeeperIds.map(getGoalkeeperTrainingPriorities));
  const groups = new Map<string, TrainingPriority[]>();
  for (const goalkeeper of individual) {
    for (const priority of [...goalkeeper.technical_priorities, ...goalkeeper.physical_priorities]) {
      groups.set(priority.key, [...(groups.get(priority.key) ?? []), priority]);
    }
  }
  return Array.from(groups.values()).map(values => {
    const scores = values.map(item => item.score);
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const minimum = Math.min(...scores);
    const standardDeviation = Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length);
    const belowThresholdCount = scores.filter(score => score < threshold).length;
    const groupBonus = clamp(0.6 * assessmentPriorityBonus(average) + 0.25 * (belowThresholdCount / scores.length) + 0.15 * assessmentPriorityBonus(minimum));
    return {
      ...values[0], score: average, bonus: groupBonus, average, minimum,
      standard_deviation: standardDeviation, below_threshold_count: belowThresholdCount,
      assessed_goalkeepers: scores.length, selected_goalkeepers: goalkeeperIds.length, group_bonus: groupBonus,
    };
  }).sort((a, b) => b.group_bonus - a.group_bonus);
}
