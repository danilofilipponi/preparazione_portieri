import type { TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "./types.ts";
import type { TacticalSetupRequirement } from "./tactical-setup-validation.ts";

export type TacticalCollisionCategory="EXPECTED_INTERSECTION"|"VISUAL_INTERFERENCE"|"REAL_COLLISION";
export type TacticalCollisionSeverity="MINOR"|"MAJOR"|"CRITICAL";
export type TacticalCollisionKind="ACTION_ELEMENT"|"ELEMENT_ELEMENT";
export type TacticalCollision={
  category:TacticalCollisionCategory;
  severity:TacticalCollisionSeverity;
  kind:TacticalCollisionKind;
  actionId?:string;
  sequence?:number;
  actionType?:string;
  elementId:string;
  elementType:TacticalElementType;
  otherElementId?:string;
  otherElementType?:TacticalElementType;
  distance:number;
  reason:string;
};

type Point={x:number;y:number};
const equipmentTypes=new Set<TacticalElementType>(["cone","marker","hurdle","mannequin","mini_goal"]);
const humanTypes=new Set<TacticalElementType>(["goalkeeper","attacker","player","coach"]);
const relevant=(item:TacticalDiagramElement)=>item.type==="ball"||equipmentTypes.has(item.type)||humanTypes.has(item.type);
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
const rounded=(value:number)=>Math.round(value*10)/10;

function pointSegmentDistance(point:Point,action:TacticalDiagramAction){
  const dx=action.endX-action.startX,dy=action.endY-action.startY,length=dx*dx+dy*dy;
  if(!length)return distance(point,{x:action.startX,y:action.startY});
  const ratio=Math.max(0,Math.min(1,((point.x-action.startX)*dx+(point.y-action.startY)*dy)/length));
  return distance(point,{x:action.startX+ratio*dx,y:action.startY+ratio*dy});
}

function expectedIntersection(action:TacticalDiagramAction,item:TacticalDiagramElement,requirements:ReadonlyArray<TacticalSetupRequirement>){
  if(item.id===action.fromElementId||item.id===action.toElementId)return"Elemento collegato esplicitamente all'action";
  const start=distance(item,{x:action.startX,y:action.startY}),end=distance(item,{x:action.endX,y:action.endY});
  if(humanTypes.has(item.type)&&Math.min(start,end)<8)return"Partecipante all'origine o destinazione dell'action";
  if(item.type==="ball"&&["tiro","passaggio","cross","conduzione"].includes(action.type)&&start<7)return"Pallone attivo all'origine dell'action";
  if(item.type==="mini_goal"&&["tiro","passaggio"].includes(action.type)&&end<7)return"Target tecnico dell'action";
  if(["movimento","corsa","recupero","tuffo"].includes(action.type)&&Math.min(start,end)<4.2)return"Origine o destinazione funzionale del movimento";
  if(action.type==="tuffo"&&item.type==="ball"&&end<6)return"Pallone target del tuffo";
  if(["tiro","passaggio","cross"].includes(action.type)&&item.type==="mannequin"&&requirements.some(value=>value.relation==="mannequin_screen"||value.relation==="mannequin_gate"))return"Sagoma funzionale alla traiettoria";
  if((item.type==="marker"||item.type==="hurdle")&&requirements.some(value=>value.relation==="slalom"||value.relation==="hurdle_sequence"))return"Elemento funzionale del percorso";
  if(item.type==="cone"&&requirements.some(value=>value.relation==="cone_gate")&&action.id.startsWith("validation-path-"))return"Cono funzionale del varco";
  return null;
}

export function classifyTacticalCollisions(diagram:TacticalDiagram,requirements:ReadonlyArray<TacticalSetupRequirement>):TacticalCollision[]{
  const output:TacticalCollision[]=[];
  for(const action of diagram.actions)for(const item of diagram.elements){
    if(!relevant(item))continue;
    const separation=pointSegmentDistance(item,action),expected=expectedIntersection(action,item,requirements);
    if(expected){
      if(separation<3.2)output.push({category:"EXPECTED_INTERSECTION",severity:"MINOR",kind:"ACTION_ELEMENT",actionId:action.id,sequence:action.sequence,actionType:action.type,elementId:item.id,elementType:item.type,distance:rounded(separation),reason:expected});
      continue;
    }
    if(separation>=3.2)continue;
    const ambiguous=separation<.8&&(humanTypes.has(item.type)||item.type==="ball"||item.type==="mini_goal");
    output.push({category:ambiguous?"REAL_COLLISION":"VISUAL_INTERFERENCE",severity:ambiguous?"CRITICAL":separation<1.2?"MAJOR":"MINOR",kind:"ACTION_ELEMENT",actionId:action.id,sequence:action.sequence,actionType:action.type,elementId:item.id,elementType:item.type,distance:rounded(separation),reason:ambiguous?"La traiettoria attraversa un elemento estraneo e ambiguo":"La traiettoria attraversa un elemento non coinvolto"});
  }
  for(let left=0;left<diagram.elements.length;left+=1)for(let right=left+1;right<diagram.elements.length;right+=1){
    const first=diagram.elements[left],second=diagram.elements[right];
    if(!relevant(first)||!relevant(second))continue;
    const separation=distance(first,second),bothBalls=first.type==="ball"&&second.type==="ball",humanOverlap=humanTypes.has(first.type)&&humanTypes.has(second.type),equipmentOnHuman=humanTypes.has(first.type)!==humanTypes.has(second.type)&&(equipmentTypes.has(first.type)||equipmentTypes.has(second.type)||first.type==="ball"||second.type==="ball");
    const threshold=bothBalls?4.5:humanOverlap?5.5:equipmentOnHuman?4.5:2.8;
    if(separation>=threshold)continue;
    output.push({category:"REAL_COLLISION",severity:separation<threshold*.45?"CRITICAL":"MAJOR",kind:"ELEMENT_ELEMENT",elementId:first.id,elementType:first.type,otherElementId:second.id,otherElementType:second.type,distance:rounded(separation),reason:bothBalls?"Due palloni distinti risultano sovrapposti":humanOverlap?"Due figure risultano sovrapposte senza relazione":"Equipment o pallone copre un elemento attivo"});
  }
  return output.sort((a,b)=>(a.sequence??999)-(b.sequence??999)||a.distance-b.distance);
}

export function summarizeTacticalCollisions(collisions:ReadonlyArray<TacticalCollision>){
  return collisions.reduce((summary,item)=>{summary[item.category]+=1;return summary;},{EXPECTED_INTERSECTION:0,VISUAL_INTERFERENCE:0,REAL_COLLISION:0} as Record<TacticalCollisionCategory,number>);
}
