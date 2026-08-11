"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { TacticalActionType, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement } from "../../lib/types";
import { getActionAnnotationLayout, getTacticalFieldGeometry, type ActionAnnotationLayout } from "../../lib/tactical-diagram";
import { TacticalBoardV2 } from "./tactical-board-v2";
import { TacticalBoardV2Final, TacticalBoardV2Refined } from "./tactical-board-v2-refined";

export type TacticalBoardProps = {
  diagram: TacticalDiagram;
  className?: string;
  rendererVersion?: "v1" | "v2" | "v2-refined" | "v2-final";
  selectedId?: string | null;
  interactive?: boolean;
  showActionLabels?: boolean;
  onSelect?: (id: string | null) => void;
  onMoveElement?: (id: string, x: number, y: number) => void;
  onActionPoint?: (id: string, point: "start" | "end", x: number, y: number) => void;
  onCanvasPointerDown?: (x: number, y: number) => void;
  onCanvasPointerUp?: (x: number, y: number) => void;
};

const actionAppearance: Record<TacticalActionType, { color: string; dash?: string; strokeWidth: number }> = {
  movimento: { color: "#116431", strokeWidth: 1.35 }, passaggio: { color: "#155fa0", dash: "5 4", strokeWidth: 1.15 }, tiro: { color: "#c73b32", strokeWidth: 2 },
  cross: { color: "#8b4da8", dash: "4 3", strokeWidth: 1.45 }, tuffo: { color: "#e36f20", strokeWidth: 2.15 }, recupero: { color: "#4d5960", dash: "3 4", strokeWidth: 1.2 },
  corsa: { color: "#116431", dash: "10 4", strokeWidth: 1.35 }, conduzione: { color: "#93621b", dash: "2 3", strokeWidth: 1.35 },
};

function Icon({ item }: { item: TacticalDiagramElement }) {
  const selectedScale = 4.2 * item.scale;
  const common = { stroke: "#173d2b", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" as const };
  if (item.type === "ball") return <g><circle r={2.7 * item.scale} fill="#fff" {...common} /><path d="M-1.7-1.2 0-2.4 1.7-1.2 1.1 1.4-1.1 1.4Z" fill="#173d2b" transform={`scale(${item.scale})`} /></g>;
  if (item.type === "cone") return <g transform={`scale(${item.scale})`}><path d="M0-4 3.2 3H-3.2Z" fill="#ef8c24" {...common} /><path d="M-4 3H4" {...common} /></g>;
  if (item.type === "goal" || item.type === "mini_goal") { const w = item.type === "goal" ? 18 : 10; return <g transform={`scale(${item.scale})`}><path d={`M${-w / 2} 4V-4H${w / 2}V4`} fill="none" {...common} /><path d={`M${-w / 2}-1H${w / 2}M${-w / 4}-4V4M0-4V4M${w / 4}-4V4`} stroke="#8aa394" strokeWidth=".55" /></g>; }
  if (item.type === "hurdle") return <g transform={`scale(${item.scale})`}><path d="M-5 4V-2H5V4" fill="none" stroke="#db4b3f" strokeWidth="1.6" /></g>;
  if (item.type === "mannequin") return <g transform={`scale(${item.scale})`}><circle cy="-4" r="2" fill="#e6b83f" {...common} /><path d="M0-2V5M-4 1H4M0 5-3 8M0 5 3 8" {...common} /></g>;
  if (item.type === "marker") { const markerLabel = item.label?.trim(); return <g transform={`scale(${item.scale})`}><circle r="4" fill="#fff" {...common} /><text textAnchor="middle" y="1.6" fontSize="4" fontWeight="800" fill="#116431">{markerLabel && markerLabel.length <= 3 ? markerLabel : "•"}</text></g>; }
  const color = item.type === "goalkeeper" ? "#146b38" : item.type === "coach" ? "#27323a" : item.type === "attacker" ? "#bd3f36" : "#396aa2";
  return <g transform={`scale(${item.scale})`}><circle cy="-3.2" r="2.1" fill="#f2c49b" {...common} /><path d="M0-1V4M-3 1H3M0 4-2.7 8M0 4 2.7 8" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" /><circle r={selectedScale} fill="none" stroke="transparent" /></g>;
}

function Field({ viewType }: { viewType: TacticalDiagram["canvas"]["viewType"] }) {
  const field = getTacticalFieldGeometry(viewType);
  const primaryGoal = `M${field.goalLeft} ${field.goalLineY}V${field.goalDepthY}H${field.goalRight}V${field.goalLineY}`;
  const goalArea = `M${field.goalAreaLeft} ${field.goalLineY}V${field.goalAreaTop}H${field.goalAreaRight}V${field.goalLineY}`;
  const penaltyArea = `M${field.penaltyAreaLeft} ${field.goalLineY}V${field.penaltyAreaTop}H${field.penaltyAreaRight}V${field.goalLineY}`;
  return <g className="tactical-field-lines" fill="none" stroke="#f5fff7" strokeWidth=".7" opacity=".94" vectorEffect="non-scaling-stroke">
    <rect x="1" y="1" width="98" height="93" rx="1" />
    <line className="goal-line" x1="1" y1={field.goalLineY} x2="99" y2={field.goalLineY} />
    <path className="penalty-area" d={penaltyArea} />
    <path className="goal-area" d={goalArea} />
    <circle cx="50" cy={field.penaltySpotY} r="1.15" fill="#fff" />
    <path d={`M42 ${field.penaltyAreaTop}A9 9 0 0 0 58 ${field.penaltyAreaTop}`} opacity=".72" />
    <g className="primary-goal-background" strokeWidth="1.2">
      <path className="goal-frame" d={primaryGoal} />
      <path d={`M${field.goalLeft + 4} ${field.goalLineY}V${field.goalDepthY}M50 ${field.goalLineY}V${field.goalDepthY}M${field.goalRight - 4} ${field.goalLineY}V${field.goalDepthY}`} strokeWidth=".4" opacity=".62" />
      <path d={`M${field.goalLeft} ${field.goalDepthY + 3}H${field.goalRight}M${field.goalLeft} ${field.goalDepthY + 5}H${field.goalRight}`} strokeWidth=".4" opacity=".62" />
    </g>
    {viewType === "full_pitch" && <><line x1="1" y1="50" x2="99" y2="50" /><circle cx="50" cy="50" r="10" /></>}
    {viewType === "half_pitch" && <path d="M40 1A10 10 0 0 0 60 1" />}
  </g>;
}

function ActionPath({ item, annotation, showLabel }: { item: TacticalDiagramAction; annotation: ActionAnnotationLayout; showLabel: boolean }) {
  const appearance = actionAppearance[item.type];
  const middleX = (item.startX + item.endX) / 2;
  const middleY = (item.startY + item.endY) / 2 - (item.style === "curved" ? 12 : 0);
  const d = item.style === "curved" ? `M${item.startX} ${item.startY} Q${middleX} ${middleY} ${item.endX} ${item.endY}` : `M${item.startX} ${item.startY} L${item.endX} ${item.endY}`;
  const tooltip = `${item.sequence} · ${item.label?.trim() || item.type}`;
  return <g><title>{tooltip}</title><path d={d} fill="none" stroke={appearance.color} strokeWidth={appearance.strokeWidth} strokeDasharray={item.style === "dashed" ? appearance.dash ?? "7 5" : appearance.dash} markerEnd={`url(#arrow-${item.type})`} vectorEffect="non-scaling-stroke" /><circle className="action-sequence-badge" cx={annotation.badgeX} cy={annotation.badgeY} r="2.45" fill="#fff" stroke={appearance.color} strokeWidth=".75" /><text x={annotation.badgeX} y={annotation.badgeY + 1} textAnchor="middle" fontSize="2.8" fontWeight="800" fill={appearance.color}>{item.sequence}</text>{showLabel && item.label && <text className="action-visible-label" x={annotation.labelX} y={annotation.labelY + 1} textAnchor="middle" fontSize="3" fontWeight="700" fill={appearance.color} paintOrder="stroke" stroke="#fff" strokeWidth="1.6">{item.label}</text>}</g>;
}

function ExerciseTacticalBoardV1({ diagram, className = "", selectedId, interactive, showActionLabels = false, onSelect, onMoveElement, onActionPoint, onCanvasPointerDown, onCanvasPointerUp }: TacticalBoardProps) {
  const coordinate = (event: ReactMouseEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 }; };
  const beginElementDrag = (event: ReactPointerEvent<SVGGElement>, id: string) => { if (!interactive) return; event.stopPropagation(); onSelect?.(id); event.currentTarget.setPointerCapture(event.pointerId); };
  const moveElement = (event: ReactPointerEvent<SVGGElement>, id: string) => { if (!interactive || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const svg = event.currentTarget.ownerSVGElement; if (!svg) return; const rect = svg.getBoundingClientRect(); onMoveElement?.(id, (event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); };
  const movePoint = (event: ReactPointerEvent<SVGCircleElement>, id: string, point: "start" | "end") => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const svg = event.currentTarget.ownerSVGElement; if (!svg) return; const rect = svg.getBoundingClientRect(); onActionPoint?.(id, point, (event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); };
  const sortedActions = [...diagram.actions].sort((a, b) => a.sequence - b.sequence);
  const dynamicElements = diagram.elements.filter(item => !(item.type === "goal" && item.role === "Porta"));
  const occupiedAnnotations: Array<{ x: number; y: number }> = [];
  const annotationLayouts = new Map(sortedActions.map(item => {
    const layout = getActionAnnotationLayout(item, dynamicElements, occupiedAnnotations);
    occupiedAnnotations.push({ x: layout.badgeX, y: layout.badgeY });
    return [item.id, layout] as const;
  }));
  return <div className={`tactical-board ${interactive ? "is-editor" : ""} ${className}`} style={{ aspectRatio: `${diagram.canvas.widthRatio}/${diagram.canvas.heightRatio}` }}>
    <svg viewBox="0 0 100 100" role="img" aria-label="Schema tattico dinamico" onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget || (event.target as SVGElement).closest(".tactical-field-lines")) onSelect?.(null); onCanvasPointerDown?.((event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); }} onPointerUp={event => { const rect = event.currentTarget.getBoundingClientRect(); onCanvasPointerUp?.((event.clientX - rect.left) / rect.width * 100, (event.clientY - rect.top) / rect.height * 100); }} onDoubleClick={event => { if (interactive) { const point = coordinate(event); onActionPoint?.("new", "end", point.x, point.y); } }}>
      <defs>{(Object.keys(actionAppearance) as TacticalActionType[]).map(type => <marker key={type} id={`arrow-${type}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill={actionAppearance[type].color} /></marker>)}</defs>
      <rect width="100" height="100" rx="2" fill="#6fa55f" /><Field viewType={diagram.canvas.viewType} />
      {sortedActions.map(item => <g key={item.id} className={selectedId === item.id ? "selected" : ""} onPointerDown={event => { if (interactive) { event.stopPropagation(); onSelect?.(item.id); } }}><ActionPath item={item} annotation={annotationLayouts.get(item.id) ?? getActionAnnotationLayout(item, dynamicElements)} showLabel={showActionLabels} />{interactive && selectedId === item.id && <><circle className="action-handle" cx={item.startX} cy={item.startY} r="2.2" onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => movePoint(event, item.id, "start")} /><circle className="action-handle" cx={item.endX} cy={item.endY} r="2.2" onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => movePoint(event, item.id, "end")} /></>}</g>)}
      {dynamicElements.map(item => { const shortLabel = item.label?.trim(); const showElementLabel = item.type !== "marker" && Boolean(shortLabel && shortLabel.length <= 3); return <g key={item.id} className={`tactical-element ${selectedId === item.id ? "selected" : ""}`} transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} onPointerDown={event => beginElementDrag(event, item.id)} onPointerMove={event => moveElement(event, item.id)}><Icon item={item} />{showElementLabel && <text y={12} textAnchor="middle" fontSize="3.4" fontWeight="800" fill="#173d2b" paintOrder="stroke" stroke="#fff" strokeWidth="1.5">{shortLabel}</text>}</g>; })}
    </svg>
  </div>;
}

export function ExerciseTacticalBoard(props: TacticalBoardProps) {
  if (props.rendererVersion === "v1") return <ExerciseTacticalBoardV1 {...props} />;
  if (props.rendererVersion === "v2") return <TacticalBoardV2 {...props} />;
  if (props.rendererVersion === "v2-refined") return <TacticalBoardV2Refined {...props} />;
  return <TacticalBoardV2Final {...props} />;
}
