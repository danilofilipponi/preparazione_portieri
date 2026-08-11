"use client";

import { useState } from "react";
import { AuthGate } from "../../auth-gate";
import { ExerciseTacticalBoard } from "../../components/exercise-tactical-board";
import { generateTacticalDiagram } from "../../../lib/tactical-diagram";
import { validateTacticalSetup, type TacticalSetupValidation } from "../../../lib/tactical-setup-validation";
import type { Exercise } from "../../../lib/types";

const base:Exercise={id:"setup-dev",codice:"GK-SETUP",nome:"Setup",category_id:1,subcategory_id:1,categoria:"Tecnica",sottocategoria:"Setup",fase:"Analitico",obiettivo:"Validazione setup",descrizione:"",durata_min:10,portieri_min:1,portieri_max:2,intensita:"Media",difficolta:2,materiale:"Palloni",variante:null,coaching_points:"",errori_comuni:"",schema_step_1:null,schema_step_2:null,schema_step_3:null,schema_step_4:null,schema_step_5:null,schema_step_6:null,scenario_gara:null,numero_azioni:null,schema_url:null,foto_url:null,attivo:true};

const cases:Array<[string,Partial<Exercise>]> = [
  ["CONI",{nome:"Partenza tra due coni",descrizione:"Il GK parte tra due coni e interviene sul tiro.",materiale:"Palloni, 2 coni"}],
  ["CINESINI",{nome:"Slalom tecnico",descrizione:"Il portiere esegue uno slalom tra 5 cinesini prima del passaggio.",materiale:"5 cinesini, palloni"}],
  ["PORTICINA",{nome:"Tecnica di piede con target",descrizione:"Il GK effettua un passaggio nella porticina.",materiale:"Palloni, 1 porticina"}],
  ["DUE PORTICINE",{nome:"Scelta del target",descrizione:"Il GK sceglie tra due porticine laterali ed effettua il passaggio.",materiale:"Palloni, 2 porticine"}],
  ["SAGOME",{nome:"Passaggio nel varco",descrizione:"Il portiere effettua un passaggio tra due sagome.",materiale:"Palloni, 2 sagome"}],
  ["OSTACOLI",{nome:"Sequenza coordinativa",descrizione:"Il GK supera 3 ostacoli, recupera posizione e para.",materiale:"3 ostacoli, palloni"}],
  ["MULTI-BALL",{nome:"Seconda palla",descrizione:"Il tiratore conclude e l'appoggio serve la seconda palla.",materiale:"Palloni"}],
  ["SETUP COMPLESSO",{nome:"Tecnica di piede con percorso e target",descrizione:"Il GK parte tra due coni, esegue uno slalom tra 4 cinesini e passa nella porticina.",materiale:"Palloni, 2 coni, 4 cinesini, 1 porticina"}],
];

function generatedList(generated:TacticalSetupValidation["generatedElements"]){return Object.entries(generated).filter(([,count])=>count).map(([type,count])=>`${type} ×${count}`);}
function ValidationFlag({valid}:{valid:boolean}){return <strong className={`setup-status ${valid?"is-valid":"is-needs_review"}`}>{valid?"VALID":"NEEDS_REVIEW"}</strong>;}
function LayoutFlag({valid}:{valid:boolean}){return <strong className={`setup-status ${valid?"is-valid":"is-valid_with_warnings"}`}>{valid?"VALID":"VALID_WITH_WARNINGS"}</strong>;}
function LayoutDebug({validation}:{validation:TacticalSetupValidation}){return <div className="layout-debug-overlay" aria-hidden="true">{validation.layoutZones.map(zone=><div key={zone.name} className={`layout-zone is-${zone.name.toLowerCase()}`}><span>{zone.name} ZONE</span></div>)}</div>;}

function BoardComparison({current,refined,showDebug}:{current:TacticalSetupValidation;refined:TacticalSetupValidation;showDebug:boolean}){return <div className="equipment-layout-comparison"><div><span>CURRENT EQUIPMENT</span><div className="equipment-board-wrap"><ExerciseTacticalBoard diagram={current.diagram} rendererVersion="v2-final" className="compact-board"/></div></div><div><span>REFINED EQUIPMENT LAYOUT</span><div className="equipment-board-wrap"><ExerciseTacticalBoard diagram={refined.diagram} rendererVersion="v2-final" className="compact-board"/>{showDebug&&<LayoutDebug validation={refined}/>}</div></div></div>;}

function EquipmentValidationPage(){const[showDebug,setShowDebug]=useState(false);return <main className="tactical-equipment-page"><header><span className="eyebrow">Development preview</span><h1>Equipment placement & relationships</h1><p>Confronto a parità di semantica e JSON sorgente. Nessun dato viene salvato.</p><label className="layout-debug-toggle"><input type="checkbox" checked={showDebug} onChange={event=>setShowDebug(event.target.checked)}/> SHOW LAYOUT DEBUG</label></header><div className="tactical-equipment-list">{cases.map(([label,patch])=>{const exercise={...base,...patch},raw=generateTacticalDiagram(exercise,{validateSetup:false}),current=validateTacticalSetup(exercise,raw,{autoRepair:true,source:"automatic",refineLayout:false}),refined=validateTacticalSetup(exercise,raw,{autoRepair:true,source:"automatic",refineLayout:true});return <article key={label} className="tactical-equipment-case is-comparison"><div className="tactical-equipment-debug"><div><span>CASO</span><h2>{label}</h2></div><div><span>TESTO ESERCIZIO</span><p>{exercise.descrizione}</p></div><div><span>ELEMENTI ATTESI</span><ul>{refined.expectedElements.map(item=><li key={`${item.type}-${item.relation}`}>{item.type} ×{item.count} · {item.essential?"essenziale":"secondario"}</li>)}</ul></div><div><span>ELEMENTI GENERATI</span><p>{generatedList(refined.generatedElements).join(" · ")||"Nessuno"}</p></div><div><span>RELAZIONI ATTESE</span><ul>{refined.expectedRelations.map((value,index)=><li key={`${value}-${index}`}>{value}</li>)}</ul></div><div><span>RELAZIONI GENERATE</span><ul>{refined.generatedRelations.map((value,index)=><li key={`${value}-${index}`}>{value}</li>)}</ul></div><div className="setup-validation-pair"><div><span>ELEMENT VALIDATION</span><ValidationFlag valid={refined.elementValidation.valid}/></div><div><span>RELATION VALIDATION</span><ValidationFlag valid={refined.relationValidation.valid}/></div><div><span>LAYOUT VALIDATION</span><LayoutFlag valid={refined.layoutValidation.valid}/></div><div><span>DENSITY</span><strong className="setup-status is-valid">{refined.layoutDensity}</strong></div></div>{refined.layoutAdjustments.length>0&&<div><span>LAYOUT REFINEMENT</span><p>{refined.layoutAdjustments.join(" · ")}</p></div>}<div><span>STATO FINALE</span><strong className={`setup-status is-${refined.status.toLowerCase()}`}>{refined.status}</strong>{refined.issues.map(issue=><p key={issue}>{issue}</p>)}{refined.warnings.map(warning=><p key={warning}>{warning}</p>)}</div></div><BoardComparison current={current} refined={refined} showDebug={showDebug}/></article>;})}</div></main>;}

export default function Page(){return <AuthGate><EquipmentValidationPage/></AuthGate>;}
