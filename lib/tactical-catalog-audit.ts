import { classifyTacticalFamily, generateTacticalDiagram, type SemanticTacticalFamily } from "./tactical-diagram.ts";
import { classifyTacticalCollisions, summarizeTacticalCollisions, type TacticalCollisionCategory } from "./tactical-collisions.ts";
import { createTacticalMultiPhasePlan, type TacticalMultiPhasePlan } from "./tactical-multi-phase.ts";
import { extractTacticalSetupRequirements, validateTacticalSetup, type TacticalEquipmentInventory, type TacticalSetupValidationStatus } from "./tactical-setup-validation.ts";
import type { Exercise, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "./types.ts";

export type TacticalAuditStatus=TacticalSetupValidationStatus;
export type TacticalAuditItem={
  exercise:Exercise;
  family:SemanticTacticalFamily;
  diagram:TacticalDiagram;
  status:TacticalAuditStatus;
  qualityScore:number;
  semanticValidation:{valid:boolean;confidence:number;reasons:string[]};
  equipmentValidation:{valid:boolean;original:string;interpreted:string[];represented:string[];inventory:TacticalEquipmentInventory[];reasons:string[]};
  relationValidation:{valid:boolean;reasons:string[]};
  layoutValidation:{valid:boolean;density:string;reasons:string[]};
  participants:{declared:string;displayed:string};
  actions:string[];
  errors:string[];
  warnings:string[];
  infos:string[];
  reasons:string[];
  alternativePreview:boolean;
};

export type TacticalDiagnosticSeverity="MINOR"|"MAJOR"|"CRITICAL";
export type TacticalCollisionDiagnostic={category:TacticalCollisionCategory;actionId?:string;sequence?:number;actionType?:string;elementId:string;elementType:TacticalElementType;elementLabel:string;otherElementId?:string;otherElementType?:TacticalElementType;distance:number;kind:"ACTION_ELEMENT"|"ELEMENT_ELEMENT";severity:TacticalDiagnosticSeverity;reason:string};
export type TacticalActionDiagnostic={id:string;sequence:number;type:string;from:string;to:string;ball:string;target:string;confidence:number};
export type TacticalBallOriginDiagnostic={ball:string;owner:string;actions:string[];status:"LINKED"|"UNLINKED"};
export type TacticalAuditDiagnostic={
  relevantInput:Array<{label:string;value:string}>;
  activeParticipants:Array<{id:string;type:TacticalElementType;role:string}>;
  requiredEquipment:TacticalEquipmentInventory[];
  generatedElements:Array<{id:string;type:TacticalElementType;role:string;x:number;y:number}>;
  generatedActions:TacticalActionDiagnostic[];
  ballOrigins:TacticalBallOriginDiagnostic[];
  expectedBallOrigins:number;
  relations:Array<{expected:string;generated:string;valid:boolean}>;
  layout:{density:string;metrics:Record<string,number|boolean>;collisions:TacticalCollisionDiagnostic[]};
  validation:{status:TacticalAuditStatus;errors:string[];warnings:string[];infos:string[]};
  rootCause:string;
  severity:TacticalDiagnosticSeverity;
  pipelineStage:string;
  possibleCorrection:string;
  multiPhasePlan:TacticalMultiPhasePlan|null;
};
export type TacticalFamilyHealth="STABLE"|"ATTENTION"|"CRITICAL";

const equipmentPatterns:Array<[string,RegExp]>=[
  ["CONI",/\bconi?\b/i],["CINESINI",/cinesin|marker|delimitator/i],["PORTICINE",/porticin|mini.?goal|mini port/i],
  ["SAGOME",/sagom|mannequin/i],["OSTACOLI",/ostacol|hurdle/i],["MULTI-BALL",/seconda palla|secondo pallone|multi.?ball|due palloni attivi/i],
];
const equipmentTypes:TacticalElementType[]=["cone","marker","mini_goal","mannequin","hurdle","ball"];
const text=(exercise:Exercise)=>[exercise.nome,exercise.categoria,exercise.sottocategoria,exercise.descrizione,exercise.materiale,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6].filter(Boolean).join(" ");
export function auditTags(exercise:Exercise){const value=text(exercise);return equipmentPatterns.filter(([,pattern])=>pattern.test(value)).map(([tag])=>tag);}

export function selectCatalogAuditSample(exercises:Exercise[],limit=30){
  const pool=exercises.filter(item=>item.attivo).slice().sort((a,b)=>a.codice.localeCompare(b.codice)),target=Math.min(limit,pool.length),selected:Exercise[]=[],families=new Map<string,number>(),categories=new Map<string,number>(),tags=new Map<string,number>();
  while(selected.length<target){
    let bestIndex=0,bestScore=-Infinity;
    pool.forEach((item,index)=>{const family=classifyTacticalFamily(item),itemTags=auditTags(item),steps=[item.descrizione,item.schema_step_1,item.schema_step_2,item.schema_step_3].filter(Boolean).length;const familyScore=(families.get(family)??0)===0?40:12/(1+(families.get(family)??0)),categoryScore=(categories.get(item.categoria)??0)===0?22:8/(1+(categories.get(item.categoria)??0)),tagScore=itemTags.reduce((sum,tag)=>sum+((tags.get(tag)??0)===0?14:4/(1+(tags.get(tag)??0))),0),score=familyScore+categoryScore+tagScore+Math.min(8,steps*2)+(item.materiale?3:0);if(score>bestScore){bestScore=score;bestIndex=index;}});
    const [chosen]=pool.splice(bestIndex,1),family=classifyTacticalFamily(chosen);selected.push(chosen);families.set(family,(families.get(family)??0)+1);categories.set(chosen.categoria,(categories.get(chosen.categoria)??0)+1);for(const tag of auditTags(chosen))tags.set(tag,(tags.get(tag)??0)+1);
  }
  return selected;
}

function representedEquipment(diagram:TacticalDiagram){return equipmentTypes.map(type=>({type,count:diagram.elements.filter(item=>item.type===type).length})).filter(item=>item.count).map(item=>`${item.type}=${item.count}`);}
function endpoint(diagram:TacticalDiagram,id:string|undefined,x:number,y:number){const item=id?diagram.elements.find(value=>value.id===id):undefined;return item?.label??item?.role??item?.type??`${Math.round(x)},${Math.round(y)}`;}

const humanTypes=new Set<TacticalElementType>(["goalkeeper","coach","attacker","player"]);
const pointDistance=(first:{x:number;y:number},second:{x:number;y:number})=>Math.hypot(first.x-second.x,first.y-second.y);
function displayElement(item:TacticalDiagramElement|undefined,fallback="NON IDENTIFICATO"){return item?.role??item?.label??item?.id??fallback;}
function nearestElement(diagram:TacticalDiagram,x:number,y:number,predicate:(item:TacticalDiagramElement)=>boolean,maxDistance=10){return diagram.elements.filter(predicate).map(item=>({item,distance:pointDistance(item,{x,y})})).filter(value=>value.distance<=maxDistance).sort((a,b)=>a.distance-b.distance)[0]?.item;}
function ownerOfBall(diagram:TacticalDiagram,ball:TacticalDiagramElement|undefined){return ball?nearestElement(diagram,ball.x,ball.y,item=>humanTypes.has(item.type),10):undefined;}

export function diagnoseTacticalCollisions(exercise:Exercise,diagram:TacticalDiagram):TacticalCollisionDiagnostic[]{
  return classifyTacticalCollisions(diagram,extractTacticalSetupRequirements(exercise)).map(item=>({...item,elementLabel:displayElement(diagram.elements.find(value=>value.id===item.elementId))}));
}

function diagnoseAction(diagram:TacticalDiagram,action:TacticalDiagramAction):TacticalActionDiagnostic{
  const linkedSource=action.fromElementId?diagram.elements.find(item=>item.id===action.fromElementId):undefined,nearSource=linkedSource??nearestElement(diagram,action.startX,action.startY,()=>true,9),ball=linkedSource?.type==="ball"?linkedSource:nearestElement(diagram,action.startX,action.startY,item=>item.type==="ball",9),owner=ownerOfBall(diagram,ball),linkedTarget=action.toElementId?diagram.elements.find(item=>item.id===action.toElementId):undefined,target=linkedTarget??nearestElement(diagram,action.endX,action.endY,()=>true,9),needsBall=["tiro","passaggio","cross","conduzione"].includes(action.type);
  const confidence=Math.min(.98,.5+(linkedSource?.id?0.15:nearSource?0.08:0)+(linkedTarget?.id?0.15:target?0.08:0)+(needsBall&&ball?0.15:needsBall?0:0)+(pointDistance({x:action.startX,y:action.startY},{x:action.endX,y:action.endY})>4?0.05:0));
  return{id:action.id,sequence:action.sequence,type:action.type.toUpperCase(),from:displayElement(owner??nearSource),to:displayElement(target,`${Math.round(action.endX)},${Math.round(action.endY)}`),ball:ball?.id??"—",target:displayElement(target,`${Math.round(action.endX)},${Math.round(action.endY)}`),confidence:Math.round(confidence*100)/100};
}

function rootCauseFor(item:TacticalAuditItem,collisions:TacticalCollisionDiagnostic[]){
  const reason=item.errors[0]??item.warnings[0]??"Nessuna anomalia bloccante";
  if(/origini di palla distinte|seconda palla/i.test(reason))return{rootCause:"Seconda origine di palla non materializzata o non collegata a un servitore distinto",pipelineStage:"GENERATED ELEMENTS / ACTION SOURCES",possibleCorrection:"Proposta: modellare due origini BALL_A/B e collegarle alle rispettive azioni e ai rispettivi servitori."};
  if(/collisione critica/i.test(reason))return{rootCause:`Interferenze action/element ad alta densità (${collisions.length} collisioni diagnosticate)`,pipelineStage:"LAYOUT / VALIDATION",possibleCorrection:"Proposta: riesaminare il routing delle traiettorie o la posizione degli elementi non coinvolti, preservando la semantica."};
  if(/famiglia semantica/i.test(reason))return{rootCause:"Famiglia semantica con confidenza insufficiente",pipelineStage:"SEMANTIC FAMILY",possibleCorrection:"Proposta: ampliare in futuro le regole di classificazione usando i campi descrittivi già disponibili."};
  if(/collision/i.test(reason))return{rootCause:"Traiettoria troppo vicina a un elemento non coinvolto",pipelineStage:"LAYOUT",possibleCorrection:"Proposta: introdurre un routing conservativo locale senza alterare gli attori principali."};
  return{rootCause:reason,pipelineStage:"VALIDATION",possibleCorrection:"Proposta: verificare manualmente input, relazioni e target prima di intervenire sul generatore."};
}

export function createTacticalAuditDiagnostic(item:TacticalAuditItem):TacticalAuditDiagnostic{
  const validation=validateTacticalSetup(item.exercise,item.diagram,{autoRepair:false,source:"automatic"}),actions=item.diagram.actions.slice().sort((a,b)=>a.sequence-b.sequence).map(action=>diagnoseAction(item.diagram,action)),balls=item.diagram.elements.filter(element=>element.type==="ball"),ballOrigins=balls.map(ball=>{const owner=ownerOfBall(item.diagram,ball),linked=item.diagram.actions.filter(action=>action.fromElementId===ball.id).map(action=>`${action.sequence} · ${action.type}`);return{ball:ball.id,owner:displayElement(owner),actions:linked,status:linked.length?"LINKED" as const:"UNLINKED" as const};}),collisions=diagnoseTacticalCollisions(item.exercise,item.diagram),root=rootCauseFor(item,collisions),requiredBalls=validation.equipmentInventory.find(row=>row.type==="ball")?.required??0;
  const steps=[item.exercise.schema_step_1,item.exercise.schema_step_2,item.exercise.schema_step_3,item.exercise.schema_step_4,item.exercise.schema_step_5,item.exercise.schema_step_6].filter((value):value is string=>Boolean(value));
  const multiPhasePlan=item.family==="REACTION"||item.family==="SECOND_BALL"||item.family==="DOUBLE_SAVE"?createTacticalMultiPhasePlan(item.exercise,item.family):null;
  return{relevantInput:[{label:"Obiettivo",value:item.exercise.obiettivo},{label:"Fase",value:item.exercise.fase},{label:"Durata",value:`${item.exercise.durata_min} min`},{label:"Intensità",value:item.exercise.intensita},{label:"Difficoltà",value:String(item.exercise.difficolta)},{label:"Variante",value:item.exercise.variante??"—"},{label:"Scenario gara",value:item.exercise.scenario_gara??"—"},{label:"Numero azioni",value:item.exercise.numero_azioni??String(item.diagram.actions.length)},{label:"Svolgimento",value:steps.length?steps.map((step,index)=>`${index+1}. ${step}`).join(" "):item.exercise.descrizione}],activeParticipants:item.diagram.elements.filter(element=>humanTypes.has(element.type)).map(element=>({id:element.id,type:element.type,role:displayElement(element)})),requiredEquipment:validation.equipmentInventory.filter(row=>row.required>0),generatedElements:item.diagram.elements.map(element=>({id:element.id,type:element.type,role:displayElement(element),x:element.x,y:element.y})),generatedActions:actions,ballOrigins,expectedBallOrigins:requiredBalls,relations:validation.relationValidation.checks.map(check=>({expected:check.expected,generated:check.generated,valid:check.valid})),layout:{density:validation.layoutDensity,metrics:{...validation.layoutValidation.metrics},collisions},validation:{status:item.status,errors:item.errors,warnings:item.warnings,infos:item.infos},...root,severity:item.status==="NEEDS_REVIEW"?"CRITICAL":item.status==="VALID_WITH_WARNINGS"?"MAJOR":"MINOR",multiPhasePlan};
}

export function summarizeTacticalWarningCauses(items:TacticalAuditItem[]){
  const groups=new Map<string,Set<string>>();
  for(const item of items.filter(value=>value.status==="VALID_WITH_WARNINGS"))for(const warning of item.warnings){const cause=/collision|interferenz/i.test(warning)?"COLLISION":/palla|ball|origine/i.test(warning)?"BALL SOURCE":/famiglia semantica/i.test(warning)?"SEMANTIC FAMILY":/layout|densit|percorso/i.test(warning)?"LAYOUT":/relazion|target/i.test(warning)?"RELATION":"OTHER";const codes=groups.get(cause)??new Set<string>();codes.add(item.exercise.codice);groups.set(cause,codes);}
  return[...groups].map(([cause,codes])=>({cause,count:codes.size,codes:[...codes]})).sort((a,b)=>b.count-a.count);
}

export function classifyTacticalFamilyHealth(row:{total:number;valid:number;warnings:number;review:number}):TacticalFamilyHealth{
  if(row.review>0)return"CRITICAL";
  if(row.warnings/Math.max(1,row.total)>=.34||row.valid/Math.max(1,row.total)<.67)return"ATTENTION";
  return"STABLE";
}

function createTacticalCatalogAuditInternal(exercise:Exercise,multiPhaseComposition:boolean):TacticalAuditItem{
  const family=classifyTacticalFamily(exercise),diagram=generateTacticalDiagram(exercise,{multiPhaseComposition}),validation=validateTacticalSetup(exercise,diagram,{autoRepair:false,source:"automatic"}),semanticReasons=family==="GENERIC"?["Famiglia semantica non specifica o wording non riconosciuto"]:[],semanticConfidence=family==="GENERIC"?58:92;
  const requirements=extractTacticalSetupRequirements(exercise),interpreted=requirements.map(item=>`${item.type}=${item.count} · ${item.relation}`),represented=representedEquipment(diagram),equipmentReasons=validation.elementValidation.issues,relationReasons=validation.relationValidation.issues,errors=[...validation.issues],warnings=[...semanticReasons,...validation.warnings],infos=[...validation.infos],reasons=[...errors,...warnings],status:TacticalAuditStatus=errors.length?"NEEDS_REVIEW":warnings.length?"VALID_WITH_WARNINGS":"VALID";
  const metrics=validation.layoutValidation.metrics,layoutPenalty=metrics.excessiveOverlap*3+metrics.actionCollision*3+(metrics.excessiveDensity?6:0)+(metrics.pathTooCompressed?8:0)+(metrics.unreadableBall?5:0);
  let quality=100-semanticReasons.length*10-equipmentReasons.length*18-relationReasons.length*14-layoutPenalty;if(status==="NEEDS_REVIEW")quality=Math.min(quality,58);if(status==="VALID_WITH_WARNINGS")quality=Math.min(quality,89);quality=Math.max(0,Math.round(quality));
  const goalkeeperCount=diagram.elements.filter(item=>item.type==="goalkeeper").length,actions=diagram.actions.slice().sort((a,b)=>a.sequence-b.sequence).map(action=>`${action.sequence} ${action.type}: ${endpoint(diagram,action.fromElementId,action.startX,action.startY)} → ${endpoint(diagram,action.toElementId,action.endX,action.endY)}`);
  return{exercise,family,diagram,status,qualityScore:quality,semanticValidation:{valid:semanticReasons.length===0,confidence:semanticConfidence,reasons:semanticReasons},equipmentValidation:{valid:validation.elementValidation.valid,original:exercise.materiale||"Non indicati",interpreted,represented,inventory:validation.equipmentInventory,reasons:equipmentReasons},relationValidation:{valid:validation.relationValidation.valid,reasons:relationReasons},layoutValidation:{valid:validation.layoutValidation.valid,density:validation.layoutDensity,reasons:validation.layoutValidation.warnings},participants:{declared:`${exercise.portieri_min}-${exercise.portieri_max} portieri`,displayed:`${goalkeeperCount} GK attivi`},actions,errors,warnings,infos,reasons,alternativePreview:exercise.diagram_source==="manual"||exercise.diagram_source==="automatic_edited"};
}

export function createTacticalCatalogAudit(exercise:Exercise){return createTacticalCatalogAuditInternal(exercise,true);}
export function createLegacyTacticalCatalogAudit(exercise:Exercise){return createTacticalCatalogAuditInternal(exercise,false);}

export function summarizeTacticalCollisionCategories(items:TacticalAuditItem[]){
  const collisions=items.flatMap(item=>diagnoseTacticalCollisions(item.exercise,item.diagram)),counts=summarizeTacticalCollisions(collisions),affected=(category:TacticalCollisionCategory)=>new Set(items.filter(item=>diagnoseTacticalCollisions(item.exercise,item.diagram).some(value=>value.category===category)).map(item=>item.exercise.codice)).size;
  return{...counts,affectedExercises:{EXPECTED_INTERSECTION:affected("EXPECTED_INTERSECTION"),VISUAL_INTERFERENCE:affected("VISUAL_INTERFERENCE"),REAL_COLLISION:affected("REAL_COLLISION")}};
}

export function summarizeTacticalAudit(items:TacticalAuditItem[]){
  const count=(status:TacticalAuditStatus)=>items.filter(item=>item.status===status).length,quality=items.length?Math.round(items.reduce((sum,item)=>sum+item.qualityScore,0)/items.length):0;
  const families=Object.entries(items.reduce<Record<string,{total:number;valid:number;warnings:number;review:number}>>((output,item)=>{const row=output[item.family]??={total:0,valid:0,warnings:0,review:0};row.total+=1;if(item.status==="VALID")row.valid+=1;else if(item.status==="VALID_WITH_WARNINGS")row.warnings+=1;else row.review+=1;return output;},{}));
  const equipment=equipmentPatterns.map(([tag])=>{const matching=items.filter(item=>auditTags(item.exercise).includes(tag));return{tag,total:matching.length,problematic:matching.filter(item=>item.status!=="VALID").length};});
  const patterns=Object.entries(items.flatMap(item=>[...item.errors,...item.warnings]).reduce<Record<string,number>>((output,reason)=>{output[reason]=(output[reason]??0)+1;return output;},{})).sort((a,b)=>b[1]-a[1]);
  const infoPatterns=Object.entries(items.flatMap(item=>item.infos).reduce<Record<string,number>>((output,reason)=>{output[reason]=(output[reason]??0)+1;return output;},{})).sort((a,b)=>b[1]-a[1]);
  return{total:items.length,valid:count("VALID"),warnings:count("VALID_WITH_WARNINGS"),review:count("NEEDS_REVIEW"),quality,families,equipment,patterns,infoPatterns,infoCount:items.reduce((sum,item)=>sum+item.infos.length,0)};
}
