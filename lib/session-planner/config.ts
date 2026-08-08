import type { SessionBlockKind } from "../types.ts";

export const TECHNICAL_WEIGHTS = { weakness: .30, maintenance: .20, trend: .15, rotation: .15, matchDay: .10, continuity: .10 } as const;
export const PHYSICAL_WEIGHTS = { matchDay: .30, season: .20, recall: .15, weakness: .15, technical: .10, rotation: .10 } as const;

export const BLOCK_KINDS: SessionBlockKind[] = ["Attivazione", "Tecnico principale", "Disturbo / tecnico-fisico", "Situazionale / Match Simulation"];

export const BLOCK_PROFILES: Record<string, { percentages: number[]; load: string; phases: string[] }> = {
  "MD-5": { percentages: [15, 30, 27, 28], load: "Alto", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
  "MD-4": { percentages: [12.5, 32.5, 27.5, 27.5], load: "Medio-Alto", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
  "MD-3": { percentages: [15, 32, 25, 28], load: "Medio", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
  "MD-2": { percentages: [15, 30, 20, 35], load: "Medio-Basso", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
  "MD-1": { percentages: [20, 25, 15, 40], load: "Basso", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
  "MD+1": { percentages: [25, 25, 20, 30], load: "Recupero", phases: ["Generale", "Analitico", "Disturbo", "Situazionale"] },
  "PRE": { percentages: [15, 30, 30, 25], load: "Alto", phases: ["Generale", "Analitico", "Disturbo", "Situazionale"] },
  "RECALL": { percentages: [15, 25, 35, 25], load: "Medio-Alto", phases: ["Generale", "Analitico", "Disturbo", "Situazionale"] },
  "DEFAULT": { percentages: [15, 30, 25, 30], load: "Medio", phases: ["Analitico", "Analitico", "Disturbo", "Situazionale"] },
};
