import type { DiagramSource, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "./types.ts";
import type { TacticalSetupRequirement } from "./tactical-setup-validation.ts";
import { TACTICAL_MINIMUM_DISPLAY_SCALE, TACTICAL_VISUAL_SCALE } from "./tactical-visual-scale.ts";

type Point={x:number;y:number};
export type TacticalLayoutDensity="LOW"|"MEDIUM"|"HIGH";
export type TacticalLayoutZoneName="START"|"PATH"|"ACTION"|"TARGET";
export type TacticalLayoutZone={name:TacticalLayoutZoneName;x:number;y:number;width:number;height:number};
export type TacticalLayoutValidation={valid:boolean;warnings:string[];metrics:{excessiveOverlap:number;excessiveDensity:boolean;pathTooCompressed:boolean;actionCollision:number;unreadableBall:boolean}};
export type TacticalEquipmentLayoutResult={diagram:TacticalDiagram;density:TacticalLayoutDensity;zones:TacticalLayoutZone[];validation:TacticalLayoutValidation;adjustments:string[]};

export const EQUIPMENT_MIN_DISTANCE=Object.freeze({
  "cone-cone":6,
  "marker-marker":5.5,
  "hurdle-hurdle":8,
  "mannequin-mannequin":10,
  "ball-ball":7,
  "equipment-player":6,
  "equipment-goalkeeper":7,
  "equipment-badge":5,
});

export const EQUIPMENT_LAYOUT_ZONES:ReadonlyArray<TacticalLayoutZone>=Object.freeze([
  {name:"START",x:8,y:68,width:84,height:22},
  {name:"PATH",x:10,y:43,width:80,height:27},
  {name:"ACTION",x:10,y:28,width:80,height:19},
  {name:"TARGET",x:8,y:16,width:84,height:20},
]);

const equipmentTypes=new Set<TacticalElementType>(["cone","marker","hurdle","mannequin","mini_goal"]);
const humanTypes=new Set<TacticalElementType>(["goalkeeper","attacker","player","coach"]);
const clamp=(value:number,min=7,max=93)=>Math.max(min,Math.min(max,value));
const clone=(diagram:TacticalDiagram):TacticalDiagram=>({...diagram,canvas:{...diagram.canvas},elements:diagram.elements.map(item=>({...item})),actions:diagram.actions.map(item=>({...item}))});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointSegmentDistance=(point:Point,action:TacticalDiagramAction)=>{const dx=action.endX-action.startX,dy=action.endY-action.startY,length=dx*dx+dy*dy;if(!length)return distance(point,{x:action.startX,y:action.startY});const t=Math.max(0,Math.min(1,((point.x-action.startX)*dx+(point.y-action.startY)*dy)/length));return distance(point,{x:action.startX+t*dx,y:action.startY+t*dy});};

export function calculateTacticalLayoutDensity(diagram:TacticalDiagram):TacticalLayoutDensity{
  const equipment=diagram.elements.filter(item=>equipmentTypes.has(item.type)).length;
  const score=diagram.elements.length+equipment*.65+diagram.actions.length*.4;
  return score>=13?"HIGH":score>=8?"MEDIUM":"LOW";
}

function minimumDistance(first:TacticalDiagramElement,second:TacticalDiagramElement){
  const key=[first.type,second.type].sort().join("-");
  if(key==="cone-cone")return EQUIPMENT_MIN_DISTANCE["cone-cone"];
  if(key==="marker-marker")return EQUIPMENT_MIN_DISTANCE["marker-marker"];
  if(key==="hurdle-hurdle")return EQUIPMENT_MIN_DISTANCE["hurdle-hurdle"];
  if(key==="mannequin-mannequin")return EQUIPMENT_MIN_DISTANCE["mannequin-mannequin"];
  if(key==="ball-ball")return EQUIPMENT_MIN_DISTANCE["ball-ball"];
  if(equipmentTypes.has(first.type)||equipmentTypes.has(second.type))return first.type==="goalkeeper"||second.type==="goalkeeper"?EQUIPMENT_MIN_DISTANCE["equipment-goalkeeper"]:EQUIPMENT_MIN_DISTANCE["equipment-player"];
  return 4;
}

function pathPoints(origin:Point,target:Point,count:number,zigzag:boolean,density:TacticalLayoutDensity){
  const perpendicular={x:-(target.y-origin.y),y:target.x-origin.x},length=Math.max(1,Math.hypot(perpendicular.x,perpendicular.y));
  const amplitude=zigzag?Math.max(5.5,Math.min(9.5,11-count*.65-(density==="HIGH"?1:0))):0;
  return Array.from({length:count},(_,index)=>{const t=(index+1)/(count+1),side=index%2===0?-1:1;return{x:clamp(origin.x+(target.x-origin.x)*t+perpendicular.x/length*amplitude*side),y:clamp(origin.y+(target.y-origin.y)*t+perpendicular.y/length*amplitude*side)};});
}

function updatePathActions(diagram:TacticalDiagram,items:TacticalDiagramElement[],origin:TacticalDiagramElement|undefined){
  const actions=diagram.actions.filter(item=>item.id.startsWith("validation-path-")).sort((a,b)=>a.sequence-b.sequence);
  let previous=origin?{x:origin.x,y:origin.y}:items[0]?{x:items[0].x,y:items[0].y}:null;
  items.forEach((item,index)=>{const action=actions[index];if(action&&previous)Object.assign(action,{startX:previous.x,startY:previous.y,endX:item.x,endY:item.y,fromElementId:index===0?origin?.id:undefined});previous={x:item.x,y:item.y};});
}

function syncLinkedActions(diagram:TacticalDiagram){
  const byId=new Map(diagram.elements.map(item=>[item.id,item]));
  for(const action of diagram.actions){const from=action.fromElementId?byId.get(action.fromElementId):undefined,to=action.toElementId?byId.get(action.toElementId):undefined;if(from&&!humanTypes.has(from.type))Object.assign(action,{startX:from.x,startY:from.y});if(to&&(equipmentTypes.has(to.type)||to.type==="ball"))Object.assign(action,{endX:to.x,endY:to.y});}
}

export function validateEquipmentLayout(diagram:TacticalDiagram,requirements:ReadonlyArray<TacticalSetupRequirement>,density=calculateTacticalLayoutDensity(diagram)):TacticalLayoutValidation{
  const hasPathRelation=requirements.some(item=>item.relation==="slalom"||item.relation==="hurdle_sequence"),hasGate=requirements.some(item=>item.relation==="cone_gate");
  let excessiveOverlap=0;
  for(let left=0;left<diagram.elements.length;left+=1)for(let right=left+1;right<diagram.elements.length;right+=1){const first=diagram.elements[left],second=diagram.elements[right];if(!equipmentTypes.has(first.type)&&!equipmentTypes.has(second.type)&&first.type!=="ball"&&second.type!=="ball")continue;if(distance(first,second)<minimumDistance(first,second)*.72)excessiveOverlap+=1;}
  const pathRequirements=requirements.filter(item=>item.relation==="slalom"||item.relation==="hurdle_sequence");
  const pathTooCompressed=pathRequirements.some(requirement=>{const items=diagram.elements.filter(item=>item.type===requirement.type).slice(0,requirement.count);return items.some((item,index)=>index>0&&distance(item,items[index-1])<minimumDistance(item,items[index-1])*.9);});
  const xs=diagram.elements.map(item=>item.x),ys=diagram.elements.map(item=>item.y),area=xs.length?(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)):0;
  const excessiveDensity=density==="HIGH"&&area<1500;
  let actionCollision=0;
  for(const action of diagram.actions)for(const item of diagram.elements){if(item.id===action.fromElementId||item.id===action.toElementId)continue;if(item.type==="ball"||equipmentTypes.has(item.type)||humanTypes.has(item.type)){const endpointParticipant=humanTypes.has(item.type)&&Math.min(distance(item,{x:action.startX,y:action.startY}),distance(item,{x:action.endX,y:action.endY}))<8;const functionalPathItem=hasPathRelation&&(item.type==="marker"||item.type==="hurdle")||hasGate&&item.type==="cone"&&action.id.startsWith("validation-path-");const intentional=endpointParticipant||functionalPathItem||item.type==="mannequin"&&["tiro","passaggio"].includes(action.type);if(!intentional&&pointSegmentDistance(item,action)<3.2)actionCollision+=1;}}
  const minimumBallScale=TACTICAL_MINIMUM_DISPLAY_SCALE.ball??0;
  const unreadableBall=diagram.elements.some(item=>item.type==="ball")&&(TACTICAL_VISUAL_SCALE.ball<.8||minimumBallScale<.72);
  const warnings:string[]=[];if(excessiveOverlap)warnings.push(`${excessiveOverlap} sovrapposizioni eccessive`);if(excessiveDensity)warnings.push("Densità elevata concentrata in una zona ridotta");if(pathTooCompressed)warnings.push("Percorso troppo compresso");if(actionCollision)warnings.push(`${actionCollision} collisioni tra actions ed elementi non coinvolti`);if(unreadableBall)warnings.push("Pallone sotto la soglia minima di leggibilità");
  return{valid:warnings.length===0,warnings,metrics:{excessiveOverlap,excessiveDensity,pathTooCompressed,actionCollision,unreadableBall}};
}

export function refineEquipmentLayout(diagram:TacticalDiagram,requirements:ReadonlyArray<TacticalSetupRequirement>,source:DiagramSource|null="automatic"):TacticalEquipmentLayoutResult{
  const output=clone(diagram),density=calculateTacticalLayoutDensity(output),adjustments:string[]=[];
  if(source==="manual"||source==="automatic_edited")return{diagram, density,zones:[...EQUIPMENT_LAYOUT_ZONES],validation:validateEquipmentLayout(diagram,requirements,density),adjustments};
  const origin=output.elements.find(item=>item.type==="goalkeeper")??output.elements.find(item=>humanTypes.has(item.type));
  const target=output.elements.find(item=>item.type==="mini_goal");
  for(const requirement of requirements.filter(item=>item.relation==="slalom"||item.relation==="hurdle_sequence")){
    const items=output.elements.filter(item=>item.type===requirement.type).slice(0,requirement.count);if(!items.length)continue;
    const pathEnd=target?{x:clamp(target.x+(target.x>50?-15:15)),y:clamp(target.y+10)}:{x:clamp((origin?.x??50)+(density==="HIGH"?20:12)),y:32};
    const points=pathPoints(origin??{x:50,y:78},pathEnd,items.length,requirement.relation==="slalom",density);
    items.forEach((item,index)=>Object.assign(item,points[index]));updatePathActions(output,items,origin);adjustments.push(requirement.relation==="slalom"?"Slalom distribuito in zig-zag lungo la PATH ZONE":"Ostacoli distribuiti lungo una progressione diagonale");
  }
  syncLinkedActions(output);
  const validation=validateEquipmentLayout(output,requirements,density);
  return{diagram:output,density,zones:[...EQUIPMENT_LAYOUT_ZONES],validation,adjustments};
}
