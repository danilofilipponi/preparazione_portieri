import { auditTags, classifyTacticalFamilyHealth, createTacticalAuditDiagnostic, diagnoseTacticalCollisions, summarizeTacticalAudit, summarizeTacticalCollisionCategories, type TacticalAuditItem } from "./tactical-catalog-audit.ts";
import { classifyTacticalFamily } from "./tactical-diagram.ts";
import type { Exercise, TacticalElementType } from "./types.ts";

export const DEFAULT_LARGE_AUDIT_SEED="2026-08-LARGE-01";
export type TacticalComplexity="LOW"|"MEDIUM"|"HIGH";

function hash(value:string){let output=2166136261;for(let index=0;index<value.length;index+=1){output^=value.charCodeAt(index);output=Math.imul(output,16777619);}return output>>>0;}
function seededValue(seed:string,value:string){return hash(`${seed}:${value}`)/4294967296;}
function complexityHint(exercise:Exercise){const text=[exercise.nome,exercise.descrizione,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6].filter(Boolean).join(" ").toLowerCase(),steps=[exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6].filter(Boolean).length;return steps>=5||/seconda palla|doppio|sequenza|match simulation|multi/.test(text)?"HIGH":steps>=3||/cross|1.?vs.?1|reatt|posizion/.test(text)?"MEDIUM":"LOW";}
function keeperBucket(exercise:Exercise){return exercise.portieri_max<=2?"1-2":exercise.portieri_max<=4?"3-4":"5+";}
const recoveredSemanticCodes=new Set(["GK-TP-035","GK-TP-023","GK-CA-032","GK-CA-033","GK-UA-033"]);
function samplingFamily(exercise:Exercise){return recoveredSemanticCodes.has(exercise.codice)?"GENERIC":classifyTacticalFamily(exercise);}
function strata(exercise:Exercise){const tags=auditTags(exercise);return[`category:${exercise.categoria}`,`subcategory:${exercise.sottocategoria}`,`family:${samplingFamily(exercise)}`,`complexity:${complexityHint(exercise)}`,`keepers:${keeperBucket(exercise)}`,`equipment:${tags.length?"WITH":"WITHOUT"}`,...tags.map(tag=>`tag:${tag}`)];}

export function selectLargeCatalogAuditSample(exercises:Exercise[],seed=DEFAULT_LARGE_AUDIT_SEED,limit=150){
  const pool=exercises.filter(item=>item.attivo).slice().sort((a,b)=>a.codice.localeCompare(b.codice)),target=Math.min(limit,pool.length);if(pool.length<=target)return pool;
  const availability=new Map<string,number>();for(const item of pool)for(const key of strata(item))availability.set(key,(availability.get(key)??0)+1);
  const selected:Exercise[]=[],counts=new Map<string,number>();
  while(selected.length<target){
    let bestIndex=0,bestScore=-Infinity;
    pool.forEach((item,index)=>{const keys=strata(item),coverage=keys.reduce((sum,key)=>sum+1/(1+(counts.get(key)??0)),0),rarity=keys.reduce((sum,key)=>sum+1/Math.sqrt(availability.get(key)??1),0),jitter=seededValue(seed,`${item.codice}:${selected.length}`),score=coverage*10+rarity*3+jitter;if(score>bestScore){bestScore=score;bestIndex=index;}});
    const[chosen]=pool.splice(bestIndex,1);selected.push(chosen);for(const key of strata(chosen))counts.set(key,(counts.get(key)??0)+1);
  }
  return selected;
}

export function classifyAuditComplexity(item:TacticalAuditItem):TacticalComplexity{
  const diagnostic=createTacticalAuditDiagnostic(item),participants=diagnostic.activeParticipants.length,required=diagnostic.requiredEquipment.reduce((sum,row)=>sum+row.required,0),multiBall=diagnostic.expectedBallOrigins>1?2:0,multiPhase=diagnostic.multiPhasePlan?2:0,score=item.diagram.actions.length+participants+Math.min(5,required)+multiBall+multiPhase;
  return score>=11?"HIGH":score>=7?"MEDIUM":"LOW";
}

const tagTypes:Record<string,TacticalElementType[]>={CONI:["cone"],CINESINI:["marker"],PORTICINE:["mini_goal"],SAGOME:["mannequin"],OSTACOLI:["hurdle"],"MULTI-BALL":["ball"]};
function percentage(value:number,total:number){return total?Math.round(value/total*1000)/10:0;}
function deterministicPick<T>(values:T[],count:number,seed:string,key:(value:T)=>string){return values.slice().sort((a,b)=>seededValue(seed,key(a))-seededValue(seed,key(b))||key(a).localeCompare(key(b))).slice(0,count);}

export function createLargeCatalogAuditReport(catalogSize:number,items:TacticalAuditItem[],seed=DEFAULT_LARGE_AUDIT_SEED){
  const summary=summarizeTacticalAudit(items),collisions=summarizeTacticalCollisionCategories(items),total=Math.max(1,items.length);
  const families=summary.families.map(([family,row])=>{const matching=items.filter(item=>item.family===family);return{family,tested:row.total,valid:row.valid,warning:row.warnings,review:row.review,averageQuality:Math.round(matching.reduce((sum,item)=>sum+item.qualityScore,0)/Math.max(1,matching.length)),health:classifyTacticalFamilyHealth(row)};});
  const complexity=(['LOW','MEDIUM','HIGH'] as TacticalComplexity[]).map(level=>{const matching=items.filter(item=>classifyAuditComplexity(item)===level);return{level,tested:matching.length,valid:matching.filter(item=>item.status==="VALID").length,warning:matching.filter(item=>item.status==="VALID_WITH_WARNINGS").length,review:matching.filter(item=>item.status==="NEEDS_REVIEW").length,averageQuality:matching.length?Math.round(matching.reduce((sum,item)=>sum+item.qualityScore,0)/matching.length):0};});
  const equipment=Object.entries(tagTypes).map(([tag,types])=>{const matching=items.filter(item=>auditTags(item.exercise).includes(tag)),required=matching.filter(item=>item.equipmentValidation.inventory.some(row=>types.includes(row.type)&&row.required>0)),correct=required.filter(item=>item.equipmentValidation.inventory.filter(row=>types.includes(row.type)&&row.required>0).every(row=>row.rendered>=row.required));return{tag,recognized:matching.length,semanticallyRequired:required.length,correctlyRendered:correct.length,warnings:matching.filter(item=>item.status==="VALID_WITH_WARNINGS").length,reviews:matching.filter(item=>item.status==="NEEDS_REVIEW").length};});
  const specific=items.filter(item=>item.family!=="GENERIC").length,statusRank={NEEDS_REVIEW:0,VALID_WITH_WARNINGS:1,VALID:2},worstCases=items.slice().sort((a,b)=>statusRank[a.status]-statusRank[b.status]||a.qualityScore-b.qualityScore||a.exercise.codice.localeCompare(b.exercise.codice)).slice(0,20).map(item=>({...item,complexity:classifyAuditComplexity(item),rootCause:createTacticalAuditDiagnostic(item).rootCause})),randomValid=deterministicPick(items.filter(item=>item.status==="VALID"),20,`${seed}:valid`,item=>item.exercise.codice),rootCauses=Object.entries(items.flatMap(item=>[...item.errors,...item.warnings]).reduce<Record<string,number>>((output,reason)=>{output[reason]=(output[reason]??0)+1;return output;},{})).sort((a,b)=>b[1]-a[1]);
  return{catalogSize,analyzed:items.length,seed,summary,percentages:{valid:percentage(summary.valid,total),warning:percentage(summary.warnings,total),review:percentage(summary.review,total)},semanticCoverage:percentage(specific,total),specificSemantic:specific,genericUnknown:items.length-specific,families,complexity,equipment,collisions:{...collisions,percentages:{EXPECTED_INTERSECTION:percentage(collisions.affectedExercises.EXPECTED_INTERSECTION,total),VISUAL_INTERFERENCE:percentage(collisions.affectedExercises.VISUAL_INTERFERENCE,total),REAL_COLLISION:percentage(collisions.affectedExercises.REAL_COLLISION,total)}},rootCauses,worstCases,randomValid,successCriteria:{review:percentage(summary.review,total)<=5,realCollision:percentage(collisions.affectedExercises.REAL_COLLISION,total)<=2,validOrWarning:percentage(summary.valid+summary.warnings,total)>=95,semanticCoverage:percentage(specific,total)>=90,quality:summary.quality>=90}};
}
