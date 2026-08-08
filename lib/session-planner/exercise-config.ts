export const EXERCISE_SCORE_WEIGHTS = { technical: .30, physical: .20, methodological: .15, rotation: .15, mdLoad: .10, practical: .10 } as const;
export const EXERCISE_SELECTION_CONFIG = {
  scoreVersion: "fase3-v1", closeScoreRange: 3, durationTolerance: 2, expandedDurationTolerance: 5,
  transitionMinutes: 2, maxGroupWeaknessBonus: 5,
  exercisesPerBlock: { 1: [1, 1], 2: [1, 2], 3: [1, 2], 4: [1, 1] } as Record<number, [number, number]>,
};

export const PHASE_COMPATIBILITY: Record<number, Record<string, number>> = {
  1: { Generale: 100, Analitico: 95, Disturbo: 55, Situazionale: 25, "Integrato guidato": 45, "Integrato variabile": 30, "Situazionale complesso": 20, "Scenario aperto": 15 },
  2: { Analitico: 100, Disturbo: 78, "Integrato guidato": 60, Situazionale: 35 },
  3: { Disturbo: 100, "Integrato guidato": 85, "Integrato variabile": 75, Analitico: 55, Situazionale: 65 },
  4: { Situazionale: 95, "Integrato guidato": 82, "Integrato variabile": 92, "Situazionale complesso": 100, "Scenario aperto": 100, Disturbo: 55 },
};

export const ROLE_FIT = { Principale: 100, Secondario: 80, Complementare: 55 } as const;
