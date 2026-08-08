import { EXERCISE_SCORE_WEIGHTS, EXERCISE_SELECTION_CONFIG, PHASE_COMPATIBILITY, ROLE_FIT } from "./exercise-config.ts";
import type { Exercise, ExerciseUsageStats, GeneratedExerciseSelection, GeneratedSessionExercises, PhysicalAssessmentDimension, PriorityRankingItem, ScoredExerciseCandidate, SessionBlock, SessionProfile } from "../types.ts";

export type ExerciseHistoryEntry = { exercise_id: string; training_date: string; season_id?: string | null };
export type ExerciseSelectionInput = {
  seed: string; date: string; seasonId?: string | null; profile: SessionProfile; goalkeeperCount: number;
  exercises: Exercise[]; blocks: SessionBlock[]; technicalPrimaryId: number | null; technicalSecondaryId: number | null;
  physicalPrimaryId: string | null; physicalDimensions: PhysicalAssessmentDimension[]; history: ExerciseHistoryEntry[];
  technicalPriorities?: PriorityRankingItem[]; physicalPriorities?: PriorityRankingItem[];
};

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
const dayDiff = (from: string, to: string) => Math.max(0, Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000));
const lower = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase("it");

export function calculateExerciseUsage(exerciseId: string, history: ExerciseHistoryEntry[], date: string, seasonId?: string | null): ExerciseUsageStats {
  const past = history.filter(item => item.exercise_id === exerciseId && item.training_date <= date).sort((a, b) => b.training_date.localeCompare(a.training_date));
  const days = past[0] ? dayDiff(past[0].training_date, date) : null;
  return { last_used_date: past[0]?.training_date ?? null, days_since_last_use: days, uses_this_season: past.filter(item => !seasonId || item.season_id === seasonId).length, uses_last_30_days: past.filter(item => dayDiff(item.training_date, date) <= 30).length, uses_last_14_days: past.filter(item => dayDiff(item.training_date, date) <= 14).length, uses_last_7_days: past.filter(item => dayDiff(item.training_date, date) <= 7).length };
}

export function calculateRotationScore(usage: ExerciseUsageStats) {
  const days = usage.days_since_last_use;
  let base = days === null || days > 30 ? 100 : days >= 22 ? 90 : days >= 15 ? 75 : days >= 8 ? 50 : days >= 4 ? 20 : 5;
  base -= Math.max(0, usage.uses_last_30_days - 1) * 6 + Math.max(0, usage.uses_last_14_days - 1) * 5 + Math.max(0, usage.uses_last_7_days - 1) * 8;
  return clamp(base);
}

function essentialData(exercise: Exercise) { return Boolean(exercise.id && exercise.codice && exercise.nome && exercise.category_id && exercise.fase && exercise.durata_min > 0 && exercise.intensita); }
function phaseAllowed(block: SessionBlock, exercise: Exercise, fallback: number) {
  if (fallback >= 2) return true;
  const score = PHASE_COMPATIBILITY[block.ordine]?.[exercise.fase] ?? 0;
  return score >= (block.ordine === 4 ? 75 : 70);
}
function categoryAllowed(block: SessionBlock, exercise: Exercise, input: ExerciseSelectionInput, fallback: number) {
  const category = lower(exercise.categoria || exercise.category?.nome);
  if (block.ordine === 1) return fallback >= 4 || !category.includes("match simulation");
  if (block.ordine === 2) return fallback >= 4 || (!category.includes("tema libero") && !category.includes("match simulation") && (exercise.category_id === input.technicalPrimaryId || fallback >= 1));
  if (block.ordine === 3) return fallback >= 4 || (!category.includes("tema libero") && (exercise.category_id === input.technicalPrimaryId || exercise.category_id === input.technicalSecondaryId || fallback >= 1));
  return fallback >= 2 || category.includes("match simulation") || exercise.category_id === input.technicalPrimaryId || exercise.category_id === input.technicalSecondaryId;
}

export function getExerciseCandidates(input: ExerciseSelectionInput, block: SessionBlock, fallbackLevel = 0) {
  const transition = block.transition_minutes ?? EXERCISE_SELECTION_CONFIG.transitionMinutes;
  const netTarget = Math.max(5, block.durata_target - transition);
  const tolerance = fallbackLevel >= 3 ? EXERCISE_SELECTION_CONFIG.expandedDurationTolerance : EXERCISE_SELECTION_CONFIG.durationTolerance;
  return input.exercises.filter(exercise => exercise.attivo && essentialData(exercise)
    && input.goalkeeperCount >= exercise.portieri_min && input.goalkeeperCount <= exercise.portieri_max
    && exercise.durata_min <= netTarget + tolerance
    && phaseAllowed(block, exercise, fallbackLevel) && categoryAllowed(block, exercise, input, fallbackLevel));
}

export function technicalFit(exercise: Exercise, block: SessionBlock, input: ExerciseSelectionInput) {
  const category = lower(exercise.categoria || exercise.category?.nome); const text = lower(`${exercise.nome} ${exercise.obiettivo} ${exercise.scenario_gara}`);
  const primary = exercise.category_id === input.technicalPrimaryId; const secondary = exercise.category_id === input.technicalSecondaryId;
  if (block.ordine === 1) return clamp(primary ? 75 : /presa|piede|coordin|rapid|reatt|tema libero/.test(category + text) ? 90 : 55);
  if (block.ordine === 2) return primary ? 100 : secondary ? 72 : category.includes("tema libero") ? 20 : 42;
  if (block.ordine === 3) return primary ? 95 : secondary ? 88 : 48;
  if (category.includes("match simulation")) {
    const scenarioBonus = /finalizz|seconda palla|cross|1vs1|decision/.test(text) ? 12 : 0;
    const focusBonus = /presa|uscit|tuff|parat|1vs1|posizion/.test(text) ? 8 : 0;
    return clamp(76 + scenarioBonus + focusBonus);
  }
  return primary ? 82 : secondary ? 78 : exercise.fase.includes("Situaz") || exercise.fase.includes("Scenario") ? 70 : 38;
}

export function physicalFit(exercise: Exercise, input: ExerciseSelectionInput) {
  if (!input.physicalPrimaryId) return 55;
  const dimension = input.physicalDimensions.find(item => item.id === input.physicalPrimaryId);
  const targetIds = new Set((dimension?.objective_mappings ?? []).map(item => item.physical_objective.id));
  const matches = (exercise.physical_mappings ?? []).filter(mapping => mapping.attivo && targetIds.has(mapping.physical_objective_id)).map(mapping => {
    const role = ROLE_FIT[mapping.ruolo] ?? 45; const weightFactor = .6 + Number(mapping.peso) * .08;
    return role * weightFactor;
  }).sort((a, b) => b - a);
  return matches.length ? clamp(matches[0] + Math.min(8, matches.slice(1).reduce((sum, value) => sum + value * .05, 0))) : 20;
}

export function methodologicalFit(exercise: Exercise, block: SessionBlock) { return clamp(PHASE_COMPATIBILITY[block.ordine]?.[exercise.fase] ?? 25); }
export function mdLoadFit(exercise: Exercise, block: SessionBlock, profile: SessionProfile) {
  const intensity = { Bassa: 25, "Bassa-Media": 40, Media: 60, "Media-Alta": 80, Alta: 100 }[exercise.intensita] ?? 60;
  const text = lower(`${exercise.obiettivo} ${exercise.descrizione} ${exercise.numero_azioni} ${exercise.scenario_gara}`);
  if (profile.match_day_offset !== null && profile.match_day_offset >= -2) {
    let score = 100 - Math.abs(intensity - 45) * 1.2;
    if (/reatt|rapid|precision|situaz|decision|match/.test(text)) score += 15;
    if (/metabolic|continu|alta dens|ripetut/.test(text) || exercise.intensita === "Alta") score -= 30;
    if (block.ordine === 4 && /situaz|match|decision/.test(text)) score += 10;
    return clamp(score);
  }
  if (profile.match_day_offset !== null && profile.match_day_offset <= -4) return clamp(100 - Math.abs(intensity - 78));
  return clamp(100 - Math.abs(intensity - 60));
}

export function practicalFit(exercise: Exercise, block: SessionBlock, input: ExerciseSelectionInput, fallbackLevel: number) {
  const target = Math.max(5, block.durata_target - (block.transition_minutes ?? EXERCISE_SELECTION_CONFIG.transitionMinutes));
  const duration = clamp(100 - Math.abs(target - exercise.durata_min) * 4);
  const keeperSpan = exercise.portieri_max - exercise.portieri_min; const keepers = input.goalkeeperCount === exercise.portieri_min || input.goalkeeperCount === exercise.portieri_max ? 88 : keeperSpan > 0 ? 100 : 92;
  const difficulty = input.profile.match_day_offset !== null && input.profile.match_day_offset >= -2 && exercise.difficolta >= 5 ? 65 : 95;
  return clamp(duration * .55 + keepers * .25 + difficulty * .20 - fallbackLevel * 2);
}

function similarityPenalty(exercise: Exercise, selected: GeneratedExerciseSelection[]) {
  let penalty = 0;
  for (const previous of selected) {
    if (previous.exercise.subcategory_id === exercise.subcategory_id) penalty = Math.max(penalty, 18);
    else if (previous.exercise.category_id === exercise.category_id) penalty = Math.max(penalty, 8);
    const left = new Set(lower(previous.exercise.nome).split(/\W+/).filter(word => word.length > 4)); const right = lower(exercise.nome).split(/\W+/).filter(word => word.length > 4);
    if (right.filter(word => left.has(word)).length >= 2) penalty = Math.max(penalty, 15);
  }
  return penalty;
}

export function scoreExercise(exercise: Exercise, block: SessionBlock, input: ExerciseSelectionInput, fallbackLevel: number, selected: GeneratedExerciseSelection[] = []): ScoredExerciseCandidate {
  const usage = calculateExerciseUsage(exercise.id, input.history, input.date, input.seasonId);
  const breakdown = { technical_fit: technicalFit(exercise, block, input), physical_fit: physicalFit(exercise, input), methodological_fit: methodologicalFit(exercise, block), rotation_score: calculateRotationScore(usage), md_load_fit: mdLoadFit(exercise, block, input.profile), practical_fit: practicalFit(exercise, block, input, fallbackLevel) };
  const weaknessFactor = input.technicalPriorities?.find(item => item.id === String(exercise.category_id))?.factors.weakness ?? 0;
  const groupBonus = clamp(weaknessFactor / 20);
  const similarity = similarityPenalty(exercise, selected); const fallbackPenalty = fallbackLevel * 2;
  const base = breakdown.technical_fit * EXERCISE_SCORE_WEIGHTS.technical + breakdown.physical_fit * EXERCISE_SCORE_WEIGHTS.physical + breakdown.methodological_fit * EXERCISE_SCORE_WEIGHTS.methodological + breakdown.rotation_score * EXERCISE_SCORE_WEIGHTS.rotation + breakdown.md_load_fit * EXERCISE_SCORE_WEIGHTS.mdLoad + breakdown.practical_fit * EXERCISE_SCORE_WEIGHTS.practical;
  const reasons = [breakdown.technical_fit >= 80 ? "coerente con il focus tecnico" : "categoria complementare", breakdown.physical_fit >= 75 ? "forte compatibilità fisica" : breakdown.physical_fit >= 45 ? "compatibilità fisica parziale" : "contributo fisico secondario", `fase ${exercise.fase} adatta al blocco`, usage.days_since_last_use === null ? "mai utilizzato" : `ultimo utilizzo ${usage.days_since_last_use} giorni fa`, `compatibile con ${input.goalkeeperCount} portieri`, `carico adatto a ${input.profile.code}`];
  const penalties = [...(similarity ? [`somiglianza con un esercizio già selezionato (-${similarity})`] : []), ...(fallbackLevel ? [`fallback livello ${fallbackLevel}`] : []), ...(breakdown.rotation_score <= 20 ? ["utilizzo molto recente"] : [])];
  return { exercise, exercise_score: clamp(base + Math.min(EXERCISE_SELECTION_CONFIG.maxGroupWeaknessBonus, groupBonus) - similarity - fallbackPenalty), breakdown, group_weakness_bonus: Math.min(EXERCISE_SELECTION_CONFIG.maxGroupWeaknessBonus, groupBonus), similarity_penalty: similarity, fallback_level: fallbackLevel, usage, reasons, penalties };
}

export function scoreExerciseCandidates(exercises: Exercise[], block: SessionBlock, input: ExerciseSelectionInput, fallback: number, selected: GeneratedExerciseSelection[] = []) { return exercises.map(exercise => scoreExercise(exercise, block, input, fallback, selected)).sort((a, b) => b.exercise_score - a.exercise_score || a.exercise.codice.localeCompare(b.exercise.codice)); }
export function getControlledVarietyPool(candidates: ScoredExerciseCandidate[], range = EXERCISE_SELECTION_CONFIG.closeScoreRange) { return candidates.length ? candidates.filter(item => candidates[0].exercise_score - item.exercise_score <= range) : []; }
function seededUnit(seed: string) { let hash = 2166136261; for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); hash += hash << 13; hash ^= hash >>> 7; hash += hash << 3; hash ^= hash >>> 17; hash += hash << 5; return (hash >>> 0) / 4294967296; }
function chooseControlled(pool: ScoredExerciseCandidate[], seed: string) { const weights = pool.map(item => Math.exp((item.exercise_score - pool[0].exercise_score) / 1.5)); const total = weights.reduce((a,b)=>a+b,0); let cursor = seededUnit(seed) * total; for(let i=0;i<pool.length;i++){ cursor -= weights[i]; if(cursor<=0) return pool[i]; } return pool[0]; }

export function selectExercisesForBlock(block: SessionBlock, input: ExerciseSelectionInput, selected: GeneratedExerciseSelection[]) {
  let fallback = 0; let ranked: ScoredExerciseCandidate[] = [];
  while (fallback <= 5 && !ranked.length) { ranked = scoreExerciseCandidates(getExerciseCandidates(input, block, fallback).filter(item => !selected.some(chosen => chosen.exercise.id === item.id)), block, input, fallback, selected); if (!ranked.length) fallback += 1; }
  const debug = ranked.slice(0, 10); if (!ranked.length) return { selections: [] as GeneratedExerciseSelection[], debug, fallback };
  const netTarget = Math.max(5, block.durata_target - (block.transition_minutes ?? EXERCISE_SELECTION_CONFIG.transitionMinutes));
  const [, max] = EXERCISE_SELECTION_CONFIG.exercisesPerBlock[block.ordine] ?? [1,1]; const count = max > 1 && netTarget >= 22 ? 2 : 1; const chosen: ScoredExerciseCandidate[] = [];
  for (let position=0; position<count; position++) { const rescored = scoreExerciseCandidates(ranked.filter(item => !chosen.some(active => active.exercise.id === item.exercise.id)).map(item => item.exercise), block, input, fallback, [...selected, ...chosen.map((item,index) => ({...item,block_order:block.ordine,block_position:index,planned_duration_minutes:item.exercise.durata_min,individual_variant_suggestion:null}))]); const pool = getControlledVarietyPool(rescored); if(!pool.length) break; chosen.push(chooseControlled(pool, `${input.seed}:${block.ordine}:${position}`)); }
  const durationBase = chosen.reduce((sum,item)=>sum+item.exercise.durata_min,0) || 1; let assigned = 0;
  const selections = chosen.map((item,index) => { const duration = index === chosen.length-1 ? netTarget-assigned : Math.max(5, Math.round(netTarget * item.exercise.durata_min / durationBase)); assigned += duration; return { ...item, block_order:block.ordine, block_position:index, planned_duration_minutes:duration, individual_variant_suggestion:null }; });
  return { selections, debug, fallback };
}

export function selectSessionExercises(input: ExerciseSelectionInput): GeneratedSessionExercises {
  const selections: GeneratedExerciseSelection[] = []; const debug: Record<number, ScoredExerciseCandidate[]> = {};
  for (const block of [...input.blocks].sort((a,b)=>a.ordine-b.ordine)) { const result = selectExercisesForBlock(block,input,selections); selections.push(...result.selections); debug[block.ordine]=result.debug; }
  const net = selections.reduce((sum,item)=>sum+item.planned_duration_minutes,0); const transitions = input.blocks.reduce((sum,item)=>sum+(item.transition_minutes ?? EXERCISE_SELECTION_CONFIG.transitionMinutes),0);
  return { seed:input.seed,selections,debug,net_minutes:net,transition_minutes:transitions,total_minutes:net+transitions };
}
