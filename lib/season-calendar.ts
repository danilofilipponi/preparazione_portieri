import type { AppSettings, SeasonPhaseConfig, SeasonRecallPeriod, SeasonTrainingProfile } from "./types";

export const weekDays = [
  { value: 1, short: "Lun", label: "Lunedì" }, { value: 2, short: "Mar", label: "Martedì" },
  { value: 3, short: "Mer", label: "Mercoledì" }, { value: 4, short: "Gio", label: "Giovedì" },
  { value: 5, short: "Ven", label: "Venerdì" }, { value: 6, short: "Sab", label: "Sabato" },
  { value: 7, short: "Dom", label: "Domenica" },
] as const;

export function matchDayLabel(offset: number | null | undefined) {
  if (offset === null || offset === undefined) return null;
  if (offset === 0) return "MD";
  return offset > 0 ? `MD+${offset}` : `MD${offset}`;
}

export function defaultSeasonConfiguration(settings: AppSettings) {
  const season = {
    id: "", nome_stagione: "Stagione 2026/2027", data_inizio: "2026-07-01", data_fine: "2027-06-30",
    squadra: settings.team_name, numero_portieri_standard: settings.default_goalkeeper_count, attiva: true,
  };
  const phases: Array<Omit<SeasonPhaseConfig, "id" | "season_id">> = [
    { tipo: "Pre-campionato", data_inizio: "2026-07-01", data_fine: "2026-08-31", giorni_standard_allenamento: [2, 4], giorni_riposo: [1, 3, 5, 6, 7], possibilita_doppia_seduta: false, durata_standard_seduta: 75, giorno_gara_standard: null, note: null },
    { tipo: "Campionato", data_inizio: "2026-09-01", data_fine: "2027-05-10", giorni_standard_allenamento: [2, 4], giorni_riposo: [1, 3, 5, 7], possibilita_doppia_seduta: false, durata_standard_seduta: 60, giorno_gara_standard: 6, note: null },
  ];
  const recall: Omit<SeasonRecallPeriod, "id" | "season_id"> = { data_inizio: "2026-12-28", data_fine: "2027-01-10", giorni_allenamento: [2, 4], giorni_riposo: [1, 3, 5, 7], livello_incremento_carico_fisico: "Medio", note: null, attivo: true };
  const profiles: Array<Omit<SeasonTrainingProfile, "id" | "season_id">> = [
    { nome: "MD-4", match_day_offset: -4, tipo_seduta: "Seduta principale settimanale", carico_previsto: "Medio-Alto", durata_standard: 75, caratteristiche: ["Maggiore volume", "Obiettivo tecnico principale della settimana", "Componente fisica significativa"], progressione_tecnica: ["Analitico", "Disturbo", "Situazionale"], attivo: true },
    { nome: "MD-2", match_day_offset: -2, tipo_seduta: "Seduta specifica pre-gara", carico_previsto: "Medio-Basso", durata_standard: 60, caratteristiche: ["Volume inferiore", "Maggiore qualità", "Velocità", "Reattività", "Situazioni gara", "Componente fisica controllata", "Evitare affaticamento residuo importante"], progressione_tecnica: [], attivo: true },
  ];
  return { season, phases, recall, profiles };
}
