import type { TacticalDiagram, TacticalDiagramElement, TacticalViewType } from "./types";

export type TacticalRenderContext = "compact" | "detail" | "field" | "editor";
export type TacticalViewBox = { x: number; y: number; width: number; height: number };

const visualY = (value: number) => 100 - value;

const elementRadius: Record<TacticalDiagramElement["type"], { x: number; y: number }> = {
  goalkeeper: { x: 8, y: 11 }, coach: { x: 7, y: 10 }, attacker: { x: 7, y: 10 }, player: { x: 7, y: 10 },
  ball: { x: 4, y: 4 }, cone: { x: 5, y: 7 }, mannequin: { x: 5, y: 10 }, hurdle: { x: 7, y: 6 },
  mini_goal: { x: 8, y: 6 }, goal: { x: 10, y: 7 }, marker: { x: 4, y: 4 },
};

function minimumFrame(viewType: TacticalViewType, context: TacticalRenderContext) {
  if (context === "editor") return { width: 100, height: 100 };
  if (context === "field") return { width: 88, height: 82 };
  if (viewType === "full_pitch" || viewType === "half_pitch") return context === "compact" ? { width: 80, height: 72 } : { width: 88, height: 82 };
  if (viewType === "penalty_area") return context === "compact" ? { width: 72, height: 62 } : { width: 82, height: 72 };
  return context === "compact" ? { width: 58, height: 54 } : { width: 72, height: 66 };
}

function fitAspectRatio(width: number, height: number, ratio: number) {
  if (width / height < ratio) width = height * ratio;
  else height = width / ratio;
  return { width, height };
}

function clampFrame(center: number, size: number) {
  const boundedSize = Math.min(100, size);
  return Math.max(0, Math.min(100 - boundedSize, center - boundedSize / 2));
}

/** Renderer-only framing: reads coordinates without changing the tactical JSON. */
export function computeTacticalViewBox(diagram: TacticalDiagram, context: TacticalRenderContext, options: { limitZoom?: boolean } = {}): TacticalViewBox {
  if (context === "editor") return { x: 0, y: 0, width: 100, height: 100 };
  const points: Array<{ x: number; y: number }> = [];
  for (const item of diagram.elements) {
    if (item.type === "goal" && item.role === "Porta") continue;
    const radius = elementRadius[item.type];
    const scale = Math.max(.65, item.scale);
    points.push({ x: item.x - radius.x * scale, y: visualY(item.y) - radius.y * scale }, { x: item.x + radius.x * scale, y: visualY(item.y) + radius.y * scale });
  }
  for (const action of diagram.actions) {
    points.push({ x: action.startX, y: visualY(action.startY) }, { x: action.endX, y: visualY(action.endY) });
    if (action.style === "curved") points.push({ x: (action.startX + action.endX) / 2, y: (visualY(action.startY) + visualY(action.endY)) / 2 + 12 });
  }

  // La porta e i riferimenti essenziali restano sempre leggibili negli esercizi del portiere.
  const goalWidth = diagram.canvas.viewType === "front_goal" ? 24 : 20;
  points.push({ x: 50 - goalWidth, y: 3 }, { x: 50 + goalWidth, y: 17 });
  if (diagram.canvas.viewType !== "front_goal") points.push({ x: 28, y: 32 }, { x: 72, y: 48 });
  if (!points.length) return { x: 0, y: 0, width: 100, height: 100 };

  const minX = Math.min(...points.map(point => point.x)); const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y)); const maxY = Math.max(...points.map(point => point.y));
  const margin = context === "compact" ? .11 : .14;
  const minimum = minimumFrame(diagram.canvas.viewType, context);
  if (options.limitZoom) {
    const conservative = context === "compact" ? { width: 68, height: 60 } : context === "detail" ? { width: 82, height: 74 } : { width: 90, height: 84 };
    minimum.width = Math.max(minimum.width, conservative.width);
    minimum.height = Math.max(minimum.height, conservative.height);
  }
  let width = Math.max(minimum.width, (maxX - minX) * (1 + margin * 2));
  let height = Math.max(minimum.height, (maxY - minY) * (1 + margin * 2));
  ({ width, height } = fitAspectRatio(width, height, diagram.canvas.widthRatio / diagram.canvas.heightRatio));
  width = Math.min(100, width); height = Math.min(100, height);
  const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
  return { x: clampFrame(centerX, width), y: clampFrame(centerY, height), width, height };
}

export function tacticalViewBoxValue(viewBox: TacticalViewBox) {
  return `${viewBox.x.toFixed(2)} ${viewBox.y.toFixed(2)} ${viewBox.width.toFixed(2)} ${viewBox.height.toFixed(2)}`;
}

export function widenTacticalViewBox(viewBox: TacticalViewBox, ratio: number): TacticalViewBox {
  const width = Math.max(viewBox.width, viewBox.height * ratio);
  const centerX = viewBox.x + viewBox.width / 2;
  return { x: centerX - width / 2, y: viewBox.y, width, height: viewBox.height };
}
