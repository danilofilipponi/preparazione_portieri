import { BLOCK_KINDS, BLOCK_PROFILES, PHYSICAL_WEIGHTS, TECHNICAL_WEIGHTS } from "./config.ts";
import type { ExerciseCategory, Goalkeeper, PhysicalAssessmentDimension, PriorityRankingItem, SessionBlock, SessionProfile } from "../types.ts";

const clamp100 = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
export const individualWeakness = (score: number) => clamp100(Math.max(0, (8 - score) / 8) * 100);

function latestScores(goalkeepers: Goalkeeper[], type: "Tecnica" | "Fisica", target: string | number) {
  return goalkeepers.flatMap(goalkeeper => {
    const assessments = [...(goalkeeper.assessments ?? [])].sort((a, b) => b.data_valutazione.localeCompare(a.data_valutazione));
    const values = assessments.slice(0, 2).map(assessment => assessment.items.find(item => item.tipo === type && (type === "Tecnica" ? item.exercise_category_id === target : item.physical_dimension_id === target))?.score).filter((value): value is number => value !== undefined).map(Number);
    return values.length ? [{ goalkeeperId: goalkeeper.id, latest: values[0], previous: values[1] }] : [];
  });
}

export function groupWeakness(scores: number[], selectedCount = scores.length) {
  if (!scores.length || !selectedCount) return 0;
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const minimum = Math.min(...scores);
  const below = scores.filter(value => value < 6.5).length / scores.length;
  const spread = Math.min(1, Math.sqrt(scores.reduce((sum, value) => sum + (value - average) ** 2, 0) / scores.length) / 2.5);
  const consistency = 1 - spread;
  const raw = individualWeakness(average) * .40 + below * 100 * .35 + individualWeakness(minimum) * .10 + consistency * 100 * .10;
  return clamp100(raw * (scores.length / selectedCount));
}

export function maintenanceScore(daysSinceUse: number | null) {
  if (daysSinceUse === null) return 100;
  if (daysSinceUse <= 7) return 0;
  if (daysSinceUse <= 14) return clamp100((daysSinceUse - 7) / 7 * 25);
  if (daysSinceUse <= 21) return clamp100(25 + (daysSinceUse - 14) / 7 * 25);
  if (daysSinceUse <= 28) return clamp100(50 + (daysSinceUse - 21) / 7 * 25);
  return clamp100(75 + Math.min(25, (daysSinceUse - 28) / 28 * 25));
}

function technicalMdScore(name: string, offset: number | null) {
  if (offset === null) return 60;
  const lower = name.toLowerCase();
  if (offset >= -2 && (lower.includes("reatt") || lower.includes("posizion") || lower.includes("match") || lower.includes("1v1"))) return 95;
  if (offset <= -4 && (lower.includes("tecnica") || lower.includes("tuff") || lower.includes("presa"))) return 90;
  return offset === -1 ? 55 : 70;
}

export function rankTechnicalPriorities(input: { categories: ExerciseCategory[]; goalkeepers: Goalkeeper[]; matchDayOffset: number | null; daysSinceUse?: Record<number, number | null>; usage?: Record<number, number>; weeklyPrimaryId?: number | null; weeklySecondaryId?: number | null }): PriorityRankingItem[] {
  const usageValues = Object.values(input.usage ?? {}); const averageUsage = usageValues.length ? usageValues.reduce((a, b) => a + b, 0) / usageValues.length : 0;
  return input.categories.filter(item => item.attivo).map(category => {
    const scores = latestScores(input.goalkeepers, "Tecnica", category.id);
    const weakness = groupWeakness(scores.map(item => item.latest), input.goalkeepers.length);
    const trends = scores.filter(item => item.previous !== undefined).map(item => item.latest - Number(item.previous));
    const trend = trends.length ? clamp100(50 - trends.reduce((a, b) => a + b, 0) / trends.length * 12.5) : 50;
    const maintenance = maintenanceScore(input.daysSinceUse?.[category.id] ?? null);
    const count = input.usage?.[category.id] ?? 0;
    const rotation = averageUsage ? clamp100(50 + (averageUsage - count) / Math.max(1, averageUsage) * 50) : 50;
    const matchDay = technicalMdScore(category.nome, input.matchDayOffset);
    const continuity = category.id === input.weeklyPrimaryId ? 100 : category.id === input.weeklySecondaryId ? 70 : 40;
    const factors = { weakness, maintenance, trend, rotation, matchDay, continuity };
    const score = clamp100(Object.entries(TECHNICAL_WEIGHTS).reduce((sum, [key, weight]) => sum + factors[key as keyof typeof factors] * weight, 0));
    const reason = weakness >= 35 ? "Carenza di gruppo rilevante" : maintenance >= 75 ? "Tema da richiamare" : matchDay >= 90 ? "Coerente con il Match Day" : continuity >= 70 ? "Continuità con il focus settimanale" : "Buon equilibrio metodologico";
    return { id: String(category.id), label: category.nome, score, reason, factors, assessed: scores.length, selected: input.goalkeepers.length };
  }).sort((a, b) => b.score - a.score);
}

function physicalMdScore(name: string, offset: number | null) {
  const lower = name.toLowerCase();
  if (offset !== null && offset >= -2) return lower.includes("reatt") || lower.includes("rapid") || lower.includes("coordin") || lower.includes("orient") ? 100 : lower.includes("forza") ? 20 : 55;
  if (offset !== null && offset <= -4) return lower.includes("forza") || lower.includes("esplos") || lower.includes("acceler") ? 95 : 65;
  return 65;
}

export function rankPhysicalPriorities(input: { dimensions: PhysicalAssessmentDimension[]; goalkeepers: Goalkeeper[]; matchDayOffset: number | null; preseason?: boolean; athleticRecall?: boolean; technicalFocusLabel?: string; usage?: Record<string, number> }): PriorityRankingItem[] {
  const usageValues = Object.values(input.usage ?? {}); const averageUsage = usageValues.length ? usageValues.reduce((a, b) => a + b, 0) / usageValues.length : 0;
  return input.dimensions.filter(item => item.attivo).map(dimension => {
    const scores = latestScores(input.goalkeepers, "Fisica", dimension.id);
    const weakness = groupWeakness(scores.map(item => item.latest), input.goalkeepers.length);
    const matchDay = physicalMdScore(dimension.nome, input.matchDayOffset);
    const season = input.preseason ? (/forza|esplos|acceler/i.test(dimension.nome) ? 95 : 70) : 65;
    const recall = input.athleticRecall ? (/forza|esplos|repeated|recupero/i.test(dimension.nome) ? 100 : 65) : 50;
    const technical = input.technicalFocusLabel && /tuff|1v1|parat/i.test(input.technicalFocusLabel) && /esplos|reatt|stabil/i.test(dimension.nome) ? 90 : 60;
    const count = input.usage?.[dimension.id] ?? 0;
    const rotation = averageUsage ? clamp100(50 + (averageUsage - count) / Math.max(1, averageUsage) * 50) : 50;
    const factors = { matchDay, season, recall, weakness, technical, rotation };
    const score = clamp100(Object.entries(PHYSICAL_WEIGHTS).reduce((sum, [key, weight]) => sum + factors[key as keyof typeof factors] * weight, 0));
    const reason = matchDay >= 95 ? "Compatibilità elevata con il Match Day" : input.athleticRecall && recall >= 90 ? "Priorità del richiamo atletico" : weakness >= 35 ? "Carenza fisica del gruppo" : "Equilibrio fisico della seduta";
    return { id: dimension.id, label: dimension.nome, score, reason, factors, assessed: scores.length, selected: input.goalkeepers.length };
  }).sort((a, b) => b.score - a.score);
}

export function buildSessionProfile(input: { matchDayOffset: number | null; preseason?: boolean; athleticRecall?: boolean; plannedLoad?: string | null; duration: number }): SessionProfile {
  const code = input.athleticRecall ? "RECALL" : input.preseason ? "PRE" : input.matchDayOffset === null ? "DEFAULT" : input.matchDayOffset === 0 ? "MD" : `MD${input.matchDayOffset > 0 ? "+" : ""}${input.matchDayOffset}`;
  const config = BLOCK_PROFILES[code] ?? BLOCK_PROFILES.DEFAULT;
  return { code, label: input.athleticRecall ? "Richiamo atletico" : input.preseason ? "Pre-campionato" : code === "DEFAULT" ? "Seduta standard" : code, load: input.plannedLoad || config.load, duration: input.duration, match_day_offset: input.matchDayOffset, athletic_recall: Boolean(input.athleticRecall) };
}

export function buildSessionBlocks(profile: SessionProfile, technicalCategoryId: number | null, physicalDimensionId: string | null): SessionBlock[] {
  const config = BLOCK_PROFILES[profile.code] ?? BLOCK_PROFILES.DEFAULT;
  const raw = config.percentages.map(value => profile.duration * value / 100);
  const rounded = raw.map(value => Math.max(1, Math.round(value / 5) * 5));
  rounded[rounded.length - 1] += profile.duration - rounded.reduce((a, b) => a + b, 0);
  return BLOCK_KINDS.map((kind, index) => ({ tipo_blocco: kind, ordine: index + 1, durata_target: rounded[index], fase_metodologica_preferita: config.phases[index], carico_target: profile.load, technical_category_id: technicalCategoryId, physical_dimension_id: index === 2 ? physicalDimensionId : null, notes: null, transition_minutes: 2 }));
}

export * from "./exercise-selection.ts";
export * from "./session-regeneration.ts";
export * from "./session-quality.ts";
export * from "./individual-variants.ts";
