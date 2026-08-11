import type { Exercise } from "./types.ts";

export type MultiPhaseFamily="REACTION"|"SECOND_BALL"|"DOUBLE_SAVE";
export type MultiPhaseSourceMode="STIMULUS_ONLY"|"DERIVED_SECOND_BALL"|"SAME_SOURCE_TWO_BALLS"|"DISTINCT_SOURCES";
export type TacticalPhase={id:"PHASE_1"|"TRANSITION"|"PHASE_2";stimulus?:string;source?:"SOURCE_A"|"SOURCE_B"|"SOURCE_A_DERIVED";ball?:"BALL_A"|"BALL_B"|"BALL_A_DERIVED";action:string;intervention?:"GK_INTERVENTION_A"|"GK_INTERVENTION_B"};
export type TacticalMultiPhasePlan={family:MultiPhaseFamily;sourceMode:MultiPhaseSourceMode;phases:TacticalPhase[];confidence:number};

function normalizedText(exercise:Exercise){return[exercise.nome,exercise.categoria,exercise.sottocategoria,exercise.obiettivo,exercise.descrizione,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6,exercise.scenario_gara].filter(Boolean).join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

export function createTacticalMultiPhasePlan(exercise:Exercise,family:MultiPhaseFamily):TacticalMultiPhasePlan{
  const text=normalizedText(exercise);
  if(family==="REACTION"){
    const stimulus=/colore|visiv/.test(text)?"VISUAL_STIMULUS":/comando|voce|chiamata/.test(text)?"VERBAL_STIMULUS":/movimento (?:del |di )?(?:preparatore|servitore)/.test(text)?"COACH_MOVEMENT_STIMULUS":/palla|pallone/.test(text)?"BALL_STIMULUS":/direzione|scelta|lato/.test(text)?"DIRECTIONAL_CHOICE":"GENERIC_STIMULUS";
    const hasBallAction=/(?:tiro|conclusione|passaggio|cross|parata|intervento sulla palla)/.test(text);
    return{family,sourceMode:"STIMULUS_ONLY",confidence:stimulus==="GENERIC_STIMULUS"?.72:.94,phases:[{id:"PHASE_1",stimulus,action:"REACTION"},{id:"TRANSITION",action:"GK_MOVEMENT"},...(hasBallAction?[{id:"PHASE_2" as const,source:"SOURCE_A" as const,ball:"BALL_A" as const,action:"BALL_ACTION",intervention:"GK_INTERVENTION_A" as const}]:[])]};
  }
  const derived=/(?:respint|rimbalz|ribattut|palla vagante|deviazione corta|palla libera dopo|seconda azione sulla stessa palla)/.test(text);
  const distinctSources=/(?:secondo|altro) (?:giocatore|servitore|preparatore|tiratore)|appoggio|compagno|due servitori|lato opposto/.test(text);
  const sourceMode:MultiPhaseSourceMode=derived?"DERIVED_SECOND_BALL":distinctSources?"DISTINCT_SOURCES":"SAME_SOURCE_TWO_BALLS";
  return{family,sourceMode,confidence:derived||distinctSources ? .96 : .84,phases:[{id:"PHASE_1",source:"SOURCE_A",ball:"BALL_A",action:"FIRST_SAVE",intervention:"GK_INTERVENTION_A"},{id:"TRANSITION",action:"RECOVERY"},{id:"PHASE_2",source:derived?"SOURCE_A_DERIVED":distinctSources?"SOURCE_B":"SOURCE_A",ball:derived?"BALL_A_DERIVED":"BALL_B",action:"SECOND_SAVE",intervention:"GK_INTERVENTION_B"}]};
}
