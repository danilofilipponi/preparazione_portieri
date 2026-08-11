import { AuthGate } from "../../auth-gate";
import { TACTICAL_VISUAL_SCALE, TacticalAssetStage, TacticalAttacker, TacticalBall, TacticalCoach, TacticalCone, TacticalGoalkeeper, TacticalMannequin, TacticalMiniGoal } from "../../components/tactical-assets";

const referencePositions = {
  GK: "25px -840px", Attaccante: "-120px -840px", Preparatore: "-265px -840px", Pallone: "-403px -840px", Cono: "-525px -840px", Sagoma: "-650px -840px", Porticina: "-785px -840px",
};

const assets = [
  { name:"GK", node:<TacticalGoalkeeper showBadge/> },
  { name:"Attaccante", node:<TacticalAttacker showBadge/> },
  { name:"Preparatore", node:<TacticalCoach showBadge/> },
  { name:"Pallone", node:<TacticalBall/> },
  { name:"Cono", node:<TacticalCone/> },
  { name:"Sagoma", node:<TacticalMannequin/> },
  { name:"Porticina", node:<TacticalMiniGoal/> },
] as const;

function ReferenceCrop({ name }:{name:keyof typeof referencePositions}){
  return <div className="asset-reference-crop" role="img" aria-label={`Riferimento ${name}`} style={{backgroundImage:"url('/tactical-board-reference.png')",backgroundPosition:referencePositions[name]}}/>;
}

function ProportionTest(){return <section className="proportion-test"><h2>PROPORTION TEST</h2><p>Asset alla stessa profondità e con la scala realmente utilizzata dal renderer.</p><svg viewBox="0 0 120 54" role="img" aria-label="Test proporzioni globali degli asset tattici"><rect width="120" height="54" rx="3" fill="#4b9631"/><g fill="none" stroke="#f7faf7" strokeWidth=".8"><path d="M40 20V5H80V20"/><path d="M40 20 37 23H83L80 20"/><g opacity=".65" strokeWidth=".3">{[45,50,55,60,65,70,75].map(x=><line key={x} x1={x} y1="5" x2={x} y2="21"/>)}{[9,13,17].map(y=><line key={y} x1="40" y1={y} x2="80" y2={y}/>)}</g></g><g transform={`translate(18 34) scale(${TACTICAL_VISUAL_SCALE.goalkeeper})`}><TacticalGoalkeeper showBadge/></g><g transform={`translate(34 34) scale(${TACTICAL_VISUAL_SCALE.attacker})`}><TacticalAttacker showBadge/></g><g transform={`translate(49 34) scale(${TACTICAL_VISUAL_SCALE.coach})`}><TacticalCoach showBadge/></g><g transform={`translate(62 34) scale(${TACTICAL_VISUAL_SCALE.ball})`}><TacticalBall/></g><g transform={`translate(72 34) scale(${TACTICAL_VISUAL_SCALE.cone})`}><TacticalCone/></g><g transform={`translate(84 34) scale(${TACTICAL_VISUAL_SCALE.mannequin})`}><TacticalMannequin/></g><g transform={`translate(105 34) scale(${TACTICAL_VISUAL_SCALE.mini_goal})`}><TacticalMiniGoal/></g></svg></section>;}

function TacticalAssetsPage(){return <main className="tactical-assets-page"><header><span className="eyebrow">Development preview</span><h1>Tactical Assets</h1><p>Confronto diretto con la legenda approvata. Questa pagina non modifica dati o schemi.</p></header><section className="asset-reference-full"><h2>Riferimento completo</h2><img src="/tactical-board-reference.png" alt="Immagine di riferimento definitiva della Tactical Board"/></section><section className="asset-comparison-grid" aria-label="Confronto asset">{assets.map(asset=><article key={asset.name}><h2>{asset.name}</h2><div className="asset-side-by-side"><div><strong>REFERENCE</strong><ReferenceCrop name={asset.name}/></div><div><strong>SVG IMPLEMENTATION</strong><TacticalAssetStage scale={1.55}>{asset.node}</TacticalAssetStage></div></div></article>)}</section><ProportionTest/></main>;}

export default function Page(){return <AuthGate><TacticalAssetsPage/></AuthGate>;}
