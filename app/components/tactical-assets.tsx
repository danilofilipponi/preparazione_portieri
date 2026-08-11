"use client";

import type { ReactNode } from "react";
import type { TacticalElementType } from "../../lib/types";

/** Configurazione definitiva e immutabile degli asset V2 Asset Final. */
export const TACTICAL_VISUAL_SCALE: Readonly<Record<TacticalElementType, number>> = Object.freeze({
  goalkeeper: .83,
  attacker: .83,
  player: .83,
  coach: .83,
  ball: .38,
  cone: .22,
  mannequin: .52,
  hurdle: .5,
  mini_goal: .74,
  goal: .78,
  marker: .5,
});

/** Soglia applicata nelle preview compatte, dove gli asset piccoli perderebbero leggibilita. */
export const TACTICAL_MINIMUM_DISPLAY_SCALE: Readonly<Partial<Record<TacticalElementType, number>>> = Object.freeze({
  goalkeeper: .58,
  attacker: .58,
  player: .58,
  coach: .58,
  ball: .31,
});

export function resolveTacticalAssetScale(type:TacticalElementType,itemScale=1,compact=false){
  const scale=itemScale*TACTICAL_VISUAL_SCALE[type];
  return compact?Math.max(scale,TACTICAL_MINIMUM_DISPLAY_SCALE[type]??0):scale;
}

type PersonProps = { badge?: string; showBadge?: boolean };

function RoleBadge({ value }: { value: string }) {
  const width=Math.max(7.6,value.length*2.55+3.8);
  return <g transform="translate(0 9.15)"><rect x={-width/2} y="-2.55" width={width} height="5.1" rx="1.65" fill="#08120c" stroke="#fff" strokeWidth=".5"/><text y="1.12" textAnchor="middle" fontSize="3.05" fontWeight="900" fill="#fff">{value}</text></g>;
}

function ReferencePerson({ color, highlight, badge, showBadge=false, goalkeeper=false, className }: PersonProps & { color:string; highlight:string; goalkeeper?:boolean; className:string }) {
  const arms=goalkeeper?"M-2.65-2.35-6.45.25M2.65-2.35 6.45.25":"M-2.65-2.2-5.2 1.5M2.65-2.2 5.2 1.5";
  const legs="M-1.55 3.75-3.25 7.65M1.55 3.75 3.25 7.65";
  return <g className={className}>
    <ellipse cy="7.55" rx={goalkeeper?5.4:4.7} ry="1.15" fill="#06140b" opacity=".21"/>
    <circle cy="-5.7" r="1.9" fill="#d9a77e" stroke="#f6fbf7" strokeWidth=".48"/>
    <path d="M-3.05-3.45Q0-4.2 3.05-3.45L2.65 3.8Q0 5.05-2.65 3.8Z" fill={color} stroke="#f6fbf7" strokeWidth=".5"/>
    <path d={arms} fill="none" stroke="#f6fbf7" strokeWidth={goalkeeper?2.65:2.4} strokeLinecap="round" opacity=".92"/>
    <path d={arms} fill="none" stroke={color} strokeWidth={goalkeeper?2.05:1.82} strokeLinecap="round"/>
    <path d={legs} fill="none" stroke="#f6fbf7" strokeWidth="2.55" strokeLinecap="round" opacity=".92"/>
    <path d={legs} fill="none" stroke={color} strokeWidth="1.95" strokeLinecap="round"/>
    <path d="M-2.05-2.75Q0-3.35 2.05-2.75" fill="none" stroke={highlight} strokeWidth=".62" opacity=".95"/>
    {goalkeeper&&<><circle cx="-6.55" cy=".35" r=".82" fill="#fff" stroke="#183b29" strokeWidth=".3"/><circle cx="6.55" cy=".35" r=".82" fill="#fff" stroke="#183b29" strokeWidth=".3"/></>}
    <path d="M-3.65 7.75H-2.75M2.75 7.75H3.65" stroke="#17211c" strokeWidth=".85" strokeLinecap="round"/>
    {showBadge&&badge&&<RoleBadge value={badge}/>} 
  </g>;
}

export function TacticalGoalkeeper(props:PersonProps){return <ReferencePerson {...props} badge={props.badge??"GK"} color="#08723b" highlight="#72c947" goalkeeper className="reference-goalkeeper"/>;}
export function TacticalAttacker(props:PersonProps){return <ReferencePerson {...props} badge={props.badge??"A"} color="#f47a12" highlight="#ffc158" className="reference-attacker"/>;}
export function TacticalCoach(props:PersonProps){return <ReferencePerson {...props} badge={props.badge??"C"} color="#0969aa" highlight="#54a9df" className="reference-coach"/>;}
export function TacticalPlayer(props:PersonProps){return <ReferencePerson {...props} badge={props.badge??"P"} color="#e7ece8" highlight="#fff" className="reference-player"/>;}

export function TacticalBall(){return <g className="reference-ball"><ellipse cy="2.9" rx="3" ry=".7" fill="#07150c" opacity=".24"/><circle r="2.65" fill="#f9faf8" stroke="#17211c" strokeWidth=".62"/><path d="M0-1.15 1.15-.35.72 1.05H-.72L-1.15-.35Z" fill="#17211c"/><path d="M0-1.15V-2.35M1.15-.35 2.2-1M.72 1.05 1.5 2.05M-.72 1.05-1.5 2.05M-1.15-.35-2.2-1" stroke="#17211c" strokeWidth=".45"/></g>;}
export function TacticalCone(){return <g className="reference-cone"><ellipse cy="4" rx="4" ry=".85" fill="#07150c" opacity=".24"/><path d="M0-5.1 3.1 2.4H-3.1Z" fill="#ff8b13" stroke="#813407" strokeWidth=".65"/><path d="M-4 2.3H4L3.5 4H-3.5Z" fill="#f36a08" stroke="#813407" strokeWidth=".65"/><path d="M-1.45-1.2H1.45" stroke="#ffd59a" strokeWidth=".68"/></g>;}
export function TacticalMannequin(){return <g className="reference-mannequin" fill="#f3bd16" stroke="#765804" strokeWidth=".62"><ellipse cy="8.2" rx="4" ry=".75" fill="#07150c" stroke="none" opacity=".2"/><circle cy="-5.4" r="1.85"/><path d="M-2.65-3.2H2.65L2.1 3.8H-2.1Z"/><path d="M-3.1-1.5V4M3.1-1.5V4M-1.5 3.8-2.6 7.4M1.5 3.8 2.6 7.4M-3.8 7.4H3.8" fill="none" strokeWidth="1"/></g>;}
export function TacticalMiniGoal({ compact=false, large=false }:{compact?:boolean;large?:boolean}){const width=large?14:11,height=large?7:5.5;return <g className="reference-mini-goal" fill="none" strokeLinejoin="round"><ellipse cy={height/2+1} rx={width/2+1} ry=".65" fill="#07150c" stroke="none" opacity=".2"/><path d={`M${-width/2} ${height/2}V${-height/2}H${width/2}V${height/2}`} stroke="#f8faf8" strokeWidth="1.15"/><path d={`M${-width/2} ${height/2} ${-width/2-1.2} ${height/2+1.4}H${width/2+1.2}L${width/2} ${height/2}`} stroke="#aebbb3" strokeWidth=".65"/>{!compact&&<g stroke="#cbd4ce" strokeWidth=".28"><path d={`M${-width/4} ${-height/2}V${height/2+1}M0 ${-height/2}V${height/2+1}M${width/4} ${-height/2}V${height/2+1}`}/><path d={`M${-width/2} 0H${width/2}M${-width/2} ${height/4}H${width/2}`}/></g>}</g>;}

export function TacticalAssetStage({ children, scale=1 }: { children:ReactNode; scale?:number }){
  return <svg viewBox="-15 -14 30 30" role="img" aria-label="Anteprima asset tattico"><rect x="-15" y="-14" width="30" height="30" rx="2" fill="#4a9631"/><g transform={`scale(${scale})`}>{children}</g></svg>;
}
