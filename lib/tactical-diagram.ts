import type { DiagramSource, Exercise, TacticalActionType, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType, TacticalViewType } from "./types";

const clamp = (value: number) => Math.max(2, Math.min(98, Math.round(value * 10) / 10));
const clampSafe = (value: number) => Math.max(6, Math.min(94, Math.round(value * 10) / 10));
let counter = 0;
export const diagramId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function createEmptyTacticalDiagram(viewType: TacticalViewType = "penalty_area"): TacticalDiagram {
  return { version: 1, canvas: { viewType, widthRatio: 16, heightRatio: 10 }, elements: [], actions: [] };
}

export type TacticalFieldGeometry = {
  goalLineY: number;
  goalLeft: number;
  goalRight: number;
  goalDepthY: number;
  goalAreaLeft: number;
  goalAreaRight: number;
  goalAreaTop: number;
  penaltyAreaLeft: number;
  penaltyAreaRight: number;
  penaltyAreaTop: number;
  penaltySpotY: number;
};

/** Geometria fissa del background: la linea di fondo è condivisa da porta e aree. */
export function getTacticalFieldGeometry(viewType: TacticalViewType): TacticalFieldGeometry {
  const common = { goalLineY: 94, goalLeft: 42, goalRight: 58, goalDepthY: 88 };
  if (viewType === "front_goal") return { ...common, goalAreaLeft: 30, goalAreaRight: 70, goalAreaTop: 67, penaltyAreaLeft: 8, penaltyAreaRight: 92, penaltyAreaTop: 28, penaltySpotY: 52 };
  if (viewType === "half_pitch" || viewType === "full_pitch") return { ...common, goalAreaLeft: 37, goalAreaRight: 63, goalAreaTop: 78, penaltyAreaLeft: 24, penaltyAreaRight: 76, penaltyAreaTop: 55, penaltySpotY: 68 };
  return { ...common, goalAreaLeft: 35, goalAreaRight: 65, goalAreaTop: 74, penaltyAreaLeft: 17, penaltyAreaRight: 83, penaltyAreaTop: 40, penaltySpotY: 61 };
}

export function normalizeTacticalDiagram(value: unknown): TacticalDiagram | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<TacticalDiagram>;
  if (!raw.canvas || !Array.isArray(raw.elements) || !Array.isArray(raw.actions)) return null;
  return {
    version: 1,
    canvas: {
      viewType: raw.canvas.viewType ?? "penalty_area",
      widthRatio: Number(raw.canvas.widthRatio) || 16,
      heightRatio: Number(raw.canvas.heightRatio) || 10,
    },
    elements: raw.elements.map(item => ({ ...item, x: clamp(Number(item.x)), y: clamp(Number(item.y)), rotation: Number(item.rotation) || 0, scale: Number(item.scale) || 1 })),
    actions: raw.actions.map((item, index) => ({ ...item, startX: clamp(Number(item.startX)), startY: clamp(Number(item.startY)), endX: clamp(Number(item.endX)), endY: clamp(Number(item.endY)), sequence: Number(item.sequence) || index + 1 })),
  };
}

const element = (id: string, type: TacticalElementType, x: number, y: number, label?: string, role?: string): TacticalDiagramElement => ({ id, type, x, y, rotation: 0, scale: 1, label, role });
const action = (id: string, type: TacticalActionType, startX: number, startY: number, endX: number, endY: number, sequence: number, label?: string, style?: TacticalDiagramAction["style"]): TacticalDiagramAction => ({ id, type, startX, startY, endX, endY, sequence, label, style });

function classificationText(exercise: Exercise) {
  return [exercise.nome, exercise.categoria, exercise.sottocategoria, exercise.fase, exercise.descrizione, exercise.obiettivo, exercise.schema_step_1, exercise.schema_step_2, exercise.schema_step_3, exercise.schema_step_4, exercise.schema_step_5, exercise.schema_step_6, exercise.scenario_gara].filter(Boolean).join(" ").toLowerCase();
}

function sequenceText(exercise: Exercise) {
  return [exercise.descrizione, exercise.schema_step_1, exercise.schema_step_2, exercise.schema_step_3, exercise.schema_step_4, exercise.schema_step_5, exercise.schema_step_6, exercise.scenario_gara].filter(Boolean).join(" ").toLowerCase();
}

function rotationToward(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.round((Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 90) * 10) / 10;
}

function hasSecondActiveGoalkeeper(text: string) {
  return /secondo (?:il )?portiere|altro portiere (?:interviene|para|riceve|esegue|conclude)|due portieri (?:lavorano|si alternano|partecipano|attivi)/.test(text);
}

function offsetOverlappingActions(actions: TacticalDiagramAction[]) {
  return actions.map((item, index) => {
    const overlaps = actions.slice(0, index).filter(previous => Math.abs(previous.startX - item.startX) < 2 && Math.abs(previous.startY - item.startY) < 2 && Math.abs(previous.endX - item.endX) < 2 && Math.abs(previous.endY - item.endY) < 2).length;
    if (!overlaps) return item;
    const dx = item.endX - item.startX;
    const dy = item.endY - item.startY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const offset = overlaps * 2.4;
    return { ...item, startX: clamp(item.startX + -dy / length * offset), startY: clamp(item.startY + dx / length * offset), endX: clamp(item.endX + -dy / length * offset), endY: clamp(item.endY + dx / length * offset) };
  });
}

const elementRadius: Record<TacticalElementType, number> = { goalkeeper: 6, coach: 5.5, attacker: 5.5, player: 5.5, ball: 3.8, cone: 3.2, mannequin: 4.5, hurdle: 4.5, mini_goal: 7, goal: 10, marker: 3.8 };
const elementPriority: Record<TacticalElementType, number> = { goalkeeper: 100, goal: 95, attacker: 80, player: 80, coach: 80, ball: 70, mini_goal: 55, mannequin: 45, hurdle: 40, cone: 30, marker: 25 };
const annotationExclusionRadius: Record<TacticalElementType, number> = { goalkeeper: 10, coach: 7.2, attacker: 7.2, player: 7.2, ball: 6, cone: 3.5, mannequin: 5, hurdle: 5, mini_goal: 8, goal: 10, marker: 4.5 };

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Passaggio esclusivamente grafico, applicato dopo la generazione metodologica. */
export function optimizeTacticalDiagramLayout(diagram: TacticalDiagram, source: DiagramSource | null = "automatic"): TacticalDiagram {
  if (source === "manual" || source === "automatic_edited") return diagram;
  const originalElements = diagram.elements.map(item => ({ ...item }));
  const elements = diagram.elements.map(item => ({ ...item, x: clampSafe(item.x), y: clampSafe(item.y) }));
  const dense = elements.length >= 9;
  const sparse = elements.length <= 5;

  for (const item of elements) {
    if (item.type === "goal") item.scale = diagram.canvas.viewType === "half_pitch" || diagram.canvas.viewType === "full_pitch" ? Math.max(.9, item.scale) : Math.max(1.2, item.scale);
    else if (item.type === "ball") item.scale = Math.max(1.24, item.scale);
    else if (dense) item.scale = Math.min(item.scale, item.type === "goalkeeper" ? .95 : .88);
    else if (sparse && ["goalkeeper", "coach", "attacker", "player"].includes(item.type)) item.scale = Math.max(1.06, item.scale);
  }

  for (let iteration = 0; iteration < 5; iteration += 1) {
    for (let left = 0; left < elements.length; left += 1) {
      for (let right = left + 1; right < elements.length; right += 1) {
        const first = elements[left];
        const second = elements[right];
        if (first.type === "goal" || second.type === "goal") continue;
        const minimum = Math.max(6, (elementRadius[first.type] + elementRadius[second.type]) * .78);
        const currentDistance = distance(first, second);
        if (currentDistance >= minimum) continue;
        const angle = currentDistance < .1 ? ((left + right) % 2 ? Math.PI / 4 : -Math.PI / 4) : Math.atan2(second.y - first.y, second.x - first.x);
        const shift = Math.min(3.2, (minimum - currentDistance + .6) / (elementPriority[first.type] === elementPriority[second.type] ? 2 : 1));
        const movable = elementPriority[first.type] <= elementPriority[second.type] ? first : second;
        const direction = movable === second ? 1 : -1;
        movable.x = clampSafe(movable.x + Math.cos(angle) * shift * direction);
        movable.y = clampSafe(movable.y + Math.sin(angle) * shift * direction);
      }
    }
  }

  const movement = new Map(elements.map((item, index) => [item.id, { x: item.x - originalElements[index].x, y: item.y - originalElements[index].y }]));
  const nearestMovement = (point: { x: number; y: number }, preferredId?: string) => {
    const nearest = originalElements.map(item => ({ item, distance: distance(point, item) })).sort((a, b) => a.distance - b.distance)[0];
    const anchorId = nearest && nearest.distance <= 6 ? nearest.item.id : preferredId;
    return anchorId ? movement.get(anchorId) : undefined;
  };
  let actions: TacticalDiagramAction[] = diagram.actions.map(item => {
    const startMovement = nearestMovement({ x: item.startX, y: item.startY }, item.fromElementId);
    const endMovement = nearestMovement({ x: item.endX, y: item.endY }, item.toElementId);
    return { ...item, startX: clampSafe(item.startX + (startMovement?.x ?? 0)), startY: clampSafe(item.startY + (startMovement?.y ?? 0)), endX: clampSafe(item.endX + (endMovement?.x ?? 0)), endY: clampSafe(item.endY + (endMovement?.y ?? 0)), style: item.type === "cross" ? "curved" : item.style };
  });
  actions = offsetOverlappingActions(actions);
  return { ...diagram, canvas: { ...diagram.canvas }, elements, actions };
}

export const TACTICAL_COMPOSITION_DISTANCES = Object.freeze({
  goalkeeperGoalLine: 16,
  goalkeeperBall: 10,
  goalkeeperBadge: 9,
  playerBall: 6.2,
  playerBadge: 7.5,
  players: 12,
  badges: 7,
  equipment: 6,
  safeArea: 6,
});

const humanTypes = new Set<TacticalElementType>(["goalkeeper", "attacker", "player", "coach"]);
const equipmentTypes = new Set<TacticalElementType>(["cone", "marker", "mannequin", "hurdle", "mini_goal"]);

function compositionTarget(template: TacticalTemplateKey, item: TacticalDiagramElement, ball?: TacticalDiagramElement) {
  if (item.type === "goalkeeper") {
    if (template === "uno_contro_uno") return { x: 50, y: 57 };
    if (template === "uscita_bassa") return { x: 50, y: 62 };
    if (template === "cross" || template === "uscita_alta") return { x: ball ? (ball.x < 50 ? 47 : 53) : 50, y: 70 };
    if (template === "tecnica_piede") return { x: 50, y: 79 };
    if (template === "posizionamento_porta" && ball) return { x: 50 + (ball.x - 50) * .32, y: 72 };
    if (["tuffo_laterale", "parata_ravvicinata", "presa"].includes(template) && ball) return { x: 50 + (ball.x - 50) * .18, y: 72 };
    return { x: item.x, y: Math.min(item.y, 76) };
  }
  if (item.role === "Servitore" && (template === "cross" || template === "uscita_alta")) return { x: item.x < 50 ? 9 : 91, y: 30 };
  if (item.role === "Appoggio" && template === "tecnica_piede") return { x: item.x < 50 ? 20 : 80, y: 32 };
  if (item.role === "Appoggio" && ["seconda_palla", "combinazione", "match_simulation", "sequenza_gara"].includes(template)) return { x: item.x < 50 ? 26 : 76, y: 36 };
  if (item.role === "Tiratore" && ["tuffo_laterale", "parata_ravvicinata"].includes(template)) return { x: item.x, y: Math.min(item.y, 36) };
  if (item.role === "Tiratore" && ["seconda_palla", "combinazione", "match_simulation", "sequenza_gara"].includes(template)) return { x: item.x < 50 ? 30 : 70, y: 28 };
  if (item.role === "Attaccante" && template === "uno_contro_uno") return { x: 50, y: 24 };
  if (item.type === "marker" && template === "posizionamento_porta") return { x: item.x < 50 ? 36 : 64, y: 69 };
  return { x: item.x, y: item.y };
}

/** Rifinitura semantica delle sole coordinate automatiche, prima della proiezione. */
export function refineTacticalComposition(diagram: TacticalDiagram, template: TacticalTemplateKey = "generale", source: DiagramSource | null = "automatic"): TacticalDiagram {
  if (source === "manual" || source === "automatic_edited") return diagram;
  const original = diagram.elements.map(item => ({ ...item }));
  const elements = diagram.elements.map(item => ({ ...item }));
  const ball = elements.find(item => item.type === "ball");
  const goalkeeper = elements.find(item => item.type === "goalkeeper");

  for (const item of elements) {
    const target = compositionTarget(template, item, ball);
    item.x = clampSafe(target.x);
    item.y = clampSafe(target.y);
  }

  if (goalkeeper) {
    goalkeeper.y = Math.min(goalkeeper.y, getTacticalFieldGeometry(diagram.canvas.viewType).goalLineY - TACTICAL_COMPOSITION_DISTANCES.goalkeeperGoalLine);
    if (ball && distance(goalkeeper, ball) < TACTICAL_COMPOSITION_DISTANCES.goalkeeperBall) {
      goalkeeper.y = clampSafe(goalkeeper.y + Math.max(0, TACTICAL_COMPOSITION_DISTANCES.goalkeeperBall - distance(goalkeeper, ball)));
    }
  }

  if (ball) {
    const owner = elements.filter(item => humanTypes.has(item.type)).sort((a, b) => distance(a, ball) - distance(b, ball))[0];
    if (owner && distance(owner, ball) < TACTICAL_COMPOSITION_DISTANCES.playerBall) {
      const targetAction = diagram.actions.find(item => item.fromElementId === owner.id || distance({ x: item.startX, y: item.startY }, ball) < 4);
      const target = targetAction ? { x: targetAction.endX, y: targetAction.endY } : { x: 50, y: 90 };
      const dx = target.x - owner.x; const dy = target.y - owner.y; const length = Math.max(1, Math.hypot(dx, dy));
      ball.x = clampSafe(owner.x + dx / length * TACTICAL_COMPOSITION_DISTANCES.playerBall);
      ball.y = clampSafe(owner.y + dy / length * TACTICAL_COMPOSITION_DISTANCES.playerBall);
    }
  }

  for (let iteration = 0; iteration < 4; iteration += 1) {
    for (let left = 0; left < elements.length; left += 1) for (let right = left + 1; right < elements.length; right += 1) {
      const first = elements[left]; const second = elements[right];
      const bothHuman = humanTypes.has(first.type) && humanTypes.has(second.type);
      const includesBall = first.type === "ball" || second.type === "ball";
      const minimum = bothHuman ? TACTICAL_COMPOSITION_DISTANCES.players : includesBall ? TACTICAL_COMPOSITION_DISTANCES.playerBall : TACTICAL_COMPOSITION_DISTANCES.equipment;
      const current = distance(first, second);
      if (current >= minimum || (!bothHuman && !includesBall && !equipmentTypes.has(first.type) && !equipmentTypes.has(second.type))) continue;
      const movable = first.type === "goalkeeper" ? second : second.type === "goalkeeper" ? first : includesBall ? (first.type === "ball" ? first : second) : equipmentTypes.has(second.type) ? second : first;
      const fixed = movable === first ? second : first;
      const angle = current < .1 ? (left + right) % 2 ? Math.PI / 3 : -Math.PI / 3 : Math.atan2(movable.y - fixed.y, movable.x - fixed.x);
      const shift = Math.min(2.8, minimum - current + .5);
      movable.x = clampSafe(movable.x + Math.cos(angle) * shift);
      movable.y = clampSafe(movable.y + Math.sin(angle) * shift);
    }
  }

  const movement = new Map(elements.map((item, index) => [item.id, { x: item.x - original[index].x, y: item.y - original[index].y }]));
  const movementNear = (point:{x:number;y:number}, preferredId?:string) => {
    const nearest = original.map(item => ({ item, gap: distance(point, item) })).sort((a, b) => a.gap - b.gap)[0];
    const anchor = nearest && nearest.gap <= 7 ? nearest.item.id : preferredId;
    return anchor ? movement.get(anchor) : undefined;
  };
  const actions = offsetOverlappingActions(diagram.actions.map(item => {
    const start = movementNear({ x: item.startX, y: item.startY }, item.fromElementId);
    const end = movementNear({ x: item.endX, y: item.endY }, item.toElementId);
    return { ...item, startX: clampSafe(item.startX + (start?.x ?? 0)), startY: clampSafe(item.startY + (start?.y ?? 0)), endX: clampSafe(item.endX + (end?.x ?? 0)), endY: clampSafe(item.endY + (end?.y ?? 0)) };
  }));
  return { ...diagram, canvas: { ...diagram.canvas }, elements, actions };
}

export type ActionAnnotationLayout = { badgeX: number; badgeY: number; labelX: number; labelY: number };

/** Posiziona badge e label scegliendo il lato della traiettoria più libero. */
export function getActionAnnotationLayout(actionItem: TacticalDiagramAction, elements: TacticalDiagramElement[], occupied: Array<{ x: number; y: number }> = []): ActionAnnotationLayout {
  const control = { x: (actionItem.startX + actionItem.endX) / 2, y: (actionItem.startY + actionItem.endY) / 2 - (actionItem.style === "curved" ? 12 : 0) };
  const pointAt = (t: number) => actionItem.style === "curved"
    ? { x: (1 - t) ** 2 * actionItem.startX + 2 * (1 - t) * t * control.x + t ** 2 * actionItem.endX, y: (1 - t) ** 2 * actionItem.startY + 2 * (1 - t) * t * control.y + t ** 2 * actionItem.endY }
    : { x: actionItem.startX + (actionItem.endX - actionItem.startX) * t, y: actionItem.startY + (actionItem.endY - actionItem.startY) * t };
  const tangentAt = (t: number) => actionItem.style === "curved"
    ? { x: 2 * (1 - t) * (control.x - actionItem.startX) + 2 * t * (actionItem.endX - control.x), y: 2 * (1 - t) * (control.y - actionItem.startY) + 2 * t * (actionItem.endY - control.y) }
    : { x: actionItem.endX - actionItem.startX, y: actionItem.endY - actionItem.startY };
  const candidates = (times: number[], offsets: number[]) => times.flatMap(t => offsets.flatMap(offset => {
    const point = pointAt(t); const tangent = tangentAt(t); const length = Math.max(1, Math.hypot(tangent.x, tangent.y));
    return [-1, 1].map(side => ({ x: clampSafe(point.x + -tangent.y / length * offset * side), y: clampSafe(point.y + tangent.x / length * offset * side) }));
  }));
  const clearance = (candidate: { x: number; y: number }, extra?: { x: number; y: number }) => Math.min(...elements.map(item => distance(candidate, item) - annotationExclusionRadius[item.type]), ...occupied.map(item => distance(candidate, item) - 5.5), extra ? distance(candidate, extra) - 4.5 : 100, candidate.x - 6, 94 - candidate.x, candidate.y - 6, 94 - candidate.y);
  const badge = candidates([.25, .5, .75], [4.2, 5.8]).sort((a, b) => clearance(b) - clearance(a))[0];
  const label = candidates([.32, .56, .72], [7.2, 9]).sort((a, b) => clearance(b, badge) - clearance(a, badge))[0];
  return { badgeX: badge.x, badgeY: badge.y, labelX: label.x, labelY: label.y };
}

export type TacticalTemplateKey = "tuffo_laterale" | "reattivita" | "parata_ravvicinata" | "uscita_bassa" | "uscita_alta" | "uno_contro_uno" | "cross" | "tecnica_piede" | "posizionamento_porta" | "seconda_palla" | "combinazione" | "match_simulation" | "sequenza_gara" | "presa" | "generale";

export function resolveTacticalTemplate(exercise: Exercise): TacticalTemplateKey {
  const text = classificationText(exercise);
  if (/match simulation/.test(text)) return "match_simulation";
  if (/sequenza gara|scenario aperto/.test(text)) return "sequenza_gara";
  if (/seconda palla/.test(text)) return "seconda_palla";
  if (/combinaz/.test(text)) return "combinazione";
  if (/posizionamento|copertura porta/.test(text)) return "posizionamento_porta";
  if (/1\s*(contro|vs)\s*1|uno contro uno/.test(text)) return "uno_contro_uno";
  if (/parata ravvicinata|tiro ravvicinato/.test(text)) return "parata_ravvicinata";
  if (/uscita bassa/.test(text)) return "uscita_bassa";
  if (/uscita alta/.test(text)) return "uscita_alta";
  if (/cross|palla alta/.test(text)) return "cross";
  if (/tuff|deviaz/.test(text)) return "tuffo_laterale";
  if (/pied|retropassaggio|costruzione|rinvio|rilancio|distribuz|lancio/.test(text)) return "tecnica_piede";
  if (/reatt|rapid|stimolo|colore/.test(text)) return "reattivita";
  if (/presa|rasoterra|rimbalzo/.test(text)) return "presa";
  return "generale";
}

/** Auto-zoom semantico senza aggiungere campi al JSON esistente. */
export function chooseTacticalViewType(exercise: Exercise, template = resolveTacticalTemplate(exercise)): TacticalViewType {
  if (["tecnica_piede", "match_simulation", "sequenza_gara"].includes(template)) return "half_pitch";
  if (["cross", "uscita_alta"].includes(template)) return "penalty_area";
  if (["tuffo_laterale", "parata_ravvicinata", "posizionamento_porta", "uno_contro_uno", "uscita_bassa", "presa"].includes(template)) return "front_goal";
  return "penalty_area";
}

function sameDirection(first: TacticalDiagramAction, second: TacticalDiagramAction) {
  const firstAngle = Math.atan2(first.endY - first.startY, first.endX - first.startX);
  const secondAngle = Math.atan2(second.endY - second.startY, second.endX - second.startX);
  const difference = Math.abs(Math.atan2(Math.sin(firstAngle - secondAngle), Math.cos(firstAngle - secondAngle)));
  return difference < Math.PI / 7;
}

/** Elimina solo rappresentazioni quasi coincidenti della stessa azione generata. */
export function normalizeGeneratedActions(actions: TacticalDiagramAction[]): TacticalDiagramAction[] {
  return actions.filter((candidate, index) => !actions.slice(0, index).some(previous => {
    if (candidate.type !== previous.type || Math.abs(candidate.sequence - previous.sequence) > 1 || !sameDirection(candidate, previous)) return false;
    const sameStart = candidate.fromElementId && previous.fromElementId
      ? candidate.fromElementId === previous.fromElementId
      : distance({ x: candidate.startX, y: candidate.startY }, { x: previous.startX, y: previous.startY }) <= 8;
    const sameEnd = candidate.toElementId && previous.toElementId
      ? candidate.toElementId === previous.toElementId
      : distance({ x: candidate.endX, y: candidate.endY }, { x: previous.endX, y: previous.endY }) <= 8;
    const midpointDistance = distance(
      { x: (candidate.startX + candidate.endX) / 2, y: (candidate.startY + candidate.endY) / 2 },
      { x: (previous.startX + previous.endX) / 2, y: (previous.startY + previous.endY) / 2 },
    );
    return sameStart && sameEnd && midpointDistance <= 9;
  }));
}

export function generateTacticalDiagram(exercise: Exercise, options: { refineComposition?: boolean } = {}): TacticalDiagram {
  const key = resolveTacticalTemplate(exercise);
  const sourceText = sequenceText(exercise);
  const allText = classificationText(exercise);
  const leftSide = /sinistr|lato sx|da sx/.test(allText);
  const rightSide = /destr|lato dx|da dx/.test(allText);
  const lateral = /laterale|diagonal|angolat|sinistr|destr/.test(allText);
  const base = createEmptyTacticalDiagram(chooseTacticalViewType(exercise, key));
  const goalkeeper = element("gk-1", "goalkeeper", lateral ? (leftSide ? 43 : rightSide ? 57 : 54) : 50, key === "uno_contro_uno" ? 58 : 72, "GK", "GK");
  base.elements.push(goalkeeper);

  const addBall = (x: number, y: number) => {
    const existing = base.elements.find(item => item.type === "ball");
    if (existing) { existing.x = x; existing.y = y; return existing; }
    const ball = element("ball-1", "ball", x, y, undefined, "Pallone"); base.elements.push(ball); return ball;
  };
  const addActor = (id: string, type: "coach" | "attacker" | "player", x: number, y: number, label: string, role: string) => {
    const existing = base.elements.find(item => item.role?.toLowerCase() === role.toLowerCase());
    if (existing) return existing;
    const actor = element(id, type, x, y, label, role); base.elements.push(actor); return actor;
  };

  if (key === "tuffo_laterale" || key === "parata_ravvicinata") {
    const ballX = leftSide ? 30 : rightSide ? 70 : 68;
    const shooterX = lateral ? (leftSide ? 24 : 76) : 50;
    const shooter = addActor("shooter-1", "attacker", shooterX, 38, "T", "Tiratore");
    const ball = addBall(shooterX, 42);
    goalkeeper.x = lateral ? (leftSide ? 44 : 56) : 50; goalkeeper.y = 72;
    shooter.rotation = rotationToward(shooter, goalkeeper); goalkeeper.rotation = rotationToward(goalkeeper, ball);
    base.actions.push({ ...action("a-1", "tiro", ball.x, ball.y, ballX, 69, 1, "Tiro", "solid"), fromElementId: ball.id, toElementId: goalkeeper.id }, { ...action("a-2", "tuffo", goalkeeper.x, goalkeeper.y, ballX, 69, 2, "Tuffo", "curved"), fromElementId: goalkeeper.id });
  } else if (key === "cross" || key === "uscita_alta") {
    const servantX = rightSide ? 88 : 12;
    const servant = addActor("server-1", "coach", servantX, 30, "S", "Servitore");
    const ball = addBall(rightSide ? 84 : 16, 34);
    servant.rotation = rotationToward(servant, { x: 52, y: 55 }); goalkeeper.rotation = rotationToward(goalkeeper, ball);
    if (/attaccante|giocatore centrale|colpo di testa|contrasto/.test(sourceText)) addActor("attacker-1", "attacker", 62, 53, "A", "Attaccante");
    base.actions.push({ ...action("a-1", "cross", ball.x, ball.y, 53, 55, 1, "Cross", "curved"), fromElementId: servant.id }, { ...action("a-2", "movimento", goalkeeper.x, goalkeeper.y, 53, 57, 2, "Uscita", "dashed"), fromElementId: goalkeeper.id });
  } else if (key === "uscita_bassa" || key === "uno_contro_uno") {
    const attacker = addActor("attacker-1", "attacker", 50, 27, "A", "Attaccante");
    const ball = addBall(50, 32); goalkeeper.y = key === "uno_contro_uno" ? 57 : 62;
    attacker.rotation = rotationToward(attacker, goalkeeper); goalkeeper.rotation = rotationToward(goalkeeper, ball);
    base.actions.push({ ...action("a-1", "conduzione", ball.x, ball.y, 50, 49, 1, "Attacco", "solid"), fromElementId: attacker.id }, { ...action("a-2", "movimento", goalkeeper.x, goalkeeper.y, 50, 51, 2, key === "uno_contro_uno" ? "1 contro 1" : "Uscita", "dashed"), fromElementId: goalkeeper.id, toElementId: attacker.id });
  } else if (key === "tecnica_piede") {
    goalkeeper.x = 50; goalkeeper.y = 80;
    const ball = addBall(52, 75);
    const support = addActor("support-1", "player", leftSide ? 22 : 78, 34, "A", "Appoggio");
    goalkeeper.rotation = rotationToward(goalkeeper, support); support.rotation = rotationToward(support, goalkeeper);
    base.actions.push({ ...action("a-1", "passaggio", ball.x, ball.y, support.x, support.y, 1, "Passaggio", "dashed"), fromElementId: goalkeeper.id, toElementId: support.id }, action("a-2", "recupero", support.x, support.y, 50, 72, 2, "Riposizionamento", "dashed"));
  } else if (key === "reattivita") {
    addBall(50, 36);
    base.elements.push(element("cone-1", "cone", 34, 58, "1"), element("cone-2", "cone", 66, 58, "2"));
    base.actions.push(action("a-1", "corsa", 50, 72, 34, 58, 1, "Stimolo 1", "dashed"), action("a-2", "recupero", 34, 58, 50, 72, 2, "Recupero", "dashed"), action("a-3", "corsa", 50, 72, 66, 58, 3, "Stimolo 2", "dashed"));
  } else if (["seconda_palla", "combinazione", "match_simulation", "sequenza_gara"].includes(key)) {
    const shooter = addActor("shooter-1", "attacker", 34, 30, "T", "Tiratore");
    const ball = addBall(36, 35);
    const needsSecondActor = key === "match_simulation" || /secondo giocatore|appoggio|compagno|seconda palla/.test(sourceText);
    const support = needsSecondActor ? addActor("support-1", "player", 72, 39, "A", /compagno/.test(sourceText) ? "Compagno" : "Appoggio") : null;
    shooter.rotation = rotationToward(shooter, goalkeeper); goalkeeper.rotation = rotationToward(goalkeeper, ball);
    base.actions.push({ ...action("a-1", "tiro", ball.x, ball.y, 49, 69, 1, "Conclusione", "solid"), fromElementId: ball.id, toElementId: goalkeeper.id }, action("a-2", "recupero", 49, 69, 52, 74, 2, "Recupero", "dashed"));
    if (support) base.actions.push({ ...action("a-3", "passaggio", support.x, support.y, 55, 68, 3, "Seconda palla", "dashed"), fromElementId: support.id, toElementId: goalkeeper.id });
  } else if (key === "posizionamento_porta") {
    addBall(lateral ? (leftSide ? 24 : 76) : 50, 35);
    base.elements.push(element("marker-1", "marker", 40, 70, "1"), element("marker-2", "marker", 60, 70, "2"));
    base.actions.push(action("a-1", "movimento", 50, 72, 40, 70, 1, "Allineamento", "dashed"), action("a-2", "recupero", 40, 70, 50, 72, 2, "Centro", "dashed"));
  } else {
    const actorRole = /tiratore|tiro|conclude/.test(sourceText) ? "Tiratore" : "Servitore";
    const actor = addActor(actorRole === "Tiratore" ? "shooter-1" : "server-1", actorRole === "Tiratore" ? "attacker" : "coach", lateral ? (leftSide ? 22 : 78) : 28, 32, actorRole === "Tiratore" ? "T" : "S", actorRole);
    const ball = addBall(actor.x + (actor.x < 50 ? 3 : -3), 37);
    actor.rotation = rotationToward(actor, goalkeeper); goalkeeper.rotation = rotationToward(goalkeeper, ball);
    const actionType: TacticalActionType = actorRole === "Tiratore" ? "tiro" : "passaggio";
    base.actions.push({ ...action("a-1", actionType, ball.x, ball.y, goalkeeper.x, 69, 1, key === "presa" ? "Servizio" : actionType === "tiro" ? "Tiro" : "Palla", actionType === "passaggio" ? "dashed" : "solid"), fromElementId: actionType === "tiro" ? ball.id : actor.id, toElementId: goalkeeper.id }, action("a-2", "recupero", goalkeeper.x, 69, 50, 75, 2, "Recupero", "dashed"));
  }

  if (hasSecondActiveGoalkeeper(sourceText)) {
    const secondGoalkeeper = element("gk-2", "goalkeeper", 68, 70, "GK2", "Secondo GK attivo");
    secondGoalkeeper.rotation = rotationToward(secondGoalkeeper, base.elements.find(item => item.type === "ball") ?? goalkeeper);
    base.elements.push(secondGoalkeeper);
  }
  if (/con[oi]/.test(sourceText) && !base.elements.some(item => item.type === "cone")) base.elements.push(element("cone-1", "cone", 40, 58), element("cone-2", "cone", 60, 58));
  if (/sagoma|manichino/.test(sourceText) && !base.elements.some(item => item.type === "mannequin")) base.elements.push(element("mannequin-1", "mannequin", 50, 47, undefined, "Sagoma"));
  if (/ostacolo|over|hurdle/.test(sourceText) && !base.elements.some(item => item.type === "hurdle")) base.elements.push(element("hurdle-1", "hurdle", 50, 58, undefined, "Ostacolo"));
  if (/porticina|mini[- ]?porta/.test(sourceText) && !base.elements.some(item => item.type === "mini_goal")) base.elements.push(element("mini-goal-1", "mini_goal", 78, 44, undefined, "Porticina"));
  if (/lato opposto/.test(sourceText)) base.actions.push(action("opposite", "movimento", goalkeeper.x, goalkeeper.y, goalkeeper.x < 50 ? 65 : 35, 65, base.actions.length + 1, "Lato opposto", "curved"));
  if (/recupero (al )?centro/.test(sourceText) && !base.actions.some(item => item.label?.toLowerCase().includes("centro"))) base.actions.push(action("recover-centre", "recupero", 65, 65, 50, 72, base.actions.length + 1, "Recupero centro", "dashed"));
  const optimized = optimizeTacticalDiagramLayout({ ...base, actions: normalizeGeneratedActions(base.actions) }, "automatic");
  return options.refineComposition === false ? optimized : refineTacticalComposition(optimized, key, "automatic");
}

export function moveDiagramElement(diagram: TacticalDiagram, id: string, x: number, y: number): TacticalDiagram {
  return { ...diagram, elements: diagram.elements.map(item => item.id === id ? { ...item, x: clamp(x), y: clamp(y) } : item) };
}

export function removeDiagramItem(diagram: TacticalDiagram, id: string): TacticalDiagram {
  return { ...diagram, elements: diagram.elements.filter(item => item.id !== id), actions: diagram.actions.filter(item => item.id !== id && item.fromElementId !== id && item.toElementId !== id) };
}

export function duplicateDiagramElement(diagram: TacticalDiagram, id: string): TacticalDiagram {
  const source = diagram.elements.find(item => item.id === id);
  return source ? { ...diagram, elements: [...diagram.elements, { ...source, id: diagramId(source.type), x: clamp(source.x + 5), y: clamp(source.y + 5), label: source.label ? `${source.label} copia` : undefined }] } : diagram;
}

export function addDiagramElement(diagram: TacticalDiagram, type: TacticalElementType): TacticalDiagram {
  return { ...diagram, elements: [...diagram.elements, element(diagramId(type), type, 50, 50)] };
}

export function addDiagramAction(diagram: TacticalDiagram, type: TacticalActionType, startX = 35, startY = 50, endX = 65, endY = 50): TacticalDiagram {
  return { ...diagram, actions: [...diagram.actions, action(diagramId("action"), type, startX, startY, endX, endY, diagram.actions.length + 1)] };
}
