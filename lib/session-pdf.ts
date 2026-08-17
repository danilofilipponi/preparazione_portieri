import type { EvaluationFieldPayload, EvaluationReliability } from "./evaluation-field";

export function sanitizePdfFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 72) || "keeperlab";
}

export function trainingPdfFilename(date: string, title: string) {
  return `seduta_${date}_${sanitizePdfFilename(title)}.pdf`;
}

function goalkeeperFilename(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return sanitizePdfFilename(name);
  return sanitizePdfFilename(`${parts.at(-1)}_${parts.slice(0, -1).join("_")}`).replace(/-/g, "_");
}

export function evaluationPdfFilename(payload: EvaluationFieldPayload) {
  const prefix = payload.session.evaluation_type === "Reassessment" ? "rivalutazione" : "valutazione";
  return `${prefix}_${goalkeeperFilename(payload.session.goalkeeper_name)}_${payload.session.date}.pdf`;
}

export function formatPdfDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

export function evaluationTypeLabel(type: EvaluationFieldPayload["session"]["evaluation_type"]) {
  return type === "Complete" ? "Completa" : type === "Targeted" ? "Mirata" : type === "Custom" ? "Personalizzata" : "Rivalutazione";
}

export function reliabilityLabel(value: EvaluationReliability) {
  return value === "STRONG" ? "Forte" : value === "GOOD" ? "Buona" : value === "LIMITED" ? "Limitata" : "Insufficiente";
}

export function compactFieldText(value: string | null | undefined, fallback = "Non specificato") {
  return value?.trim() || fallback;
}
