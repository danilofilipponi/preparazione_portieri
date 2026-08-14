"use client";

import { useMemo } from "react";
import { ExerciseTacticalBoard } from "../../components/exercise-tactical-board";
import { createFullCatalogAuditResult, type FullAuditSuccess } from "../../../lib/tactical-full-audit";
import type { Exercise, TacticalDiagram } from "../../../lib/types";
import baseline from "./tactical-final-9-baseline.json";
import styles from "./final-nine-remediation.module.css";

type BaselineRow={
  code:string;
  status:string;
  quality:number;
  real_collisions:number;
  review_reasons:string[];
  exercise_input:Exercise;
  diagram_snapshot:TacticalDiagram;
};

const diagnosis:Record<string,{rootCause:string;fix:string}>={
  "GK-MS-005":{rootCause:"DERIVED_BALL_CONNECTION · la respinta era letta come una nuova palla servita da un appoggio.",fix:"Collegata la seconda azione all’output della prima; rimossi appoggio e origine indipendente non richiesti."},
  "GK-MS-012":{rootCause:"DERIVED_BALL_CONNECTION · la respinta era letta come una nuova palla servita da un appoggio.",fix:"Collegata la seconda azione all’output della prima; rimossi appoggio e origine indipendente non richiesti."},
  "GK-MS-016":{rootCause:"DERIVED_BALL_CONNECTION · la respinta era letta come una nuova palla servita da un appoggio.",fix:"Collegata la seconda azione all’output della prima; rimossi appoggio e origine indipendente non richiesti."},
  "GK-MS-019":{rootCause:"DERIVED_BALL_CONNECTION · la respinta era letta come una nuova palla servita da un appoggio.",fix:"Collegata la seconda azione all’output della prima; rimossi appoggio e origine indipendente non richiesti."},
  "GK-MS-021":{rootCause:"DERIVED_BALL_CONNECTION + REAL_COLLISION · appoggio superfluo sovrapposto alla palla.",fix:"Usato il previous action output e rimosso l’appoggio indipendente, eliminando anche la collisione locale."},
  "GK-MS-029":{rootCause:"DERIVED_BALL_CONNECTION + REAL_COLLISION · appoggio superfluo sovrapposto alla palla.",fix:"Usato il previous action output e rimosso l’appoggio indipendente, eliminando anche la collisione locale."},
  "GK-MS-047":{rootCause:"DERIVED_BALL_CONNECTION + REAL_COLLISION · appoggio superfluo sovrapposto alla palla.",fix:"Usato il previous action output e rimosso l’appoggio indipendente, eliminando anche la collisione locale."},
  "GK-TLR-028":{rootCause:"MISSING_SECOND_BALL · una variante opzionale veniva interpretata come requisito del setup base.",fix:"Esclusa la variante dal requisito obbligatorio; mantenuti una palla, recupero e secondo stimolo."},
  "GK-TLR-040":{rootCause:"MISSING_SECOND_BALL + ACTION_CONNECTION · variante opzionale e transizione non esplicita.",fix:"Composta una catena a palla unica: passaggio, riallineamento, tiro finale e tuffo."},
};

function Metric({label,value}:{label:string;value:string|number}){return <span><small>{label}</small><b>{value}</b></span>;}

export function FinalNineRemediation(){
  const cases=useMemo(()=>((baseline as {rows:BaselineRow[]}).rows.map(row=>({row,after:createFullCatalogAuditResult(row.exercise_input)})).filter((item):item is {row:BaselineRow;after:FullAuditSuccess}=>item.after.kind==="SUCCESS")),[]);
  return <section className={styles.section}>
    <header><div><span>FINAL 9-CASE REMEDIATION</span><h2>Prima e dopo · stesso identico input</h2><p>Correzioni locali in memoria. Nessun dato salvato e nessun tactical_diagram modificato nel database.</p></div><strong>{cases.filter(item=>item.after.status==="VALID").length}/9 VALID</strong></header>
    <div className={styles.grid}>{cases.map(({row,after})=>{const info=diagnosis[row.code];return <article key={row.code} className={styles.case}>
      <div className={styles.title}><div><b>{row.code}</b><h3>{row.exercise_input.nome}</h3></div><span>{row.status.replaceAll("_"," ")} → {after.status.replaceAll("_"," ")}</span></div>
      <div className={styles.comparison}>
        <section><h4>CURRENT · BEFORE</h4><div className={styles.board}><ExerciseTacticalBoard diagram={row.diagram_snapshot} rendererVersion="v2-final"/></div><div className={styles.metrics}><Metric label="STATUS" value={row.status.replaceAll("_"," ")}/><Metric label="QUALITY" value={`${row.quality}/100`}/><Metric label="REAL COLLISIONS" value={row.real_collisions}/></div></section>
        <section><h4>FINAL · AFTER</h4><div className={styles.board}><ExerciseTacticalBoard diagram={after.audit.diagram} rendererVersion="v2-final"/></div><div className={styles.metrics}><Metric label="STATUS" value={after.status.replaceAll("_"," ")}/><Metric label="QUALITY" value={`${after.quality}/100`}/><Metric label="REAL COLLISIONS" value={after.collisions.filter(item=>item.category==="REAL_COLLISION").length}/></div></section>
      </div>
      <div className={styles.explanation}><p><b>ROOT CAUSE</b>{info.rootCause}</p><p><b>MINIMAL FIX</b>{info.fix}</p></div>
    </article>;})}</div>
  </section>;
}
