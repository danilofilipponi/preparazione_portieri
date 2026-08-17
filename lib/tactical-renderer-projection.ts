import type { TacticalRenderContext } from "./tactical-renderer-framing";

export type TacticalProjectedPoint = { x: number; y: number };

export const tacticalPerspectiveStrength: Record<TacticalRenderContext, number> = {
  compact: 0.065,
  detail: 0.1,
  field: 0.085,
  editor: 0,
};

export const tacticalWidePerspectiveStrength: Record<TacticalRenderContext, number> = {
  compact: 0.045,
  detail: 0.075,
  field: 0.065,
  editor: 0.065,
};

export const tacticalHorizontalExpansion: Record<TacticalRenderContext, number> = {
  compact: 0.96,
  detail: 0.93,
  field: 0.96,
  editor: 0.96,
};

/** Proiezione esclusivamente visuale: il JSON tattico continua a usare coordinate 2D 0–100. */
export function projectTacticalPoint(x: number, y: number, strength: number, horizontalExpansion = 1): TacticalProjectedPoint {
  const depth = Math.max(0, Math.min(1, y / 100));
  const horizontalScale = 1 - strength * (1 - depth);
  return { x: 50 + (x - 50) * horizontalScale * horizontalExpansion, y };
}

/** Converte il punto visuale prospettico nelle coordinate 2D 0–100 salvate nel diagramma. */
export function unprojectTacticalPoint(x: number, y: number, strength: number, horizontalExpansion = 1): TacticalProjectedPoint {
  const depth = Math.max(0, Math.min(1, y / 100));
  const horizontalScale = (1 - strength * (1 - depth)) * horizontalExpansion;
  return { x: horizontalScale ? 50 + (x - 50) / horizontalScale : x, y };
}

export function projectTacticalScale(y: number, strength: number) {
  const depth = Math.max(0, Math.min(1, y / 100));
  return 1 - strength * .7 * (1 - depth);
}

/** Profondita moderata riservata agli asset V2 rescaled: range 0.96-1.04. */
export function projectTacticalAssetDepthScale(y:number){
  const depth=Math.max(0,Math.min(1,y/100));
  return .96+depth*.08;
}

/** Il pallone conserva leggibilita anche vicino alla porta: range visuale 0.99-1.01. */
export function projectTacticalBallDepthScale(y:number){
  const depth=Math.max(0,Math.min(1,y/100));
  return .99+depth*.02;
}

export function projectedPath(points: TacticalProjectedPoint[], close = false) {
  if (!points.length) return "";
  return `${points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")}${close ? "Z" : ""}`;
}
