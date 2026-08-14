import { createFullCatalogAuditResult } from "./tactical-full-audit.ts";
import type { Exercise, TacticalDiagram } from "./types.ts";

export const FROZEN_TACTICAL_BASELINE="v2-final-2026-08" as const;
export type CatalogWriteAction="WRITE_NEW"|"SKIP_MANUAL"|"SKIP_AUTOMATIC_EDITED"|"KEEP_EXISTING_AUTOMATIC"|"REGENERATE_AUTOMATIC"|"WRITE_BLOCKED"|"NO_CHANGE";
export type AutomaticDiagramStrategy="preserve-unknown"|"regenerate-divergent";
export type CatalogWriteExercise=Omit<Exercise,"diagram_source">&{diagram_source?:string|null};

export type CatalogWriteDecision={
  exercise:CatalogWriteExercise;
  action:CatalogWriteAction;
  currentDiagram:TacticalDiagram|null;
  proposedDiagram:TacticalDiagram|null;
  currentSource:string|null;
  newSource:"automatic"|null;
  quality:number;
  status:string;
  warnings:string[];
  blockers:string[];
  reason:string;
};

export type CatalogDatabaseStatus={total:number;diagramNull:number;diagramPresent:number;sourceNull:number;automatic:number;manual:number;automaticEdited:number;anomalous:Record<string,number>};
export type CatalogWriteDryRun={
  frozenBaseline:typeof FROZEN_TACTICAL_BASELINE;
  database:CatalogDatabaseStatus;
  decisions:CatalogWriteDecision[];
  counts:Record<CatalogWriteAction,number>;
  automaticComparison:{exactFrozenMatch:number;divergentUnknownVersion:number;versionMetadataAvailable:false};
};
export type CatalogBackupRow={exercise_id:string;code:string;old_tactical_diagram:TacticalDiagram|null;old_diagram_source:string|null;old_diagram_updated_at:string|null};
export type CatalogWritePayload={exercise_id:string;code:string;tactical_diagram:TacticalDiagram;diagram_source:"automatic";diagram_updated_at:"SET_AT_EXECUTION"};
export type CatalogWriteBatch={batch:number;size:number;records:CatalogWritePayload[]};
export type CatalogWriteLogRow={timestamp:"SET_AT_EXECUTION";exercise_id:string;code:string;previous_source:string|null;new_source:"automatic";action:"WRITE_NEW"|"REGENERATE_AUTOMATIC";status:"PENDING";error:null};

const validSources=new Set(["automatic","manual","automatic_edited"]);
const writeActions=new Set<CatalogWriteAction>(["WRITE_NEW","REGENERATE_AUTOMATIC"]);

function stable(value:unknown):string{
  if(Array.isArray(value))return`[${value.map(stable).join(",")}]`;
  if(value&&typeof value==="object")return`{${Object.entries(value as Record<string,unknown>).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function diagramsEqual(left:TacticalDiagram|null|undefined,right:TacticalDiagram|null|undefined){return stable(left??null)===stable(right??null);}

export function analyzeCatalogDiagramStatus(exercises:CatalogWriteExercise[]):CatalogDatabaseStatus{
  const anomalous:Record<string,number>={};
  for(const exercise of exercises){const source=exercise.diagram_source??null;if(source&&!validSources.has(source))anomalous[source]=(anomalous[source]??0)+1;}
  return{total:exercises.length,diagramNull:exercises.filter(item=>!item.tactical_diagram).length,diagramPresent:exercises.filter(item=>Boolean(item.tactical_diagram)).length,sourceNull:exercises.filter(item=>!item.diagram_source).length,automatic:exercises.filter(item=>item.diagram_source==="automatic").length,manual:exercises.filter(item=>item.diagram_source==="manual").length,automaticEdited:exercises.filter(item=>item.diagram_source==="automatic_edited").length,anomalous};
}

function proposedResult(exercise:CatalogWriteExercise){return createFullCatalogAuditResult({...exercise,tactical_diagram:null,diagram_source:null} as Exercise);}

function qualityBlockers(result:ReturnType<typeof createFullCatalogAuditResult>){
  if(result.kind==="GENERATION_ERROR")return result.generationErrors.map(error=>`GENERATION_ERROR: ${error}`);
  const blockers:string[]=[];
  if(result.status==="NEEDS_REVIEW")blockers.push("STATUS_NEEDS_REVIEW");
  if(result.collisions.some(item=>item.category==="REAL_COLLISION"))blockers.push("REAL_COLLISION");
  if(result.layoutIntegrity.outOfBoundsElements>0)blockers.push("OUT_OF_BOUNDS");
  if(result.inactiveParticipantsRendered>0)blockers.push("INACTIVE_PARTICIPANT_RENDERED");
  if(result.equipmentIntegrity.some(item=>item.missingRequired>0))blockers.push("REQUIRED_EQUIPMENT_MISSING");
  return blockers;
}

export function decideCatalogWrite(exercise:CatalogWriteExercise,options:{automaticStrategy?:AutomaticDiagramStrategy}={}):CatalogWriteDecision{
  const currentDiagram=exercise.tactical_diagram??null,currentSource=exercise.diagram_source??null;
  if(currentSource==="manual")return{exercise,action:"SKIP_MANUAL",currentDiagram,proposedDiagram:null,currentSource,newSource:null,quality:0,status:"PROTECTED",warnings:[],blockers:[],reason:"Diagramma manuale protetto: scrittura automatica vietata."};
  if(currentSource==="automatic_edited")return{exercise,action:"SKIP_AUTOMATIC_EDITED",currentDiagram,proposedDiagram:null,currentSource,newSource:null,quality:0,status:"PROTECTED",warnings:[],blockers:[],reason:"Diagramma automatico modificato protetto: scrittura automatica vietata."};
  if(currentSource&&!validSources.has(currentSource))return{exercise,action:"WRITE_BLOCKED",currentDiagram,proposedDiagram:null,currentSource,newSource:null,quality:0,status:"INVALID_SOURCE",warnings:[],blockers:["ANOMALOUS_DIAGRAM_SOURCE"],reason:`Valore diagram_source non riconosciuto: ${currentSource}.`};
  if(currentDiagram&&currentSource===null)return{exercise,action:"WRITE_BLOCKED",currentDiagram,proposedDiagram:null,currentSource,newSource:null,quality:0,status:"AMBIGUOUS_OWNERSHIP",warnings:[],blockers:["DIAGRAM_WITHOUT_SOURCE"],reason:"Diagramma presente senza origine: ownership non determinabile in sicurezza."};
  const result=proposedResult(exercise),blockers=qualityBlockers(result);
  if(result.kind==="GENERATION_ERROR")return{exercise,action:"WRITE_BLOCKED",currentDiagram,proposedDiagram:null,currentSource,newSource:null,quality:0,status:"GENERATION_ERROR",warnings:[],blockers,reason:"Generazione in memoria fallita."};
  const proposedDiagram=result.audit.diagram,warnings=result.audit.warnings;
  if(blockers.length)return{exercise,action:"WRITE_BLOCKED",currentDiagram,proposedDiagram,currentSource,newSource:null,quality:result.quality,status:result.status,warnings,blockers,reason:`Quality gate bloccato: ${blockers.join(", ")}.`};
  if(!currentDiagram)return{exercise,action:"WRITE_NEW",currentDiagram:null,proposedDiagram,currentSource,newSource:"automatic",quality:result.quality,status:result.status,warnings,blockers:[],reason:warnings.length?"Nuovo diagramma scrivibile con warning non bloccanti registrati.":"Nuovo diagramma supera tutti i quality gate."};
  if(currentSource==="automatic"&&diagramsEqual(currentDiagram,proposedDiagram))return{exercise,action:"NO_CHANGE",currentDiagram,proposedDiagram,currentSource,newSource:null,quality:result.quality,status:result.status,warnings,blockers:[],reason:"Diagramma automatico strutturalmente identico all’output frozen; procedura idempotente."};
  if(currentSource==="automatic"&&options.automaticStrategy==="regenerate-divergent")return{exercise,action:"REGENERATE_AUTOMATIC",currentDiagram,proposedDiagram,currentSource,newSource:"automatic",quality:result.quality,status:result.status,warnings,blockers:[],reason:"Rigenerazione richiesta esplicitamente per automatico divergente."};
  if(currentSource==="automatic")return{exercise,action:"KEEP_EXISTING_AUTOMATIC",currentDiagram,proposedDiagram,currentSource,newSource:null,quality:result.quality,status:result.status,warnings,blockers:[],reason:"Automatico divergente: versione precedente non distinguibile con certezza; conservato in attesa di strategia esplicita."};
  return{exercise,action:"WRITE_BLOCKED",currentDiagram,proposedDiagram,currentSource,newSource:null,quality:result.quality,status:result.status,warnings,blockers:["UNSAFE_STATE"],reason:"Combinazione diagramma/origine non gestibile in sicurezza."};
}

export function createCatalogWriteDryRun(exercises:CatalogWriteExercise[],options:{automaticStrategy?:AutomaticDiagramStrategy}={}):CatalogWriteDryRun{
  const decisions=exercises.map(exercise=>decideCatalogWrite(exercise,options)),counts={WRITE_NEW:0,SKIP_MANUAL:0,SKIP_AUTOMATIC_EDITED:0,KEEP_EXISTING_AUTOMATIC:0,REGENERATE_AUTOMATIC:0,WRITE_BLOCKED:0,NO_CHANGE:0} satisfies Record<CatalogWriteAction,number>;
  for(const decision of decisions)counts[decision.action]++;
  return{frozenBaseline:FROZEN_TACTICAL_BASELINE,database:analyzeCatalogDiagramStatus(exercises),decisions,counts,automaticComparison:{exactFrozenMatch:counts.NO_CHANGE,divergentUnknownVersion:counts.KEEP_EXISTING_AUTOMATIC,versionMetadataAvailable:false}};
}

export function createCatalogBackup(decisions:CatalogWriteDecision[]):CatalogBackupRow[]{return decisions.filter(item=>writeActions.has(item.action)).map(item=>({exercise_id:item.exercise.id,code:item.exercise.codice,old_tactical_diagram:item.currentDiagram,old_diagram_source:item.currentSource,old_diagram_updated_at:item.exercise.diagram_updated_at??null}));}
export function createCatalogWritePayloads(decisions:CatalogWriteDecision[]):CatalogWritePayload[]{return decisions.filter(item=>writeActions.has(item.action)&&item.proposedDiagram).map(item=>({exercise_id:item.exercise.id,code:item.exercise.codice,tactical_diagram:item.proposedDiagram!,diagram_source:"automatic",diagram_updated_at:"SET_AT_EXECUTION"}));}
export function createCatalogWriteBatches(decisions:CatalogWriteDecision[],batchSize=25):CatalogWriteBatch[]{if(batchSize<20||batchSize>50)throw new Error("La dimensione batch deve essere compresa tra 20 e 50.");const payloads=createCatalogWritePayloads(decisions),batches:CatalogWriteBatch[]=[];for(let index=0;index<payloads.length;index+=batchSize)batches.push({batch:batches.length+1,size:Math.min(batchSize,payloads.length-index),records:payloads.slice(index,index+batchSize)});return batches;}
export function createCatalogWriteLog(decisions:CatalogWriteDecision[]):CatalogWriteLogRow[]{return decisions.filter((item):item is CatalogWriteDecision&{action:"WRITE_NEW"|"REGENERATE_AUTOMATIC"}=>writeActions.has(item.action)).map(item=>({timestamp:"SET_AT_EXECUTION",exercise_id:item.exercise.id,code:item.exercise.codice,previous_source:item.currentSource,new_source:"automatic",action:item.action,status:"PENDING",error:null}));}
