import { classifyTacticalFamily, generateTacticalDiagram, type SemanticTacticalFamily } from "./tactical-diagram.ts";
import { extractTacticalSetupRequirements, validateTacticalSetup, type TacticalSetupValidationStatus } from "./tactical-setup-validation.ts";
import type { Exercise, TacticalDiagram, TacticalElementType } from "./types.ts";

export type TacticalAuditStatus=TacticalSetupValidationStatus;
export type TacticalAuditItem={
  exercise:Exercise;
  family:SemanticTacticalFamily;
  diagram:TacticalDiagram;
  status:TacticalAuditStatus;
  qualityScore:number;
  semanticValidation:{valid:boolean;confidence:number;reasons:string[]};
  equipmentValidation:{valid:boolean;original:string;interpreted:string[];represented:string[];reasons:string[]};
  relationValidation:{valid:boolean;reasons:string[]};
  layoutValidation:{valid:boolean;density:string;reasons:string[]};
  participants:{declared:string;displayed:string};
  actions:string[];
  reasons:string[];
  alternativePreview:boolean;
};

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

export function createTacticalCatalogAudit(exercise:Exercise):TacticalAuditItem{
  const family=classifyTacticalFamily(exercise),diagram=generateTacticalDiagram(exercise),validation=validateTacticalSetup(exercise,diagram,{autoRepair:false,source:"automatic"}),semanticReasons=family==="GENERIC"?["Famiglia semantica non specifica o wording non riconosciuto"]:[],semanticConfidence=family==="GENERIC"?58:92;
  const requirements=extractTacticalSetupRequirements(exercise),interpreted=requirements.map(item=>`${item.type}=${item.count} · ${item.relation}${item.essential?"":" · secondario"}`),represented=representedEquipment(diagram),equipmentReasons=[...validation.elementValidation.issues,...requirements.filter(item=>!item.essential&&!diagram.elements.some(element=>element.type===item.type)).map(item=>item.reason)],relationReasons=validation.relationValidation.issues,layoutReasons=validation.layoutValidation.warnings;
  const reasons=[...semanticReasons,...equipmentReasons,...relationReasons,...layoutReasons],baseStatus=validation.status,status:TacticalAuditStatus=baseStatus==="NEEDS_REVIEW"?"NEEDS_REVIEW":semanticReasons.length||baseStatus==="VALID_WITH_WARNINGS"?"VALID_WITH_WARNINGS":"VALID";
  let quality=100-semanticReasons.length*14-equipmentReasons.length*12-relationReasons.length*14-layoutReasons.length*5-validation.layoutValidation.metrics.actionCollision*2;if(status==="NEEDS_REVIEW")quality=Math.min(quality,58);if(status==="VALID_WITH_WARNINGS")quality=Math.min(quality,86);quality=Math.max(0,Math.round(quality));
  const goalkeeperCount=diagram.elements.filter(item=>item.type==="goalkeeper").length,actions=diagram.actions.slice().sort((a,b)=>a.sequence-b.sequence).map(action=>`${action.sequence} ${action.type}: ${endpoint(diagram,action.fromElementId,action.startX,action.startY)} → ${endpoint(diagram,action.toElementId,action.endX,action.endY)}`);
  return{exercise,family,diagram,status,qualityScore:quality,semanticValidation:{valid:semanticReasons.length===0,confidence:semanticConfidence,reasons:semanticReasons},equipmentValidation:{valid:validation.elementValidation.valid,original:exercise.materiale||"Non indicati",interpreted,represented,reasons:equipmentReasons},relationValidation:{valid:validation.relationValidation.valid,reasons:relationReasons},layoutValidation:{valid:validation.layoutValidation.valid,density:validation.layoutDensity,reasons:layoutReasons},participants:{declared:`${exercise.portieri_min}-${exercise.portieri_max} portieri`,displayed:`${goalkeeperCount} GK attivi`},actions,reasons,alternativePreview:exercise.diagram_source==="manual"||exercise.diagram_source==="automatic_edited"};
}

export function summarizeTacticalAudit(items:TacticalAuditItem[]){
  const count=(status:TacticalAuditStatus)=>items.filter(item=>item.status===status).length,quality=items.length?Math.round(items.reduce((sum,item)=>sum+item.qualityScore,0)/items.length):0;
  const families=Object.entries(items.reduce<Record<string,{total:number;valid:number;warnings:number;review:number}>>((output,item)=>{const row=output[item.family]??={total:0,valid:0,warnings:0,review:0};row.total+=1;if(item.status==="VALID")row.valid+=1;else if(item.status==="VALID_WITH_WARNINGS")row.warnings+=1;else row.review+=1;return output;},{}));
  const equipment=equipmentPatterns.map(([tag])=>{const matching=items.filter(item=>auditTags(item.exercise).includes(tag));return{tag,total:matching.length,problematic:matching.filter(item=>item.status!=="VALID").length};});
  const patterns=Object.entries(items.flatMap(item=>item.reasons).reduce<Record<string,number>>((output,reason)=>{output[reason]=(output[reason]??0)+1;return output;},{})).sort((a,b)=>b[1]-a[1]);
  return{total:items.length,valid:count("VALID"),warnings:count("VALID_WITH_WARNINGS"),review:count("NEEDS_REVIEW"),quality,families,equipment,patterns};
}
