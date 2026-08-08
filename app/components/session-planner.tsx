"use client";

import type { EditableGeneratedSession, Exercise, ExerciseCategory, GenerationMode, Goalkeeper, PhysicalAssessmentDimension, PriorityRankingItem, SessionBlock, SessionProfile, SessionQualityResult, TrainingExerciseVariant } from "../../lib/types";
import { GoalkeeperPresencePicker } from "./goalkeeper-presence-picker";
import { PriorityRankingPanel } from "./priority-ranking-panel";
import { SessionBlocksEditor } from "./session-blocks-editor";
import { SessionExercisePreview } from "./session-exercise-preview";

type Props = {
  editing: boolean; date: string; duration: number; keepers: number; mode: GenerationMode; seasonPhase:string;
  profile: SessionProfile | null; goalkeepers: Goalkeeper[]; selectedGoalkeeperIds: string[];
  categories: ExerciseCategory[]; physicalDimensions: PhysicalAssessmentDimension[];
  technicalRanking: PriorityRankingItem[]; physicalRanking: PriorityRankingItem[];
  technicalFocusId: number | null; technicalSecondaryFocusId: number | null; physicalFocusId: string | null; blocks: SessionBlock[]; generatedExercises: EditableGeneratedSession | null; quality:SessionQualityResult|null; confirmed:boolean;
  onDate: (value: string) => void; onDuration: (value: number) => void; onKeepers: (value: number) => void; onMode: (value: GenerationMode) => void;
  onGoalkeepers: (value: string[]) => void; onTechnicalFocus: (value: number) => void; onTechnicalSecondaryFocus: (value: number | null) => void; onPhysicalFocus: (value: string) => void; onBlocks: (value: SessionBlock[]) => void;
  onGenerate: () => void; onGenerateExercises: () => void; onSave: () => void; onOpenExercise:(exercise:Exercise,plannedDuration:number,variants:TrainingExerciseVariant[])=>void;onToggleLock:(id:string)=>void;onExerciseDuration:(id:string,n:number)=>void;onRemove:(id:string)=>void;onReplace:(id:string)=>void;onVariants:(id:string)=>void;onMove:(id:string,d:-1|1)=>void;onRegenerateBlock:(n:number)=>void;onRegenerateSession:()=>void;onRecalculateAll:()=>void;onAdd:(n:number)=>void;onConfirm:()=>void;
};

export function SessionPlanner(props: Props) {
  const previewComplete = Boolean(props.generatedExercises) && props.blocks.every(block => props.generatedExercises!.selections.some(item => item.block_order === block.ordine));
  const technicalPrimary=props.categories.find(item=>item.id===props.technicalFocusId)?.nome??"Non specificato";
  const technicalSecondary=props.categories.find(item=>item.id===props.technicalSecondaryFocusId)?.nome??null;
  const physicalPrimary=props.physicalDimensions.find(item=>item.id===props.physicalFocusId)?.nome??"Non specificato";
  const selectedGoalkeepers=props.goalkeepers.filter(item=>props.selectedGoalkeeperIds.includes(item.id));
  const goalkeeperName=(id:string)=>{const item=props.goalkeepers.find(goalkeeper=>goalkeeper.id===id);return item?`${item.nome} ${item.cognome}`:"Portiere";};
  return <><div className="page-head"><div><div className="eyebrow">Pianificazione metodologica</div><h1>{props.editing ? "Modifica seduta" : "Crea allenamento"}</h1><p className="subtitle">Definisci il profilo e il gruppo: l’app propone focus e blocchi, non gli esercizi.</p></div></div>
    <div className="session-planner">
      <section className="planner-section"><div className="planner-section-head"><div><span>1</span><h2>Profilo della seduta</h2></div>{props.profile && <b className="profile-code">{props.profile.code}</b>}</div>
        <div className="planner-form-grid"><label>Data<input type="date" value={props.date} onChange={event => props.onDate(event.target.value)} /></label><label>Durata<select value={props.duration} onChange={event => props.onDuration(Number(event.target.value))}>{[45,60,65,70,75,80,90].map(value => <option key={value}>{value}</option>)}</select></label><label>Portieri previsti<select value={props.keepers} onChange={event => props.onKeepers(Number(event.target.value))}>{[1,2,3,4,5,6].map(value => <option key={value}>{value}</option>)}</select></label><label>Modalità<select value={props.mode} onChange={event => props.onMode(event.target.value as GenerationMode)}><option>Automatico</option><option>Assistito</option><option>Manuale</option></select></label></div>
        {props.profile && <div className="profile-summary"><div><small>Profilo</small><strong>{props.profile.label}</strong></div><div><small>Carico</small><strong>{props.profile.load}</strong></div><div><small>Riferimento gara</small><strong>{props.profile.match_day_offset === null ? "Non disponibile" : props.profile.code}</strong></div><div><small>Richiamo</small><strong>{props.profile.athletic_recall ? "Sì" : "No"}</strong></div></div>}
      </section>
      <GoalkeeperPresencePicker goalkeepers={props.goalkeepers} selectedIds={props.selectedGoalkeeperIds} onChange={props.onGoalkeepers} />
      <div className="planner-generate-row"><p>Il calcolo considera carenze di gruppo, storico, rotazione, stagione e distanza dalla gara.</p><button className="primary" onClick={props.onGenerate}>Calcola priorità e blocchi</button></div>
      <div className="ranking-grid"><PriorityRankingPanel eyebrow="3 · Area tecnica" title="Ranking tecnico" ranking={props.technicalRanking} selectedId={props.technicalFocusId === null ? null : String(props.technicalFocusId)} onSelect={id => props.onTechnicalFocus(Number(id))} /><PriorityRankingPanel eyebrow="4 · Area fisica" title="Ranking fisico" ranking={props.physicalRanking} selectedId={props.physicalFocusId} onSelect={props.onPhysicalFocus} accent="physical" /></div>
      {props.technicalRanking.length > 1 && <section className="secondary-focus"><label>Focus tecnico secondario<select value={props.technicalSecondaryFocusId ?? ""} onChange={event => props.onTechnicalSecondaryFocus(event.target.value ? Number(event.target.value) : null)}><option value="">Nessuno</option>{props.technicalRanking.filter(item => Number(item.id) !== props.technicalFocusId).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p>Usato come contenuto complementare nei blocchi C e D.</p></section>}
      <SessionBlocksEditor blocks={props.blocks} duration={props.duration} onChange={props.onBlocks} />
      <div className="planner-exercise-action"><div><strong>Componi la seduta dal catalogo reale</strong><small>Scelta deterministica, senza duplicati e con rotazione controllata.</small></div><button className="primary" disabled={props.blocks.length !== 4} onClick={props.onGenerateExercises}>Genera esercizi</button></div>
      <SessionExercisePreview result={props.generatedExercises} blocks={props.blocks} quality={props.quality} confirmed={props.confirmed} date={props.date} duration={props.duration} keepers={props.keepers} matchDay={props.profile?.code??"MD"} seasonPhase={props.seasonPhase} load={props.profile?.load??"Non specificato"} technicalPrimary={technicalPrimary} technicalSecondary={technicalSecondary} physicalPrimary={physicalPrimary} goalkeeperNames={selectedGoalkeepers.map(item=>`${item.nome} ${item.cognome}`)} goalkeeperName={goalkeeperName} blockTechnicalName={id=>props.categories.find(item=>item.id===id)?.nome??null} blockPhysicalName={id=>props.physicalDimensions.find(item=>item.id===id)?.nome??null} onOpenExercise={props.onOpenExercise} onToggleLock={props.onToggleLock} onDuration={props.onExerciseDuration} onRemove={props.onRemove} onReplace={props.onReplace} onVariants={props.onVariants} onMove={props.onMove} onRegenerateBlock={props.onRegenerateBlock} onRegenerateSession={props.onRegenerateSession} onRecalculateAll={props.onRecalculateAll} onAdd={props.onAdd} onConfirm={props.onConfirm}/>
      <div className="planner-save-row"><span>{previewComplete ? "La preview è pronta per il salvataggio." : props.generatedExercises ? "Completa tutti i blocchi prima del salvataggio." : "Genera prima gli esercizi della seduta."}</span><button className="primary" disabled={!previewComplete || props.blocks.length !== 4} onClick={props.onSave}>{props.editing ? "Aggiorna seduta" : "Salva in agenda"}</button></div>
    </div>
  </>;
}
