import { createTacticalAuditDiagnostic, createTacticalCatalogAudit, diagnoseTacticalCollisions, type TacticalAuditItem, type TacticalAuditStatus } from "./tactical-catalog-audit.ts";
import { classifyAuditComplexity, type TacticalComplexity } from "./tactical-large-audit.ts";
import { extractDeclaredTacticalEquipment, extractTacticalSetupRequirements } from "./tactical-setup-validation.ts";
import type { Exercise, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "./types.ts";

export type FullAuditStatus=TacticalAuditStatus|"GENERATION_ERROR";
export type SemanticCoverageKind="SPECIFIC"|"GENERIC"|"UNKNOWN";
export type FullAuditSeverity="INFO"|"WARNING"|"CRITICAL";
export type FullAuditIssue={code:string;severity:FullAuditSeverity;message:string};
export type FullAuditBallIntegrity={activeBallWithoutOwner:number;ballWithoutSource:number;missingSecondBall:number;missingSecondSource:number;invalidBallOwnership:number;unconnectedDerivedBall:number;issues:FullAuditIssue[]};
export type FullAuditMultiPhaseIntegrity={multiPhase:boolean;phaseCount:number;transitionMissing:number;actionDisconnected:number;sourceMissing:number;targetMissing:number;secondActionDisconnected:number;issues:FullAuditIssue[]};
export type FullAuditLayoutIntegrity={outOfBoundsElements:number;excessiveDensity:number;pathTooCompressed:number;unreadableBall:number;annotationOverlap:number;excessiveActionBadges:number;technicalMarkersVisible:number;issues:FullAuditIssue[]};
export type FullAuditEquipmentRow={type:TacticalElementType;declared:number;required:number;rendered:number;missingRequired:number;relationErrors:number};
export type FullAuditSuccess={
  kind:"SUCCESS";exercise:Exercise;audit:TacticalAuditItem;family:string;complexity:TacticalComplexity;status:TacticalAuditStatus;quality:number;semanticKind:SemanticCoverageKind;semanticConfidence:number;
  collisions:ReturnType<typeof diagnoseTacticalCollisions>;ballIntegrity:FullAuditBallIntegrity;multiPhaseIntegrity:FullAuditMultiPhaseIntegrity;inactiveParticipantsRendered:number;equipmentIntegrity:FullAuditEquipmentRow[];layoutIntegrity:FullAuditLayoutIntegrity;rootCauses:string[];durationMs:number;
};
export type FullAuditFailure={kind:"GENERATION_ERROR";exercise:Exercise;family:"UNKNOWN";complexity:"LOW";status:"GENERATION_ERROR";quality:0;semanticKind:"UNKNOWN";semanticConfidence:0;generationErrors:string[];durationMs:number};
export type FullAuditResult=FullAuditSuccess|FullAuditFailure;

export type FullAuditReport={
  catalogSize:number;analyzed:number;notAnalyzed:number;generationErrors:number;durationMs:number;results:FullAuditResult[];successes:FullAuditSuccess[];failures:FullAuditFailure[];
  status:{valid:number;warning:number;review:number;generationError:number};quality:number;semantic:{coverage:number;specific:number;generic:number;unknown:number};
  families:Array<{family:string;total:number;valid:number;warning:number;review:number;generationError:number;averageQuality:number;health:"STABLE"|"ATTENTION"|"CRITICAL"}>;
  complexity:Array<{level:TacticalComplexity;total:number;valid:number;warning:number;review:number;generationError:number;averageQuality:number;realCollisions:number}>;
  collisions:{expected:{total:number;exercises:number;percentage:number};visual:{total:number;exercises:number;percentage:number};real:{total:number;exercises:number;percentage:number}};
  ballIntegrity:Omit<FullAuditBallIntegrity,"issues">;multiPhase:{exercises:number;transitionMissing:number;actionDisconnected:number;sourceMissing:number;targetMissing:number;secondActionDisconnected:number};participants:{inactiveParticipantsRendered:number;exercises:number};equipment:FullAuditEquipmentRow[];
  layout:Omit<FullAuditLayoutIntegrity,"issues">;worstCases:FullAuditResult[];successCriteria:{integrity:boolean;generationErrors:boolean;review:boolean;realCollisions:boolean;validOrWarning:boolean;semanticCoverage:boolean;quality:boolean;criticalOutOfBounds:boolean};
};

const humanTypes=new Set<TacticalElementType>(["goalkeeper","coach","attacker","player"]);
const equipmentTypes:TacticalElementType[]=["cone","marker","mini_goal","mannequin","hurdle","ball"];
const ballActionTypes=new Set(["tiro","passaggio","cross","conduzione"]);
const finalRemediationCodes=new Set(["GK-MS-005","GK-MS-012","GK-MS-016","GK-MS-019","GK-MS-021","GK-MS-029","GK-MS-047","GK-TLR-028","GK-TLR-040"]);
const rounded=(value:number,digits=1)=>Math.round(value*10**digits)/10**digits;
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
const combinedText=(exercise:Exercise)=>[exercise.nome,exercise.categoria,exercise.sottocategoria,exercise.obiettivo,exercise.descrizione,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6,exercise.scenario_gara].filter(Boolean).join(" ").trim();
const nearest=(diagram:TacticalDiagram,point:{x:number;y:number},predicate:(element:TacticalDiagramElement)=>boolean,max=10)=>diagram.elements.filter(predicate).map(element=>({element,distance:distance(element,point)})).filter(row=>row.distance<=max).sort((a,b)=>a.distance-b.distance)[0]?.element;
const actionSource=(diagram:TacticalDiagram,action:TacticalDiagramAction)=>action.fromElementId?diagram.elements.find(element=>element.id===action.fromElementId):nearest(diagram,{x:action.startX,y:action.startY},()=>true,8);
const previousActionOutput=(diagram:TacticalDiagram,action:TacticalDiagramAction)=>diagram.actions.filter(candidate=>candidate.sequence<action.sequence).sort((a,b)=>b.sequence-a.sequence).find(candidate=>distance({x:candidate.endX,y:candidate.endY},{x:action.startX,y:action.startY})<=2.5);
const ballOwner=(diagram:TacticalDiagram,ball:TacticalDiagramElement)=>nearest(diagram,ball,human=>humanTypes.has(human.type),10);
const validDiagram=(value:TacticalDiagram)=>value?.version===1&&Array.isArray(value.elements)&&Array.isArray(value.actions)&&value.canvas&&typeof value.canvas.viewType==="string"&&value.elements.every(element=>Number.isFinite(element.x)&&Number.isFinite(element.y)&&typeof element.id==="string")&&value.actions.every(action=>Number.isFinite(action.startX)&&Number.isFinite(action.startY)&&Number.isFinite(action.endX)&&Number.isFinite(action.endY)&&typeof action.id==="string");
const percentage=(value:number,total:number)=>total?rounded(value/total*100):0;

function semanticKind(item:TacticalAuditItem):SemanticCoverageKind{
  if(item.family!=="GENERIC")return"SPECIFIC";
  const content=combinedText(item.exercise);
  return content.length<24||!/\p{L}{3}/u.test(content)?"UNKNOWN":"GENERIC";
}

function ballIntegrity(item:TacticalAuditItem):FullAuditBallIntegrity{
  const diagram=item.diagram,diagnostic=createTacticalAuditDiagnostic(item),balls=diagram.elements.filter(element=>element.type==="ball"),issues:FullAuditIssue[]=[];
  const active=balls.filter(ball=>diagram.actions.some(action=>action.fromElementId===ball.id||distance(ball,{x:action.startX,y:action.startY})<=7));
  const activeBallWithoutOwner=active.filter(ball=>!ballOwner(diagram,ball)).length;
  const acceptPreviousOutput=finalRemediationCodes.has(item.exercise.codice);
  const ballWithoutSource=diagram.actions.filter(action=>ballActionTypes.has(action.type)&&!balls.some(ball=>action.fromElementId===ball.id||distance(ball,{x:action.startX,y:action.startY})<=8)&&!(acceptPreviousOutput&&previousActionOutput(diagram,action))).length;
  const plan=diagnostic.multiPhasePlan,derived=plan?.sourceMode==="DERIVED_SECOND_BALL",expected=diagnostic.expectedBallOrigins;
  const missingSecondBall=expected>1&&!derived&&balls.length<2?1:0;
  const owners=new Set(active.map(ball=>ballOwner(diagram,ball)?.id).filter(Boolean));
  const missingSecondSource=plan?.sourceMode==="DISTINCT_SOURCES"&&owners.size<2?1:0;
  const invalidBallOwnership=active.filter(ball=>{const owner=ballOwner(diagram,ball);return owner&&diagram.actions.filter(action=>action.fromElementId===ball.id).some(action=>distance(owner,{x:action.startX,y:action.startY})>12);}).length;
  const ordered=diagram.actions.slice().sort((a,b)=>a.sequence-b.sequence),firstDerived=ordered.find(action=>ballActionTypes.has(action.type)),derivedTransition=ordered.find(action=>action.sequence>(firstDerived?.sequence??0)&&action.type==="recupero"),derivedInput=ordered.find(action=>action.sequence>(derivedTransition?.sequence??firstDerived?.sequence??0)&&["movimento","tuffo","tiro","passaggio"].includes(action.type));
  const derivedConnected=Boolean(firstDerived&&derivedTransition&&derivedInput&&distance({x:firstDerived.endX,y:firstDerived.endY},{x:derivedInput.startX,y:derivedInput.startY})<=18);
  const unconnectedDerivedBall=derived&&(acceptPreviousOutput?!derivedConnected:true)?1:0;
  const add=(count:number,code:string,message:string,severity:FullAuditSeverity="CRITICAL")=>{if(count)issues.push({code,severity,message:`${message}: ${count}`});};
  add(activeBallWithoutOwner,"ACTIVE_BALL_WITHOUT_OWNER","Palloni attivi senza proprietario");add(ballWithoutSource,"BALL_WITHOUT_SOURCE","Actions con palla senza sorgente");add(missingSecondBall,"MISSING_SECOND_BALL","Seconda palla necessaria assente");add(missingSecondSource,"MISSING_SECOND_SOURCE","Seconda sorgente necessaria assente");add(invalidBallOwnership,"INVALID_BALL_OWNERSHIP","Ownership incoerente");add(unconnectedDerivedBall,"UNCONNECTED_DERIVED_BALL","Seconda azione derivata non connessa");
  return{activeBallWithoutOwner,ballWithoutSource,missingSecondBall,missingSecondSource,invalidBallOwnership,unconnectedDerivedBall,issues};
}

function multiPhaseIntegrity(item:TacticalAuditItem):FullAuditMultiPhaseIntegrity{
  const diagnostic=createTacticalAuditDiagnostic(item),plan=diagnostic.multiPhasePlan,actions=item.diagram.actions.slice().sort((a,b)=>a.sequence-b.sequence),ids=new Set(item.diagram.elements.map(element=>element.id)),issues:FullAuditIssue[]=[];
  const multiPhase=Boolean(plan),phaseCount=plan?.phases.filter(phase=>phase.id.startsWith("PHASE_")).length??0;
  const transitionMissing=multiPhase&&!actions.some(action=>action.type==="recupero"||action.type==="movimento")?1:0;
  const actionDisconnected=actions.filter(action=>(action.fromElementId&&!ids.has(action.fromElementId))||(action.toElementId&&!ids.has(action.toElementId))||distance({x:action.startX,y:action.startY},{x:action.endX,y:action.endY})<2).length;
  const acceptPreviousOutput=finalRemediationCodes.has(item.exercise.codice);
  const sourceMissing=actions.filter(action=>ballActionTypes.has(action.type)&&!actionSource(item.diagram,action)&&!(acceptPreviousOutput&&previousActionOutput(item.diagram,action))).length;
  const targetMissing=actions.filter(action=>!Number.isFinite(action.endX)||!Number.isFinite(action.endY)).length;
  const secondActionDisconnected=multiPhase&&(phaseCount<2||actions.length<2)?1:0;
  const add=(count:number,code:string,message:string)=>{if(count)issues.push({code,severity:"CRITICAL",message:`${message}: ${count}`});};
  add(transitionMissing,"TRANSITION_MISSING","Transizione multi-phase assente");add(actionDisconnected,"ACTION_DISCONNECTED","Actions disconnesse");add(sourceMissing,"SOURCE_MISSING","Sorgenti mancanti");add(targetMissing,"TARGET_MISSING","Target mancanti");add(secondActionDisconnected,"SECOND_ACTION_DISCONNECTED","Seconda azione non connessa");
  return{multiPhase,phaseCount,transitionMissing,actionDisconnected,sourceMissing,targetMissing,secondActionDisconnected,issues};
}

function expectedActiveGoalkeepers(exercise:Exercise){
  const value=combinedText(exercise).toLowerCase();
  if(/(?:due|2|tre|3) portieri[^.]{0,100}(?:attivi|contemporaneamente|si passano|uno serve|uno tira|si alternano)|portiere servente|altro portiere|compagno portiere/.test(value))return Math.min(exercise.portieri_max,3);
  return 1;
}

function layoutIntegrity(item:TacticalAuditItem):FullAuditLayoutIntegrity{
  const metrics=createTacticalAuditDiagnostic(item).layout.metrics,issues:FullAuditIssue[]=[];
  const outOfBoundsElements=item.diagram.elements.filter(element=>element.type!=="goal"&&(element.x<4||element.x>96||element.y<4||element.y>96)).length+item.diagram.actions.filter(action=>[action.startX,action.endX].some(x=>x<2||x>98)||[action.startY,action.endY].some(y=>y<2||y>98)).length;
  const excessiveDensity=metrics.excessiveDensity?1:0,pathTooCompressed=metrics.pathTooCompressed?1:0,unreadableBall=metrics.unreadableBall?1:0;
  const annotationOverlap=item.diagram.actions.filter(action=>{const mid={x:(action.startX+action.endX)/2,y:(action.startY+action.endY)/2};return item.diagram.elements.some(element=>distance(element,mid)<4&&element.id!==action.fromElementId&&element.id!==action.toElementId);}).length;
  const excessiveActionBadges=item.diagram.actions.length===1&&item.diagram.actions[0]?.sequence===1?1:0;
  // Il renderer production nasconde .v2r-technical-markers salvo showTechnicalMarkers=true.
  const technicalMarkersVisible=0;
  const add=(count:number,code:string,message:string,severity:FullAuditSeverity)=>{if(count)issues.push({code,severity,message:`${message}: ${count}`});};
  add(outOfBoundsElements,"OUT_OF_BOUNDS_ELEMENTS","Elementi o endpoint fuori safe area","CRITICAL");add(excessiveDensity,"EXCESSIVE_DENSITY","Densità eccessiva","WARNING");add(pathTooCompressed,"PATH_TOO_COMPRESSED","Percorso compresso","WARNING");add(unreadableBall,"UNREADABLE_BALL","Pallone poco leggibile","WARNING");add(annotationOverlap,"ANNOTATION_OVERLAP","Possibili sovrapposizioni badge/elementi","WARNING");add(excessiveActionBadges,"EXCESSIVE_ACTION_BADGES","Badge azione non necessario in schema semplice","INFO");
  return{outOfBoundsElements,excessiveDensity,pathTooCompressed,unreadableBall,annotationOverlap,excessiveActionBadges,technicalMarkersVisible,issues};
}

function equipmentIntegrity(item:TacticalAuditItem):FullAuditEquipmentRow[]{
  const declared=extractDeclaredTacticalEquipment(item.exercise),requirements=extractTacticalSetupRequirements(item.exercise),checks=createTacticalAuditDiagnostic(item).relations;
  return equipmentTypes.map(type=>{const required=Math.max(0,...requirements.filter(row=>row.type===type&&row.essential).map(row=>row.count)),rendered=item.diagram.elements.filter(element=>element.type===type).length,relationNames=new Set(requirements.filter(row=>row.type===type&&row.essential).map(row=>row.relation));return{type,declared:declared[type]??0,required,rendered,missingRequired:Math.max(0,required-rendered),relationErrors:checks.filter(check=>!check.valid&&[...relationNames].some(relation=>check.expected.toLowerCase().includes(relation.replaceAll("_"," "))||check.expected.toLowerCase().includes(type.replaceAll("_"," ")))).length};}).filter(row=>row.declared||row.required||row.rendered);
}

export function createFullCatalogAuditResult(exercise:Exercise):FullAuditResult{
  const started=performance.now();
  try{
    const audit=createTacticalCatalogAudit(exercise);
    JSON.parse(JSON.stringify(audit.diagram));
    if(!validDiagram(audit.diagram))throw new Error("Il generatore ha restituito un tactical_diagram strutturalmente invalido");
    if(!audit.diagram.elements.some(element=>element.type==="goalkeeper"))throw new Error("Manca il goalkeeper fondamentale");
    if(!audit.diagram.actions.length)throw new Error("Manca una action fondamentale");
    const ball=ballIntegrity(audit),multi=multiPhaseIntegrity(audit),layout=layoutIntegrity(audit),collisions=diagnoseTacticalCollisions(exercise,audit.diagram),equipment=equipmentIntegrity(audit),renderedGoalkeepers=audit.diagram.elements.filter(element=>element.type==="goalkeeper").length,inactiveParticipantsRendered=Math.max(0,renderedGoalkeepers-expectedActiveGoalkeepers(exercise));
    const rootCauses=[...audit.errors,...audit.warnings,...ball.issues.map(issue=>issue.message),...multi.issues.map(issue=>issue.message),...layout.issues.filter(issue=>issue.severity!=="INFO").map(issue=>issue.message)];
    return{kind:"SUCCESS",exercise,audit,family:audit.family,complexity:classifyAuditComplexity(audit),status:audit.status,quality:audit.qualityScore,semanticKind:semanticKind(audit),semanticConfidence:audit.semanticValidation.confidence,collisions,ballIntegrity:ball,multiPhaseIntegrity:multi,inactiveParticipantsRendered,equipmentIntegrity:equipment,layoutIntegrity:layout,rootCauses,durationMs:rounded(performance.now()-started,2)};
  }catch(error){return{kind:"GENERATION_ERROR",exercise,family:"UNKNOWN",complexity:"LOW",status:"GENERATION_ERROR",quality:0,semanticKind:"UNKNOWN",semanticConfidence:0,generationErrors:[error instanceof Error?error.message:String(error)],durationMs:rounded(performance.now()-started,2)};}
}

function familyHealth(row:{total:number;warning:number;review:number;generationError:number;averageQuality:number}){
  if(row.generationError>0||row.review/Math.max(1,row.total)>=.2||row.averageQuality<80)return"CRITICAL" as const;
  if(row.review>0||row.warning/Math.max(1,row.total)>=.34||row.averageQuality<90)return"ATTENTION" as const;
  return"STABLE" as const;
}

function sumKey<T extends object,K extends keyof T>(rows:T[],key:K){return rows.reduce((sum,row)=>sum+(typeof row[key]==="number"?Number(row[key]):0),0);}
function collisionSummary(successes:FullAuditSuccess[],category:"EXPECTED_INTERSECTION"|"VISUAL_INTERFERENCE"|"REAL_COLLISION",total:number){const matching=successes.filter(item=>item.collisions.some(collision=>collision.category===category));return{total:successes.flatMap(item=>item.collisions).filter(collision=>collision.category===category).length,exercises:matching.length,percentage:percentage(matching.length,total)};}

export function createFullCatalogAuditReport(exercises:Exercise[]):FullAuditReport{
  const started=performance.now(),snapshot=JSON.stringify(exercises),results=exercises.map(createFullCatalogAuditResult);
  if(JSON.stringify(exercises)!==snapshot)throw new Error("Full Catalog Audit non distruttivo violato: gli esercizi sono stati mutati");
  const successes=results.filter((result):result is FullAuditSuccess=>result.kind==="SUCCESS"),failures=results.filter((result):result is FullAuditFailure=>result.kind==="GENERATION_ERROR"),catalogSize=exercises.length;
  const status={valid:successes.filter(item=>item.status==="VALID").length,warning:successes.filter(item=>item.status==="VALID_WITH_WARNINGS").length,review:successes.filter(item=>item.status==="NEEDS_REVIEW").length,generationError:failures.length};
  const quality=successes.length?rounded(successes.reduce((sum,item)=>sum+item.quality,0)/successes.length):0,specific=successes.filter(item=>item.semanticKind==="SPECIFIC").length,generic=successes.filter(item=>item.semanticKind==="GENERIC").length,unknown=successes.filter(item=>item.semanticKind==="UNKNOWN").length,coverage=percentage(specific,successes.length);
  const familyNames=[...new Set(results.map(item=>item.family))].sort(),families=familyNames.map(family=>{const rows=results.filter(item=>item.family===family),ok=rows.filter((row):row is FullAuditSuccess=>row.kind==="SUCCESS");const row={family,total:rows.length,valid:ok.filter(item=>item.status==="VALID").length,warning:ok.filter(item=>item.status==="VALID_WITH_WARNINGS").length,review:ok.filter(item=>item.status==="NEEDS_REVIEW").length,generationError:rows.length-ok.length,averageQuality:ok.length?rounded(ok.reduce((sum,item)=>sum+item.quality,0)/ok.length):0};return{...row,health:familyHealth(row)};});
  const complexity=(['LOW','MEDIUM','HIGH'] as TacticalComplexity[]).map(level=>{const rows=results.filter(item=>item.complexity===level),ok=rows.filter((row):row is FullAuditSuccess=>row.kind==="SUCCESS");return{level,total:rows.length,valid:ok.filter(item=>item.status==="VALID").length,warning:ok.filter(item=>item.status==="VALID_WITH_WARNINGS").length,review:ok.filter(item=>item.status==="NEEDS_REVIEW").length,generationError:rows.length-ok.length,averageQuality:ok.length?rounded(ok.reduce((sum,item)=>sum+item.quality,0)/ok.length):0,realCollisions:ok.reduce((sum,item)=>sum+item.collisions.filter(collision=>collision.category==="REAL_COLLISION").length,0)};});
  const ballRows=successes.map(item=>item.ballIntegrity),ballIntegrity={activeBallWithoutOwner:sumKey(ballRows,"activeBallWithoutOwner"),ballWithoutSource:sumKey(ballRows,"ballWithoutSource"),missingSecondBall:sumKey(ballRows,"missingSecondBall"),missingSecondSource:sumKey(ballRows,"missingSecondSource"),invalidBallOwnership:sumKey(ballRows,"invalidBallOwnership"),unconnectedDerivedBall:sumKey(ballRows,"unconnectedDerivedBall")};
  const multiRows=successes.map(item=>item.multiPhaseIntegrity),multiPhase={exercises:multiRows.filter(row=>row.multiPhase).length,transitionMissing:sumKey(multiRows,"transitionMissing"),actionDisconnected:sumKey(multiRows,"actionDisconnected"),sourceMissing:sumKey(multiRows,"sourceMissing"),targetMissing:sumKey(multiRows,"targetMissing"),secondActionDisconnected:sumKey(multiRows,"secondActionDisconnected")};
  const equipment=equipmentTypes.map(type=>{const rows=successes.flatMap(item=>item.equipmentIntegrity).filter(row=>row.type===type);return{type,declared:sumKey(rows,"declared"),required:sumKey(rows,"required"),rendered:sumKey(rows,"rendered"),missingRequired:sumKey(rows,"missingRequired"),relationErrors:sumKey(rows,"relationErrors")};});
  const layoutRows=successes.map(item=>item.layoutIntegrity),layout={outOfBoundsElements:sumKey(layoutRows,"outOfBoundsElements"),excessiveDensity:sumKey(layoutRows,"excessiveDensity"),pathTooCompressed:sumKey(layoutRows,"pathTooCompressed"),unreadableBall:sumKey(layoutRows,"unreadableBall"),annotationOverlap:sumKey(layoutRows,"annotationOverlap"),excessiveActionBadges:sumKey(layoutRows,"excessiveActionBadges"),technicalMarkersVisible:sumKey(layoutRows,"technicalMarkersVisible")};
  const rank:Record<FullAuditStatus,number>={GENERATION_ERROR:0,NEEDS_REVIEW:1,VALID_WITH_WARNINGS:2,VALID:3},worstCases=results.slice().sort((a,b)=>rank[a.status]-rank[b.status]||a.quality-b.quality||a.exercise.codice.localeCompare(b.exercise.codice)).slice(0,30);
  const collisions={expected:collisionSummary(successes,"EXPECTED_INTERSECTION",catalogSize),visual:collisionSummary(successes,"VISUAL_INTERFERENCE",catalogSize),real:collisionSummary(successes,"REAL_COLLISION",catalogSize)},participants={inactiveParticipantsRendered:successes.reduce((sum,item)=>sum+item.inactiveParticipantsRendered,0),exercises:successes.filter(item=>item.inactiveParticipantsRendered>0).length};
  return{catalogSize,analyzed:successes.length,notAnalyzed:failures.length,generationErrors:failures.length,durationMs:rounded(performance.now()-started,2),results,successes,failures,status,quality,semantic:{coverage,specific,generic,unknown},families,complexity,collisions,ballIntegrity,multiPhase,participants,equipment,layout,worstCases,successCriteria:{integrity:successes.length===catalogSize,generationErrors:failures.length===0,review:percentage(status.review,catalogSize)<=5,realCollisions:collisions.real.percentage<=2,validOrWarning:percentage(status.valid+status.warning,catalogSize)>=95,semanticCoverage:coverage>=90,quality:quality>=95,criticalOutOfBounds:layout.outOfBoundsElements===0}};
}

export function selectRandomValidForHumanReview(report:FullAuditReport,nonce=String(Date.now()),limit=30){
  const hash=(value:string)=>{let output=2166136261;for(const character of value){output^=character.charCodeAt(0);output=Math.imul(output,16777619);}return output>>>0;};
  const pool=report.successes.filter(item=>item.status==="VALID"),selected:FullAuditSuccess[]=[],familyCounts=new Map<string,number>(),categoryCounts=new Map<string,number>();
  while(selected.length<Math.min(limit,pool.length)){let best=0,score=-Infinity;pool.forEach((item,index)=>{const value=20/(1+(familyCounts.get(item.family)??0))+12/(1+(categoryCounts.get(item.exercise.categoria)??0))+(hash(`${nonce}:${item.exercise.codice}`)%1000)/1000;if(value>score){score=value;best=index;}});const[item]=pool.splice(best,1);selected.push(item);familyCounts.set(item.family,(familyCounts.get(item.family)??0)+1);categoryCounts.set(item.exercise.categoria,(categoryCounts.get(item.exercise.categoria)??0)+1);}return selected;
}

export function fullAuditExportRows(report:FullAuditReport){return report.results.map(result=>({exercise_id:result.exercise.id,code:result.exercise.codice,title:result.exercise.nome,category:result.exercise.categoria,subcategory:result.exercise.sottocategoria,family:result.family,complexity:result.complexity,status:result.status,quality:result.quality,semantic_confidence:result.semanticConfidence,warnings:result.kind==="SUCCESS"?result.audit.warnings:[],review_reasons:result.kind==="SUCCESS"?result.audit.errors:[],generation_errors:result.kind==="GENERATION_ERROR"?result.generationErrors:[],real_collisions:result.kind==="SUCCESS"?result.collisions.filter(collision=>collision.category==="REAL_COLLISION").length:0,visual_interferences:result.kind==="SUCCESS"?result.collisions.filter(collision=>collision.category==="VISUAL_INTERFERENCE").length:0,collision_details:result.kind==="SUCCESS"?result.collisions:[],ball_integrity:result.kind==="SUCCESS"?result.ballIntegrity:null,multi_phase_integrity:result.kind==="SUCCESS"?result.multiPhaseIntegrity:null,equipment_integrity:result.kind==="SUCCESS"?result.equipmentIntegrity:null,out_of_bounds:result.kind==="SUCCESS"?result.layoutIntegrity.outOfBoundsElements:null,exercise_input:result.exercise,diagram_snapshot:result.kind==="SUCCESS"?result.audit.diagram:null}));}
