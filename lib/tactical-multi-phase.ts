import type { Exercise } from "./types.ts";

export type MultiPhaseFamily="REACTION"|"SECOND_BALL"|"DOUBLE_SAVE"|"MATCH_SIMULATION"|"DIVE";
export type MultiPhaseSourceMode="STIMULUS_ONLY"|"DERIVED_SECOND_BALL"|"SAME_SOURCE_TWO_BALLS"|"DISTINCT_SOURCES";
export type TacticalPhase={id:"PHASE_1"|"TRANSITION"|"PHASE_2";stimulus?:string;source?:"SOURCE_A"|"SOURCE_B"|"SOURCE_A_DERIVED";ball?:"BALL_A"|"BALL_B"|"BALL_A_DERIVED";action:string;intervention?:"GK_INTERVENTION_A"|"GK_INTERVENTION_B"};
export type TacticalMultiPhasePlan={family:MultiPhaseFamily;sourceMode:MultiPhaseSourceMode;phases:TacticalPhase[];confidence:number};

const finalDerivedMatchCodes=new Set(["GK-MS-005","GK-MS-012","GK-MS-016","GK-MS-019","GK-MS-021","GK-MS-029","GK-MS-047"]);

function normalizedText(exercise:Exercise){return[exercise.nome,exercise.categoria,exercise.sottocategoria,exercise.obiettivo,exercise.descrizione,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6,exercise.scenario_gara].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

export function supportsTacticalMultiPhasePlan(exercise:Exercise,family:MultiPhaseFamily){
  if(family==="REACTION"||family==="SECOND_BALL"||family==="DOUBLE_SAVE")return true;
  const text=normalizedText(exercise);
  if(family==="DIVE")return exercise.codice==="RAP-004";
  return exercise.codice==="GK-ROT-040"||exercise.codice==="GK-TLR-040"||finalDerivedMatchCodes.has(exercise.codice)||/(?:corner in traffico|respint|rebound|ribattut|palla sporca)[\s\S]{0,140}(?:seconda palla|seconda azione)|servizio sul lato opposto[\s\S]{0,100}(?:intervento reattivo|seconda azione)|alternanza destra[- ]sinistra[\s\S]{0,120}second[oa] servizio/.test(text);
}

export function createTacticalMultiPhasePlan(exercise:Exercise,family:MultiPhaseFamily):TacticalMultiPhasePlan{
  const text=normalizedText(exercise);
  if(exercise.codice==="GK-TLR-028")return{family,sourceMode:"STIMULUS_ONLY",confidence:.98,phases:[{id:"PHASE_1",source:"SOURCE_A",ball:"BALL_A",action:"FIRST_SAVE",intervention:"GK_INTERVENTION_A"},{id:"TRANSITION",action:"RECOVERY"},{id:"PHASE_2",stimulus:"RANDOM_STIMULUS",action:"SECOND_INTERVENTION",intervention:"GK_INTERVENTION_B"}]};
  if(exercise.codice==="GK-TLR-040")return{family,sourceMode:"STIMULUS_ONLY",confidence:.98,phases:[{id:"PHASE_1",stimulus:"SIDE_CHANGE",action:"BALL_MOVEMENT"},{id:"TRANSITION",action:"REPOSITIONING"},{id:"PHASE_2",source:"SOURCE_A",ball:"BALL_A",action:"FINAL_SHOT",intervention:"GK_INTERVENTION_A"}]};
  if(family==="REACTION"){
    const stimulus=/colore|visiv/.test(text)?"VISUAL_STIMULUS":/comando|voce|chiamata/.test(text)?"VERBAL_STIMULUS":/movimento (?:del |di )?(?:preparatore|servitore)/.test(text)?"COACH_MOVEMENT_STIMULUS":/palla|pallone/.test(text)?"BALL_STIMULUS":/direzione|scelta|lato/.test(text)?"DIRECTIONAL_CHOICE":"GENERIC_STIMULUS";
    const hasBallAction=/(?:tiro|conclusione|passaggio|cross|parata|intervento sulla palla)/.test(text);
    return{family,sourceMode:"STIMULUS_ONLY",confidence:stimulus==="GENERIC_STIMULUS"?.72:.94,phases:[{id:"PHASE_1",stimulus,action:"REACTION"},{id:"TRANSITION",action:"GK_MOVEMENT"},...(hasBallAction?[{id:"PHASE_2" as const,source:"SOURCE_A" as const,ball:"BALL_A" as const,action:"BALL_ACTION",intervention:"GK_INTERVENTION_A" as const}]:[])]};
  }
  const derived=/(?:respint|rebound|rimbalz|ribattut|palla vagante|palla sporca|deviazione corta|palla libera dopo|seconda azione sulla stessa palla|corner in traffico[^.]{0,100}seconda palla)/.test(text);
  const distinctSources=exercise.codice==="RAP-004"||exercise.codice==="GK-ROT-040"||/(?:secondo|altro) (?:giocatore|servitore|preparatore|tiratore)|appoggio|compagno|due servitori|servizio sul lato opposto|(?:secondo|altro) servizio|lato opposto/.test(text);
  const sourceMode:MultiPhaseSourceMode=derived?"DERIVED_SECOND_BALL":distinctSources?"DISTINCT_SOURCES":"SAME_SOURCE_TWO_BALLS";
  return{family,sourceMode,confidence:derived||distinctSources ? .96 : .84,phases:[{id:"PHASE_1",source:"SOURCE_A",ball:"BALL_A",action:"FIRST_SAVE",intervention:"GK_INTERVENTION_A"},{id:"TRANSITION",action:"RECOVERY"},{id:"PHASE_2",source:derived?"SOURCE_A_DERIVED":distinctSources?"SOURCE_B":"SOURCE_A",ball:derived?"BALL_A_DERIVED":"BALL_B",action:"SECOND_SAVE",intervention:"GK_INTERVENTION_B"}]};
}
