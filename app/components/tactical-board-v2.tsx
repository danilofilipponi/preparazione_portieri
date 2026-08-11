"use client";

import { useId } from "react";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { TacticalActionType, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType, TacticalViewType } from "../../lib/types";
import { getActionAnnotationLayout, type ActionAnnotationLayout } from "../../lib/tactical-diagram";
import type { TacticalBoardProps } from "./exercise-tactical-board";

const renderY = (value: number) => 100 - value;
const dataY = (value: number) => 100 - value;

type FieldGeometry = { goalLineY: number; goalDepthY: number; goalLeft: number; goalRight: number; goalAreaLeft: number; goalAreaRight: number; goalAreaBottom: number; penaltyLeft: number; penaltyRight: number; penaltyBottom: number; penaltySpotY: number };

export function getV2FieldGeometry(viewType: TacticalViewType): FieldGeometry {
  const common = { goalLineY: 12, goalDepthY: 5, goalLeft: 42, goalRight: 58 };
  if (viewType === "front_goal") return { ...common, goalAreaLeft: 30, goalAreaRight: 70, goalAreaBottom: 39, penaltyLeft: 8, penaltyRight: 92, penaltyBottom: 73, penaltySpotY: 54 };
  if (viewType === "half_pitch" || viewType === "full_pitch") return { ...common, goalAreaLeft: 37, goalAreaRight: 63, goalAreaBottom: 28, penaltyLeft: 24, penaltyRight: 76, penaltyBottom: 47, penaltySpotY: 37 };
  return { ...common, goalAreaLeft: 35, goalAreaRight: 65, goalAreaBottom: 33, penaltyLeft: 17, penaltyRight: 83, penaltyBottom: 63, penaltySpotY: 46 };
}

function TacticalGoal({ geometry, compact }: { geometry: FieldGeometry; compact: boolean }) {
  const { goalLeft: left, goalRight: right, goalLineY: line, goalDepthY: depth } = geometry;
  return <g className="v2-primary-goal" fill="none" stroke="#f7faf8" strokeLinecap="round" strokeLinejoin="round">
    <path d={`M${left} ${line}V${depth}H${right}V${line}`} strokeWidth="1.45" />
    {!compact && <g stroke="#d9e2dd" strokeWidth=".28" opacity=".72">
      {[left + 3, left + 6, left + 9, left + 12].map(x => <line key={x} x1={x} y1={depth} x2={x} y2={line} />)}
      {[depth + 2, depth + 4, depth + 6].filter(y => y < line).map(y => <line key={y} x1={left} y1={y} x2={right} y2={y} />)}
    </g>}
  </g>;
}

function TacticalField({ viewType, compact, stripeId }: { viewType: TacticalViewType; compact: boolean; stripeId: string }) {
  const geometry = getV2FieldGeometry(viewType);
  const goalArea = `M${geometry.goalAreaLeft} ${geometry.goalLineY}V${geometry.goalAreaBottom}H${geometry.goalAreaRight}V${geometry.goalLineY}`;
  const penaltyArea = `M${geometry.penaltyLeft} ${geometry.goalLineY}V${geometry.penaltyBottom}H${geometry.penaltyRight}V${geometry.goalLineY}`;
  return <g className="tactical-field-v2" aria-hidden="true">
    <rect x="1" y="1" width="98" height="98" rx="3" fill="#438b2d" />
    <rect x="1" y="1" width="98" height="98" rx="3" fill={`url(#${stripeId})`} opacity=".18" />
    <g fill="none" stroke="#f5f8f1" strokeWidth={compact ? .8 : .68} opacity=".9" vectorEffect="non-scaling-stroke">
      <rect x="1.5" y={geometry.goalLineY} width="97" height={98 - geometry.goalLineY} rx="1.5" />
      <line x1="1.5" y1={geometry.goalLineY} x2="98.5" y2={geometry.goalLineY} />
      <path className="v2-penalty-area" d={penaltyArea} />
      <path className="v2-goal-area" d={goalArea} />
      <circle cx="50" cy={geometry.penaltySpotY} r="1.05" fill="#f5f8f1" />
      <path d={`M42 ${geometry.penaltyBottom}A9 9 0 0 1 58 ${geometry.penaltyBottom}`} opacity=".72" />
      {viewType === "full_pitch" && <><line x1="1.5" y1="55" x2="98.5" y2="55" /><circle cx="50" cy="55" r="10" /></>}
      {viewType === "half_pitch" && <path d="M40 98A10 10 0 0 1 60 98" />}
      <TacticalGoal geometry={geometry} compact={compact} />
    </g>
  </g>;
}

const halo = { stroke: "#f7fff9", strokeWidth: 1.05, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const };

function TacticalGoalkeeper({ ghost = false }: { ghost?: boolean }) {
  return <g className="v2-goalkeeper" opacity={ghost ? .28 : 1}>
    {!ghost && <ellipse cy="7.8" rx="5.4" ry="1.25" fill="#17361f" opacity=".2" />}
    <circle cy="-5.5" r="2.25" fill="#e5b68c" {...halo} />
    <path d="M-3.8-1.8Q0-4 3.8-1.8L3 4.8Q0 6-3 4.8Z" fill="#126b39" {...halo} />
    <path d="M-3-1.2-6.2 1.5M3-1.2 6.2 1.5M-1.7 4.4-3.5 8M1.7 4.4 3.5 8" fill="none" {...halo} stroke="#126b39" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="-6.5" cy="1.7" r="1" fill="#f3f5ef" stroke="#173d2b" strokeWidth=".5" /><circle cx="6.5" cy="1.7" r="1" fill="#f3f5ef" stroke="#173d2b" strokeWidth=".5" />
  </g>;
}

function TacticalPerson({ color, className }: { color: string; className: string }) {
  return <g className={className}>
    <ellipse cy="8" rx="4.8" ry="1.15" fill="#17361f" opacity=".18" />
    <circle cy="-5.2" r="2.15" fill="#e5b68c" {...halo} />
    <path d="M-3.4-1.8Q0-3.6 3.4-1.8L2.7 4.5Q0 5.6-2.7 4.5Z" fill={color} {...halo} />
    <path d="M-2.8-1-5.2 1.5M2.8-1 5.2 1.5M-1.5 4.2-3.2 8M1.5 4.2 3.2 8" fill="none" {...halo} stroke={color} strokeWidth="2" strokeLinecap="round" />
  </g>;
}

function TacticalAttacker() { return <TacticalPerson color="#f07a19" className="v2-attacker" />; }
function TacticalPlayer() { return <TacticalPerson color="#ecefea" className="v2-player" />; }
function TacticalCoach() { return <TacticalPerson color="#1769aa" className="v2-coach" />; }

function TacticalBall() {
  return <g className="v2-ball"><ellipse cy="3.2" rx="3.5" ry=".8" fill="#17361f" opacity=".2" /><circle r="3.2" fill="#fff" stroke="#17211c" strokeWidth=".75" /><path d="M0-1.35 1.35-.4.85 1.25H-.85L-1.35-.4Z" fill="#17211c" /><path d="M0-1.35 0-2.85M1.35-.4 2.7-1.1M.85 1.25 1.7 2.55M-.85 1.25-1.7 2.55M-1.35-.4-2.7-1.1" stroke="#17211c" strokeWidth=".55" /></g>;
}

function TacticalCone() {
  return <g className="v2-cone"><ellipse cy="4" rx="4.2" ry="1" fill="#17361f" opacity=".2" /><path d="M0-5 3.2 2.6H-3.2Z" fill="#ff8a16" stroke="#8f3b08" strokeWidth=".7" /><path d="M-4 2.4H4L3.4 4H-3.4Z" fill="#f56c0b" stroke="#8f3b08" strokeWidth=".7" /><path d="M-1.4-1.6H1.4" stroke="#ffd4a2" strokeWidth=".65" /></g>;
}

function TacticalMannequin() {
  return <g className="v2-mannequin" fill="#efbf18" stroke="#6d5805" strokeWidth=".7"><circle cy="-5.2" r="2" /><path d="M-2.7-2.7H2.7L2 4H-2Z" /><path d="M-3.6 4H3.6M-2.6 4-3.5 8M2.6 4 3.5 8" fill="none" strokeWidth="1.2" /></g>;
}

function TacticalHurdle() {
  return <g className="v2-hurdle" fill="none" stroke="#f2f4ef" strokeLinecap="round"><path d="M-5 4V-2H5V4" strokeWidth="1.5" /><path d="M-6 4H-3M3 4H6" stroke="#e06c27" strokeWidth="1.4" /></g>;
}

function TacticalMiniGoal({ large = false, compact = false }: { large?: boolean; compact?: boolean }) {
  const width = large ? 15 : 11; const height = large ? 7 : 5.5;
  return <g className="v2-mini-goal" fill="none" stroke="#f5f7f4" strokeLinejoin="round"><path d={`M${-width / 2} ${height / 2}V${-height / 2}H${width / 2}V${height / 2}`} strokeWidth="1.2" />{!compact && <path d={`M${-width / 4} ${-height / 2}V${height / 2}M0 ${-height / 2}V${height / 2}M${width / 4} ${-height / 2}V${height / 2}M${-width / 2} 0H${width / 2}`} stroke="#b8c5bd" strokeWidth=".35" />}</g>;
}

function TacticalMarker({ label }: { label?: string }) {
  const value = label?.trim(); return <g className="v2-marker"><circle r="3.3" fill="#17221d" stroke="#f5f7f4" strokeWidth=".7" /><circle r="1.2" fill="#8bc53f" />{value && value.length <= 3 && <text y="1.05" textAnchor="middle" fontSize="2.6" fontWeight="800" fill="#fff">{value}</text>}</g>;
}

function TacticalSymbol({ item, compact = false, ghost = false }: { item: TacticalDiagramElement; compact?: boolean; ghost?: boolean }) {
  if (item.type === "goalkeeper") return <TacticalGoalkeeper ghost={ghost} />;
  if (item.type === "attacker") return <TacticalAttacker />;
  if (item.type === "coach") return <TacticalCoach />;
  if (item.type === "player") return <TacticalPlayer />;
  if (item.type === "ball") return <TacticalBall />;
  if (item.type === "cone") return <TacticalCone />;
  if (item.type === "mannequin") return <TacticalMannequin />;
  if (item.type === "hurdle") return <TacticalHurdle />;
  if (item.type === "mini_goal") return <TacticalMiniGoal compact={compact} />;
  if (item.type === "goal") return <TacticalMiniGoal large compact={compact} />;
  return <TacticalMarker label={item.label} />;
}

function shortElementLabel(item: TacticalDiagramElement) {
  const explicit = item.label?.trim();
  if (explicit && explicit.length <= 3) return explicit;
  const defaults: Partial<Record<TacticalElementType, string>> = { goalkeeper: "GK", attacker: "A", coach: "C", player: "P" };
  return defaults[item.type] ?? null;
}

function symbolScale(item: TacticalDiagramElement) {
  if (["goalkeeper", "attacker", "coach", "player"].includes(item.type)) return .8;
  if (item.type === "ball") return .86;
  if (["mannequin", "hurdle", "mini_goal", "goal"].includes(item.type)) return .9;
  return 1;
}

function ElementLabel({ value }: { value: string }) {
  const width = Math.max(6, value.length * 2.4 + 3.4);
  return <g className="v2-element-label" transform="translate(0 9.8)"><rect x={-width / 2} y="-2.5" width={width} height="5" rx="1.6" fill="#101a15" stroke="#f5fff7" strokeWidth=".45" opacity=".94" /><text y="1.2" textAnchor="middle" fontSize="3.2" fontWeight="900" fill="#fff">{value}</text></g>;
}

type ActionAppearance = { color: string; dash?: string; width: number };
function actionAppearance(action: TacticalDiagramAction, elements: TacticalDiagramElement[]): ActionAppearance {
  const source = elements.find(item => item.id === action.fromElementId);
  const goalkeeperAction = source?.type === "goalkeeper";
  if (action.type === "tiro") return { color: "#e63c24", width: 2.25 };
  if (action.type === "tuffo") return { color: "#74c72e", width: 2.3 };
  if (action.type === "passaggio" || action.type === "cross") return { color: "#f7faf6", dash: "4.8 3.6", width: 1.45 };
  if (action.type === "conduzione") return { color: "#1675bd", dash: "7 3", width: 1.65 };
  if (action.type === "movimento") return { color: goalkeeperAction ? "#74c72e" : "#d6ddd8", width: 1.6 };
  if (action.type === "recupero") return { color: "#c9cfcb", dash: "3 3.5", width: 1.35 };
  return { color: "#e5e9e6", dash: "7 3.5", width: 1.5 };
}

function TacticalSequenceBadge({ x, y, sequence, color }: { x: number; y: number; sequence: number; color: string }) {
  return <g className="v2-sequence-badge"><circle cx={x} cy={y} r="2.7" fill="#111a16" stroke="#fff" strokeWidth=".7" /><circle cx={x} cy={y} r="2.25" fill={color} opacity=".95" /><text x={x} y={y + 1.05} textAnchor="middle" fontSize="3" fontWeight="900" fill={color === "#f7faf6" ? "#111a16" : "#fff"}>{sequence}</text></g>;
}

function TacticalAction({ item, elements, annotation, markerId, showLabel }: { item: TacticalDiagramAction; elements: TacticalDiagramElement[]; annotation: ActionAnnotationLayout; markerId: string; showLabel: boolean }) {
  const appearance = actionAppearance(item, elements);
  const startY = renderY(item.startY); const endY = renderY(item.endY);
  const middleX = (item.startX + item.endX) / 2; const middleY = (startY + endY) / 2 + (item.style === "curved" ? 12 : 0);
  const path = item.style === "curved" ? `M${item.startX} ${startY} Q${middleX} ${middleY} ${item.endX} ${endY}` : `M${item.startX} ${startY}L${item.endX} ${endY}`;
  const label = `${item.sequence} · ${item.label?.trim() || item.type}`;
  return <g className={`v2-action v2-action-${item.type}`}><title>{label}</title><path d={path} fill="none" stroke="#142018" strokeWidth={appearance.width + 1.15} opacity=".38" vectorEffect="non-scaling-stroke" /><path d={path} fill="none" stroke={appearance.color} strokeWidth={appearance.width} strokeDasharray={appearance.dash} strokeLinecap="round" markerEnd={`url(#${markerId}-${item.type})`} vectorEffect="non-scaling-stroke" /><TacticalSequenceBadge x={annotation.badgeX} y={renderY(annotation.badgeY)} sequence={item.sequence} color={appearance.color} />{showLabel && item.label && <text className="v2-action-label" x={annotation.labelX} y={renderY(annotation.labelY)} textAnchor="middle" fontSize="3" fontWeight="800" fill="#fff" paintOrder="stroke" stroke="#142018" strokeWidth="1.5">{item.label}</text>}</g>;
}

function TacticalGhosts({ diagram, compact }: { diagram: TacticalDiagram; compact: boolean }) {
  if (compact || diagram.elements.length > 7) return null;
  const goalkeepers = diagram.elements.filter(item => item.type === "goalkeeper");
  const destinations: Array<{ id: string; x: number; y: number; rotation: number; scale: number }> = [];
  for (const goalkeeper of goalkeepers) {
    for (const item of diagram.actions) {
      if (!["tuffo", "movimento", "recupero"].includes(item.type)) continue;
      const startsAtGoalkeeper = item.fromElementId === goalkeeper.id || Math.hypot(item.startX - goalkeeper.x, item.startY - goalkeeper.y) < 7;
      if (!startsAtGoalkeeper || destinations.some(point => Math.hypot(point.x - item.endX, point.y - item.endY) < 5)) continue;
      destinations.push({ id: `${goalkeeper.id}-${item.id}`, x: item.endX, y: item.endY, rotation: goalkeeper.rotation, scale: goalkeeper.scale });
    }
  }
  return <g className="v2-ghost-positions" aria-hidden="true">{destinations.slice(0, 2).map(item => <g key={item.id} transform={`translate(${item.x} ${renderY(item.y)}) rotate(${-item.rotation}) scale(${item.scale * .8})`}><TacticalGoalkeeper ghost /></g>)}</g>;
}

function markerDefinitions(markerId: string, actions: TacticalDiagramAction[], elements: TacticalDiagramElement[]) {
  const types = Array.from(new Set(actions.map(item => item.type)));
  return types.map(type => { const representative = actions.find(item => item.type === type)!; const color = actionAppearance(representative, elements).color; return <marker key={type} id={`${markerId}-${type}`} viewBox="0 0 10 10" refX="8.2" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M1 1 9 5 1 9 3.2 5Z" fill={color} /></marker>; });
}

export function TacticalBoardV2({ diagram, className = "", selectedId, interactive, showActionLabels = false, onSelect, onMoveElement, onActionPoint, onCanvasPointerDown, onCanvasPointerUp }: TacticalBoardProps) {
  const uniqueId = useId().replace(/:/g, ""); const markerId = `v2-arrow-${uniqueId}`; const stripeId = `v2-grass-${uniqueId}`;
  const compact = /compact-board|session-board/.test(className);
  const dynamicElements = diagram.elements.filter(item => !(item.type === "goal" && item.role === "Porta"));
  const elementLayer: Record<TacticalElementType, number> = { goal: 10, mini_goal: 10, hurdle: 15, mannequin: 16, cone: 17, marker: 18, ball: 30, coach: 40, player: 40, attacker: 42, goalkeeper: 50 };
  const renderedElements = [...dynamicElements].sort((left, right) => elementLayer[left.type] - elementLayer[right.type]);
  const actions = [...diagram.actions].sort((a, b) => a.sequence - b.sequence);
  const occupied: Array<{ x: number; y: number }> = [];
  const annotations = new Map(actions.map(item => { const layout = getActionAnnotationLayout(item, dynamicElements, occupied); occupied.push({ x: layout.badgeX, y: layout.badgeY }); return [item.id, layout] as const; }));
  const pointFromEvent = (event: ReactPointerEvent<SVGElement> | ReactMouseEvent<SVGElement>) => { const svg = event.currentTarget instanceof SVGSVGElement ? event.currentTarget : event.currentTarget.ownerSVGElement; if (!svg) return { x: 50, y: 50 }; const rect = svg.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * 100, y: dataY((event.clientY - rect.top) / rect.height * 100) }; };
  const beginElementDrag = (event: ReactPointerEvent<SVGGElement>, id: string) => { if (!interactive) return; event.stopPropagation(); onSelect?.(id); event.currentTarget.setPointerCapture(event.pointerId); };
  const moveElement = (event: ReactPointerEvent<SVGGElement>, id: string) => { if (!interactive || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointFromEvent(event); onMoveElement?.(id, point.x, point.y); };
  const moveActionPoint = (event: ReactPointerEvent<SVGCircleElement>, id: string, pointName: "start" | "end") => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const point = pointFromEvent(event); onActionPoint?.(id, pointName, point.x, point.y); };
  return <div className={`tactical-board tactical-board-v2 ${interactive ? "is-editor" : ""} ${compact ? "is-compact" : ""} ${className}`} style={{ aspectRatio: `${diagram.canvas.widthRatio}/${diagram.canvas.heightRatio}` }}>
    <svg viewBox="0 0 100 100" role="img" aria-label="Schema tattico professionale, porta in alto">
      <defs><pattern id={stripeId} width="16" height="100" patternUnits="userSpaceOnUse"><rect width="8" height="100" fill="#73a94d" /><rect x="8" width="8" height="100" fill="#428331" /></pattern>{markerDefinitions(markerId, actions, dynamicElements)}</defs>
      <TacticalField viewType={diagram.canvas.viewType} compact={compact} stripeId={stripeId} />
      <rect className="v2-interaction-surface" width="100" height="100" rx="3" fill="transparent" onPointerDown={event => { onSelect?.(null); const point = pointFromEvent(event); onCanvasPointerDown?.(point.x, point.y); }} onPointerUp={event => { const point = pointFromEvent(event); onCanvasPointerUp?.(point.x, point.y); }} onDoubleClick={event => { if (interactive) { const point = pointFromEvent(event); onActionPoint?.("new", "end", point.x, point.y); } }} />
      <TacticalGhosts diagram={diagram} compact={compact} />
      {actions.map(item => { const annotation = annotations.get(item.id) ?? getActionAnnotationLayout(item, dynamicElements); return <g key={item.id} className={selectedId === item.id ? "selected" : ""} onPointerDown={event => { if (interactive) { event.stopPropagation(); onSelect?.(item.id); } }}><TacticalAction item={item} elements={dynamicElements} annotation={annotation} markerId={markerId} showLabel={showActionLabels} />{interactive && selectedId === item.id && <><circle className="action-handle" cx={item.startX} cy={renderY(item.startY)} r="2.5" onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => moveActionPoint(event, item.id, "start")} /><circle className="action-handle" cx={item.endX} cy={renderY(item.endY)} r="2.5" onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={event => moveActionPoint(event, item.id, "end")} /></>}</g>; })}
      {renderedElements.map(item => { const label = shortElementLabel(item); return <g key={item.id} className={`tactical-element v2-element ${selectedId === item.id ? "selected" : ""}`} transform={`translate(${item.x} ${renderY(item.y)})`} onPointerDown={event => beginElementDrag(event, item.id)} onPointerMove={event => moveElement(event, item.id)}><g transform={`rotate(${-item.rotation}) scale(${item.scale * symbolScale(item)})`}><TacticalSymbol item={item} compact={compact} /></g>{label && !["ball", "cone", "mannequin", "hurdle", "mini_goal", "goal", "marker"].includes(item.type) && <ElementLabel value={label} />}<circle r="7" fill="transparent" aria-hidden="true" /></g>; })}
    </svg>
  </div>;
}
