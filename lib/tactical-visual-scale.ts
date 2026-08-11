import type { TacticalElementType } from "./types.ts";

/** Scala illustrativa definitiva del renderer. Il JSON non viene modificato. */
export const TACTICAL_VISUAL_SCALE: Readonly<Record<TacticalElementType, number>> = Object.freeze({
  goalkeeper: .83,
  attacker: .83,
  player: .83,
  coach: .83,
  ball: .845,
  cone: .22,
  mannequin: .52,
  hurdle: .5,
  mini_goal: .74,
  goal: .78,
  marker: .5,
});

export const TACTICAL_MINIMUM_DISPLAY_SCALE: Readonly<Partial<Record<TacticalElementType, number>>> = Object.freeze({
  goalkeeper: .58,
  attacker: .58,
  player: .58,
  coach: .58,
  ball: .78,
  marker: .38,
});

export function resolveTacticalAssetScale(type:TacticalElementType,itemScale=1,compact=false){
  const scale=itemScale*TACTICAL_VISUAL_SCALE[type];
  return compact?Math.max(scale,TACTICAL_MINIMUM_DISPLAY_SCALE[type]??0):scale;
}
