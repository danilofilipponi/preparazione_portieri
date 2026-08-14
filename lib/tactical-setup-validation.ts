import type { DiagramSource, Exercise, TacticalDiagram, TacticalDiagramAction, TacticalDiagramElement, TacticalElementType } from "./types";
import { refineEquipmentLayout, type TacticalEquipmentLayoutResult } from "./tactical-equipment-layout.ts";

export type TacticalSetupValidationStatus = "VALID" | "VALID_WITH_WARNINGS" | "NEEDS_REVIEW";
export type TacticalSetupRelation = "cone_gate" | "cone_square" | "cone_diamond" | "corridor" | "start_cone" | "recovery_cone" | "marker_zone" | "slalom" | "mini_goal_target" | "lateral_targets" | "mannequin_gate" | "mannequin_screen" | "hurdle_sequence" | "ball_owner" | "second_ball_source" | "derived_second_ball" | "presence";

export type TacticalSetupRequirement = { type:TacticalElementType; count:number; essential:boolean; relation:TacticalSetupRelation; reason:string };
export type TacticalRelationValidation = { relation:TacticalSetupRelation; type:TacticalElementType; expected:string; generated:string; valid:boolean };
export type TacticalEquipmentInventory = { type:TacticalElementType; declared:number; required:number; optional:number; rendered:number };
export type TacticalSetupValidation = {
  status:TacticalSetupValidationStatus;
  diagram:TacticalDiagram;
  relevantData:string[];
  expectedElements:TacticalSetupRequirement[];
  declaredElements:Partial<Record<TacticalElementType,number>>;
  generatedElements:Partial<Record<TacticalElementType,number>>;
  equipmentInventory:TacticalEquipmentInventory[];
  expectedRelations:string[];
  generatedRelations:string[];
  elementValidation:{valid:boolean;issues:string[]};
  relationValidation:{valid:boolean;issues:string[];checks:TacticalRelationValidation[]};
  layoutValidation:TacticalEquipmentLayoutResult["validation"];
  layoutDensity:TacticalEquipmentLayoutResult["density"];
  layoutZones:TacticalEquipmentLayoutResult["zones"];
  layoutAdjustments:string[];
  issues:string[];
  warnings:string[];
  infos:string[];
  repairs:string[];
};

type ValidationOptions={autoRepair?:boolean;source?:DiagramSource|null;refineLayout?:boolean};
type Point={x:number;y:number};
const humans=new Set<TacticalElementType>(["goalkeeper","coach","attacker","player"]);
const numberWords:Record<string,number>={un:1,uno:1,una:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8,nove:9,dieci:10};
const countToken="10|[1-9]|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci";
const declaredCountToken="[1-9][0-9]?|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci";

function normalize(value:string|null|undefined){return(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g," ").replace(/\s+/g," ").trim();}
function relevantData(exercise:Exercise){return[exercise.nome,exercise.categoria,exercise.sottocategoria,exercise.obiettivo,exercise.descrizione,exercise.variante,exercise.schema_step_1,exercise.schema_step_2,exercise.schema_step_3,exercise.schema_step_4,exercise.schema_step_5,exercise.schema_step_6,exercise.scenario_gara].filter((value):value is string=>Boolean(value?.trim()));}
function setupText(exercise:Exercise){const values=relevantData(exercise),ignoreOptionalVariant=exercise.codice==="GK-TLR-028"||exercise.codice==="GK-TLR-040";return normalize(values.filter(value=>!ignoreOptionalVariant||value!==exercise.variante).join(". "));}
function asCount(value:string|undefined,fallback:number){if(!value)return fallback;if(/^\d+$/.test(value))return Math.max(1,Math.min(10,Number(value)));return numberWords[value]??fallback;}
function asDeclaredCount(value:string|undefined,fallback:number){if(!value)return fallback;if(/^\d+$/.test(value))return Math.max(1,Math.min(99,Number(value)));return numberWords[value]??fallback;}
function mentionedCount(text:string,nouns:string,fallback=1){const match=text.match(new RegExp(`(?:^|\\s)(${countToken})\\s+(?:${nouns})\\b`));return asCount(match?.[1],fallback);}
function addRequirement(output:TacticalSetupRequirement[],item:TacticalSetupRequirement){const current=output.find(value=>value.type===item.type&&value.relation===item.relation);if(current){current.count=Math.max(current.count,item.count);current.essential=current.essential||item.essential;if(item.essential)current.reason=item.reason;}else output.push(item);}

const declaredEquipmentPatterns:ReadonlyArray<[TacticalElementType,string,string]>=Object.freeze([
  ["ball","palloni?|palle","Palloni"],
  ["cone","coni?","Coni"],
  ["marker","cinesini?|delimitatori?|markers?|dischi?","Cinesini"],
  ["mini_goal","porticin[ae]|mini port[ae]|mini goals?","Porticine"],
  ["mannequin","sagome?|mannequins?","Sagome"],
  ["hurdle","ostacoli?|ostacolini?|hurdles?","Ostacoli"],
]);

export function extractDeclaredTacticalEquipment(exercise:Exercise){
  const material=normalize(exercise.materiale),declared:Partial<Record<TacticalElementType,number>>={};
  for(const [type,nouns] of declaredEquipmentPatterns){
    const matches=[...material.matchAll(new RegExp(`(?:(${declaredCountToken})\\s*(?:(?:-|\\u2013|\\u2014)\\s*(?:${declaredCountToken}))?\\s+)?(?:${nouns})\\b`,"g"))];
    if(!matches.length)continue;
    declared[type]=matches.reduce((sum,match)=>sum+asDeclaredCount(match[1],1),0);
  }
  return declared;
}

function equipmentInventory(exercise:Exercise,requirements:TacticalSetupRequirement[],diagram:TacticalDiagram):TacticalEquipmentInventory[]{
  const declared=extractDeclaredTacticalEquipment(exercise),rendered=counts(diagram),types=new Set<TacticalElementType>([...Object.keys(declared) as TacticalElementType[],...requirements.map(item=>item.type),...Object.keys(rendered) as TacticalElementType[]]);
  return [...types].filter(type=>declared[type]||requirements.some(item=>item.type===type)).map(type=>{
    const required=Math.max(0,...requirements.filter(item=>item.type===type&&item.essential).map(item=>item.count)),declaredCount=declared[type]??0;
    return{type,declared:declaredCount,required,optional:Math.max(0,declaredCount-required),rendered:rendered[type]??0};
  });
}

function inventoryInfos(inventory:TacticalEquipmentInventory[]){
  const labels=new Map(declaredEquipmentPatterns.map(([type,,label])=>[type,label]));
  return inventory.flatMap(item=>{
    if(item.declared<=item.required)return[];
    const label=labels.get(item.type)??item.type;
    return[item.required>0?`${label}: ${item.declared} dichiarati, ${item.required} semanticamente necessari; ${item.optional} di scorta/non funzionali`:`${label}: ${item.declared} dichiarati ma non richiesti dallo svolgimento`];
  });
}

export function extractTacticalSetupRequirements(exercise:Exercise):TacticalSetupRequirement[]{
  const text=setupText(exercise),output:TacticalSetupRequirement[]=[];
  const essential=(type:TacticalElementType,count:number,relation:TacticalSetupRelation,reason:string)=>addRequirement(output,{type,count,relation,reason,essential:true});

  if(/quadrato (?:di |con )?(?:4|quattro) (?:coni|cinesini|marker)/.test(text)){const marker=/cinesini|marker/.test(text.match(/quadrato[^.]+/)?.[0]??"");essential(marker?"marker":"cone",4,marker?"marker_zone":"cone_square","Quattro riferimenti formano un quadrato");}
  if(/rombo (?:di |con )?(?:4|quattro)? ?(?:coni|cinesini|marker)/.test(text)){const marker=/cinesini|marker/.test(text.match(/rombo[^.]+/)?.[0]??"");essential(marker?"marker":"cone",4,marker?"marker_zone":"cone_diamond","Quattro riferimenti formano un rombo");}
  if(/corridoio[^.]{0,35}(?:coni|cinesini|delimitatori|marker)|(?:coni|cinesini|delimitatori|marker)[^.]{0,35}corridoio/.test(text)){const marker=/cinesini|delimitatori|marker/.test(text.match(/[^.]*corridoio[^.]*/)?.[0]??"");essential(marker?"marker":"cone",Math.max(4,mentionedCount(text,marker?"cinesini|delimitatori|marker":"coni",4)),"corridor","Due file laterali delimitano il corridoio");}
  if(/tra (?:i )?(?:due|2) coni|porta di coni/.test(text))essential("cone",2,"cone_gate","Due coni formano un varco attraversabile");
  const delimited=text.match(new RegExp(`(${countToken}) coni[^.]{0,45}(?:delimita|zona|partenza|arrivo)`));if(delimited&&!output.some(item=>item.type==="cone"))essential("cone",asCount(delimited[1],2),"cone_gate","I coni delimitano una zona tecnica");
  if(/cono (?:di |della )?partenza/.test(text))essential("cone",1,"start_cone","Un cono identifica la partenza");
  if(/cono (?:di |del )?recupero/.test(text))essential("cone",1,"recovery_cone","Un cono identifica la destinazione del recupero");

  const slalom=text.match(new RegExp(`slalom[^.]{0,35}(?:(${countToken}) )?(?:cinesini|delimitatori|marker|dischi)`));if(slalom)essential("marker",asCount(slalom[1],mentionedCount(text,"cinesini|delimitatori|marker|dischi",4)),"slalom","I cinesini definiscono un percorso alternato");
  if(/(?:zona|area)[^.]{0,30}(?:delimitata|segnata)[^.]{0,20}(?:cinesini|delimitatori|marker)/.test(text))essential("marker",Math.max(4,mentionedCount(text,"cinesini|delimitatori|marker",4)),"marker_zone","I marker delimitano una zona");

  if(/(?:due|2) porticine[^.]{0,35}laterali|(?:scelta|sceglie)[^.]{0,30}(?:due|2) porticine/.test(text))essential("mini_goal",2,"lateral_targets","Due porticine costituiscono target laterali distinti");
  else if(/(?:passaggio|passa|passare|tiro|conclusione)[^.]{0,45}(?:in|nella|verso) (?:una )?(?:porticina|mini porta|mini goal)/.test(text))essential("mini_goal",1,"mini_goal_target","La porticina è il target dell'action");

  if(/(?:passaggio|palla)[^.]{0,25}tra (?:due|2) (?:sagome|mannequin)/.test(text))essential("mannequin",2,"mannequin_gate","Le sagome formano un varco attraversato dalla palla");
  if(/(?:tiro|conclusione)[^.]{0,25}(?:dietro|oltre) (?:la )?(?:sagoma|mannequin)/.test(text))essential("mannequin",1,"mannequin_screen","La sagoma è posta sulla linea di tiro");

  const hurdles=text.match(new RegExp(`(?:supera|oltrepassa|salta)[^.]{0,18}(${countToken}) (?:ostacoli|ostacolini|hurdles?)`));if(hurdles)essential("hurdle",asCount(hurdles[1],1),"hurdle_sequence","Gli ostacoli sono una sequenza del percorso");
  if(exercise.codice!=="GK-TL-019"&&!/posizionament/.test(text)&&/(?:gk|portiere|preparatore|tiratore|servitore|appoggio|compagno|giocatore|attaccante)[^.]{0,70}(?:palla|pallone|passaggio|passa|tira|tiro|conclude|conclusione|cross)/.test(text))essential("ball",1,"ball_owner","La palla attiva deve essere associata alla propria origine");
  const explicitMultiBall=/(?:seconda palla|secondo pallone|due palloni attivi|multi[- ]?ball|palla vagante|seconda origine)/.test(text)
    || /(?:deviazione|primo intervento)[^.]{0,100}(?:secondo|altro) (?:giocatore|servitore|preparatore|tiratore)/.test(text)
    || /(?:seconda azione|secondo servizio)[^.]{0,100}nuova origine/.test(text);
  if(explicitMultiBall){
    const derived=/(?:respint|rebound|rimbalz|ribattut|palla vagante|palla sporca|deviazione corta|palla libera dopo|seconda azione sulla stessa palla|corner in traffico[^.]{0,100}seconda palla)/.test(text);
    essential("ball",derived?1:2,derived?"derived_second_ball":"second_ball_source",derived?"La seconda fase deriva dalla prima palla":"Le due fasi richiedono origini di palla distinte");
  }
  return output;
}

function clone(diagram:TacticalDiagram):TacticalDiagram{return{...diagram,canvas:{...diagram.canvas},elements:diagram.elements.map(item=>({...item})),actions:diagram.actions.map(item=>({...item}))};}
function counts(diagram:TacticalDiagram){const result:Partial<Record<TacticalElementType,number>>={};for(const item of diagram.elements)result[item.type]=(result[item.type]??0)+1;return result;}
function nextId(diagram:TacticalDiagram,prefix:string){let index=1;while(diagram.elements.some(item=>item.id===`validation-${prefix}-${index}`)||diagram.actions.some(item=>item.id===`validation-${prefix}-${index}`))index+=1;return`validation-${prefix}-${index}`;}
function newElement(diagram:TacticalDiagram,type:TacticalElementType,point:Point,role:string):TacticalDiagramElement{return{id:nextId(diagram,type),type,x:point.x,y:point.y,rotation:0,scale:1,role};}
function ensure(diagram:TacticalDiagram,type:TacticalElementType,count:number,positions:Point[],role:string){const items=diagram.elements.filter(item=>item.type===type);for(let index=items.length;index<count;index+=1)diagram.elements.push(newElement(diagram,type,positions[index]??positions.at(-1)??{x:50,y:50},role));return diagram.elements.filter(item=>item.type===type).slice(0,count);}
function actors(diagram:TacticalDiagram){return diagram.elements.filter(item=>humans.has(item.type));}
function goalkeeper(diagram:TacticalDiagram){return diagram.elements.find(item=>item.type==="goalkeeper");}
function actorByRole(diagram:TacticalDiagram,pattern:RegExp){return actors(diagram).find(item=>pattern.test(item.role??""));}
function foot(owner:TacticalDiagramElement):Point{return{x:Math.max(7,Math.min(93,owner.x+(owner.x<50?4:-4))),y:Math.max(7,Math.min(93,owner.y+6))};}
function firstTechnicalAction(diagram:TacticalDiagram){return diagram.actions.find(item=>["passaggio","tiro","cross","conduzione"].includes(item.type));}
function lastTechnicalAction(diagram:TacticalDiagram){return diagram.actions.filter(item=>["passaggio","tiro","cross","conduzione"].includes(item.type)).at(-1);}
function actionOwner(diagram:TacticalDiagram,action:TacticalDiagramAction|undefined){if(!action)return undefined;const direct=diagram.elements.find(item=>item.id===action.fromElementId&&humans.has(item.type));if(direct)return direct;return actors(diagram).sort((a,b)=>Math.hypot(a.x-action.startX,a.y-action.startY)-Math.hypot(b.x-action.startX,b.y-action.startY))[0];}
function pointOnSegment(point:Point,start:Point,end:Point){const dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy;if(!length)return Math.hypot(point.x-start.x,point.y-start.y);const t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/length));return Math.hypot(point.x-(start.x+t*dx),point.y-(start.y+t*dy));}
function addPathActions(diagram:TacticalDiagram,start:Point,points:Point[],fromId?:string){if(!points.length)return;diagram.actions.forEach(item=>item.sequence+=points.length);let previous=start;points.forEach((point,index)=>{diagram.actions.push({id:nextId(diagram,"path"),type:"corsa",fromElementId:index===0?fromId:undefined,startX:previous.x,startY:previous.y,endX:point.x,endY:point.y,sequence:index+1,style:"dashed",label:"Percorso"});previous=point;});}
function symmetricPoints(center:Point,count:number,gap=12){return Array.from({length:count},(_,index)=>({x:center.x+(index-(count-1)/2)*gap,y:center.y+4}));}

function repair(exercise:Exercise,diagram:TacticalDiagram,requirement:TacticalSetupRequirement,repairs:string[]){
  const text=setupText(exercise),gk=goalkeeper(diagram),start=/gk|portiere/.test(text.match(/[^.]*(?:partenza|parte)[^.]*/)?.[0]??"")&&gk?gk:actorByRole(diagram,/tiratore|servitore|attaccante|appoggio/)??gk??actors(diagram)[0];
  if(requirement.relation==="cone_gate"){const center=start??{x:50,y:65},items=ensure(diagram,"cone",requirement.count,symmetricPoints(center,requirement.count),"Varco funzionale");items.forEach((item,index)=>Object.assign(item,symmetricPoints(center,requirement.count)[index]));repairs.push("Varco di coni centrato sulla posizione funzionale");return;}
  if(requirement.relation==="cone_square"||requirement.relation==="marker_zone"){const type=requirement.type,points=[{x:38,y:48},{x:62,y:48},{x:38,y:68},{x:62,y:68}],items=ensure(diagram,type,4,points,"Zona delimitata");items.forEach((item,index)=>Object.assign(item,points[index]));repairs.push("Zona a quattro vertici costruita");return;}
  if(requirement.relation==="cone_diamond"){const points=[{x:50,y:42},{x:64,y:56},{x:50,y:70},{x:36,y:56}],items=ensure(diagram,"cone",4,points,"Rombo");items.forEach((item,index)=>Object.assign(item,points[index]));repairs.push("Rombo di coni costruito");return;}
  if(requirement.relation==="corridor"){const type=requirement.type,half=Math.ceil(requirement.count/2),points=Array.from({length:requirement.count},(_,index)=>({x:index<half?40:60,y:35+(index%half)*13})),items=ensure(diagram,type,requirement.count,points,"Corridoio");items.forEach((item,index)=>Object.assign(item,points[index]));repairs.push("Due file laterali del corridoio costruite");return;}
  if(requirement.relation==="start_cone"){const owner=start??{x:50,y:65},point={x:owner.x-7,y:owner.y+4};Object.assign(ensure(diagram,"cone",1,[point],"Partenza")[0],point);repairs.push("Cono di partenza collegato alla posizione iniziale");return;}
  if(requirement.relation==="recovery_cone"){const recovery=diagram.actions.find(item=>item.type==="recupero"),point=recovery?{x:recovery.endX,y:recovery.endY}:{x:50,y:61};Object.assign(ensure(diagram,"cone",1,[point],"Recupero")[0],point);repairs.push("Cono collocato sulla destinazione del recupero");return;}
  if(requirement.relation==="slalom"){const owner=gk??start,origin=owner??{x:50,y:72},points=Array.from({length:requirement.count},(_,index)=>({x:origin.x+(index%2?-8:8),y:origin.y-(index+1)*Math.max(6,(origin.y-28)/(requirement.count+1))})),items=ensure(diagram,"marker",requirement.count,points,"Cinesino slalom");items.forEach((item,index)=>Object.assign(item,points[index]));addPathActions(diagram,{x:origin.x,y:origin.y},points,owner?.id);repairs.push("Slalom alternato collegato al movimento");return;}
  if(requirement.relation==="lateral_targets"){const points=[{x:18,y:38},{x:82,y:38}],items=ensure(diagram,"mini_goal",2,points,"Target laterale");items.forEach((item,index)=>Object.assign(item,points[index]));const action=lastTechnicalAction(diagram);if(action){const target=action.startX<50?items[1]:items[0];Object.assign(action,{endX:target.x,endY:target.y,toElementId:target.id});}repairs.push("Porticine laterali simmetriche e target collegato");return;}
  if(requirement.relation==="mini_goal_target"){const point={x:78,y:38},target=ensure(diagram,"mini_goal",1,[point],"Target tecnico")[0];Object.assign(target,point);const action=lastTechnicalAction(diagram);if(action)Object.assign(action,{endX:target.x,endY:target.y,toElementId:target.id});repairs.push("Action terminata sulla bocca della porticina");return;}
  if(requirement.relation==="mannequin_gate"){const action=firstTechnicalAction(diagram),center=action?{x:(action.startX+action.endX)/2,y:(action.startY+action.endY)/2}:{x:50,y:52},points=[{x:center.x-7,y:center.y},{x:center.x+7,y:center.y}],items=ensure(diagram,"mannequin",2,points,"Varco sagome");items.forEach((item,index)=>Object.assign(item,points[index]));repairs.push("Sagome disposte ai lati della traiettoria");return;}
  if(requirement.relation==="mannequin_screen"){const action=diagram.actions.find(item=>item.type==="tiro")??firstTechnicalAction(diagram);const point=action?{x:action.startX+(action.endX-action.startX)*.55,y:action.startY+(action.endY-action.startY)*.55}:{x:50,y:52};Object.assign(ensure(diagram,"mannequin",1,[point],"Schermo tiro")[0],point);repairs.push("Sagoma inserita sulla linea di tiro");return;}
  if(requirement.relation==="hurdle_sequence"){const owner=gk??start,origin=owner??{x:50,y:72},points=Array.from({length:requirement.count},(_,index)=>({x:origin.x,y:origin.y-(index+1)*Math.max(7,(origin.y-30)/(requirement.count+1))})),items=ensure(diagram,"hurdle",requirement.count,points,"Sequenza ostacoli");items.forEach((item,index)=>Object.assign(item,points[index]));addPathActions(diagram,{x:origin.x,y:origin.y},points,owner?.id);repairs.push("Ostacoli ordinati e attraversati dalla sequenza di movimento");return;}
  if(requirement.relation==="ball_owner"){const action=firstTechnicalAction(diagram),owner=actionOwner(diagram,action)??actorByRole(diagram,/tiratore|servitore|attaccante|appoggio|compagno/)??start;if(!owner)return;const ball=ensure(diagram,"ball",1,[foot(owner)],"Palla attiva")[0],point=foot(owner);Object.assign(ball,point,{role:`Palla di ${owner.role??owner.id}`});if(action)Object.assign(action,{startX:ball.x,startY:ball.y,fromElementId:ball.id});repairs.push("Palla associata al piede della prima origine");return;}
  if(requirement.relation==="second_ball_source"){const actions=diagram.actions.filter(item=>["tiro","passaggio","cross"].includes(item.type)),firstOwner=actionOwner(diagram,actions[0])??actorByRole(diagram,/tiratore|attaccante|servitore/),secondOwner=actionOwner(diagram,actions[1])??actorByRole(diagram,/appoggio|compagno|secondo servitore/)??firstOwner;if(!firstOwner||!secondOwner||actions.length<2)return;const firstPoint=foot(firstOwner),secondBase=foot(secondOwner),secondPoint=firstOwner.id===secondOwner.id?{x:Math.max(7,Math.min(93,secondBase.x+(secondBase.x<50?7:-7))),y:secondBase.y}:secondBase,points=[firstPoint,secondPoint],balls=ensure(diagram,"ball",2,points,"Palla attiva");balls.forEach((ball,index)=>Object.assign(ball,points[index],{role:`Palla ${index?"B":"A"} di ${(index?secondOwner:firstOwner).role??(index?secondOwner:firstOwner).id}`}));for(let index=0;index<2;index+=1)Object.assign(actions[index],{startX:balls[index].x,startY:balls[index].y,fromElementId:balls[index].id});repairs.push(firstOwner.id===secondOwner.id?"Due palloni distinti associati allo stesso servitore":"Due palloni associati a due origini distinte");}
}

function elementSatisfied(requirement:TacticalSetupRequirement,diagram:TacticalDiagram){return diagram.elements.filter(item=>item.type===requirement.type).length>=requirement.count;}
function relationCheck(requirement:TacticalSetupRequirement,diagram:TacticalDiagram):TacticalRelationValidation{
  const items=diagram.elements.filter(item=>item.type===requirement.type),actions=diagram.actions,expected=requirement.reason;let valid=elementSatisfied(requirement,diagram),generated=`${items.length} ${requirement.type}`;
  if(!valid)return{relation:requirement.relation,type:requirement.type,expected,generated,valid:false};
  if(requirement.relation==="cone_gate"){const subject=actors(diagram).find(actor=>items.some(left=>items.some(right=>left.id!==right.id&&left.x<actor.x&&right.x>actor.x&&Math.abs(left.y-right.y)<5)));valid=Boolean(subject);generated=valid?"Figura compresa nel varco":"Coni presenti ma senza figura nel varco";}
  if(requirement.relation==="cone_square"||requirement.relation==="marker_zone"){const xs=items.map(item=>item.x),ys=items.map(item=>item.y);valid=Math.max(...xs)-Math.min(...xs)>=15&&Math.max(...ys)-Math.min(...ys)>=15;generated=valid?"Zona chiusa a quattro vertici":"Riferimenti non delimitano una zona";}
  if(requirement.relation==="cone_diamond"){const center={x:items.reduce((sum,item)=>sum+item.x,0)/items.length,y:items.reduce((sum,item)=>sum+item.y,0)/items.length};valid=items.some(item=>Math.abs(item.x-center.x)<3&&item.y<center.y)&&items.some(item=>Math.abs(item.x-center.x)<3&&item.y>center.y)&&items.some(item=>item.x<center.x&&Math.abs(item.y-center.y)<3)&&items.some(item=>item.x>center.x&&Math.abs(item.y-center.y)<3);generated=valid?"Quattro vertici a rombo":"Geometria del rombo assente";}
  if(requirement.relation==="corridor"){const left=items.filter(item=>item.x<50),right=items.filter(item=>item.x>50);valid=left.length>=2&&right.length>=2;generated=valid?"Due file laterali parallele":"Corridoio non riconoscibile";}
  if(requirement.relation==="start_cone"){const actor=actors(diagram).some(item=>items.some(cone=>Math.hypot(item.x-cone.x,item.y-cone.y)<=10));valid=actor;generated=valid?"Cono vicino alla partenza":"Cono scollegato dalla partenza";}
  if(requirement.relation==="recovery_cone"){valid=actions.some(action=>action.type==="recupero"&&items.some(cone=>Math.hypot(action.endX-cone.x,action.endY-cone.y)<5));generated=valid?"Cono sulla destinazione del recupero":"Cono non collegato al recupero";}
  if(requirement.relation==="slalom"){const ordered=items.slice(0,requirement.count),directions=ordered.slice(1).map((item,index)=>Math.sign(item.x-ordered[index].x)).filter(Boolean),alternating=directions.every((direction,index)=>index===0||direction!==directions[index-1]),pathActions=actions.filter(item=>item.id.startsWith("validation-path-")).length;valid=new Set(ordered.map(item=>item.y)).size===requirement.count&&alternating&&pathActions>=requirement.count;generated=valid?"Sequenza alternata attraversata dalle actions":"Marker presenti ma slalom non utilizzato";}
  if(requirement.relation==="mini_goal_target"||requirement.relation==="lateral_targets"){const targetLinked=actions.some(action=>items.some(item=>action.toElementId===item.id&&Math.hypot(action.endX-item.x,action.endY-item.y)<3)),lateral=requirement.relation!=="lateral_targets"||items.some(item=>item.x<40)&&items.some(item=>item.x>60);valid=targetLinked&&lateral;generated=valid?"Action conclusa nella porticina":"Porticina presente ma non usata come target";}
  if(requirement.relation==="mannequin_gate"){const relevant=actions.find(action=>["passaggio","tiro"].includes(action.type));const gap=items.length>=2?{x:(items[0].x+items[1].x)/2,y:(items[0].y+items[1].y)/2}:null;valid=Boolean(relevant&&gap&&Math.abs(items[0].x-items[1].x)>=8&&pointOnSegment(gap,{x:relevant.startX,y:relevant.startY},{x:relevant.endX,y:relevant.endY})<3);generated=valid?"Traiettoria attraversa il varco":"Sagome presenti ma varco non attraversato";}
  if(requirement.relation==="mannequin_screen"){const shot=actions.find(action=>action.type==="tiro");valid=Boolean(shot&&items.some(item=>pointOnSegment(item,{x:shot.startX,y:shot.startY},{x:shot.endX,y:shot.endY})<3));generated=valid?"Sagoma sulla linea di tiro":"Sagoma non coinvolta nel tiro";}
  if(requirement.relation==="hurdle_sequence"){const ordered=new Set(items.slice(0,requirement.count).map(item=>item.y)).size===requirement.count,pathActions=actions.filter(item=>item.id.startsWith("validation-path-")).length;valid=ordered&&pathActions>=requirement.count;generated=valid?"Ostacoli ordinati lungo il movimento":"Ostacoli presenti ma non attraversati";}
  if(requirement.relation==="ball_owner"){valid=items.some(ball=>actors(diagram).some(owner=>Math.hypot(ball.x-owner.x,ball.y-owner.y)<=9)&&actions.some(action=>action.fromElementId===ball.id&&Math.hypot(action.startX-ball.x,action.startY-ball.y)<2));generated=valid?"Palla vicina al proprietario e origine dell'action":"Palla senza ownership tecnica";}
  if(requirement.relation==="second_ball_source"){const firstTwo=items.slice(0,2),linked=firstTwo.every(ball=>actions.some(action=>action.fromElementId===ball.id));valid=firstTwo.length===2&&firstTwo[0].id!==firstTwo[1].id&&linked;generated=valid?"Due palloni distinti collegati alle due fasi":"Seconda palla non associata a un'origine distinta";}
  if(requirement.relation==="derived_second_ball"){const ordered=actions.slice().sort((a,b)=>a.sequence-b.sequence),first=ordered.find(item=>["tiro","passaggio","cross"].includes(item.type)),transition=ordered.find(item=>item.sequence>(first?.sequence??0)&&item.type==="recupero"),second=ordered.find(item=>item.sequence>(transition?.sequence??first?.sequence??0)&&["movimento","tuffo","tiro","passaggio"].includes(item.type));valid=Boolean(first&&transition&&second&&Math.hypot(second.startX-first.endX,second.startY-first.endY)<=18);generated=valid?"Seconda fase collegata all'esito della prima palla":"Transizione verso la seconda azione derivata non riconoscibile";}
  return{relation:requirement.relation,type:requirement.type,expected,generated,valid};
}

export function validateTacticalSetup(exercise:Exercise,diagram:TacticalDiagram,options:ValidationOptions={}):TacticalSetupValidation{
  const expectedElements=extractTacticalSetupRequirements(exercise),source=options.source??exercise.diagram_source??"automatic",canRepair=(options.autoRepair??true)&&source==="automatic",output=clone(diagram),repairs:string[]=[];
  if(canRepair)for(const requirement of expectedElements.filter(item=>item.essential)){const check=relationCheck(requirement,output);if(!check.valid)repair(exercise,output,requirement,repairs);}
  const layout=refineEquipmentLayout(output,expectedElements,(options.refineLayout??true)&&canRepair?source:"manual");
  const laidOut=layout.diagram,elementIssues:string[]=[],relationChecks=expectedElements.filter(item=>item.essential).map(item=>relationCheck(item,laidOut)),relationIssues:string[]=[],warnings:string[]=[],layoutIssues:string[]=[];
  for(const requirement of expectedElements.filter(item=>item.essential)){if(elementSatisfied(requirement,laidOut))continue;elementIssues.push(`${requirement.reason}: attesi ${requirement.count} ${requirement.type}`);}
  for(const check of relationChecks)if(!check.valid)relationIssues.push(`${check.expected}: ${check.generated}`);
  const metrics=layout.validation.metrics,criticalCollision=metrics.realCollision>0||metrics.excessiveOverlap>=5||(metrics.pathTooCompressed&&metrics.excessiveOverlap>=3);
  if(criticalCollision)layoutIssues.push(`Collisione critica: ${metrics.realCollision} collisioni reali e ${metrics.excessiveOverlap} sovrapposizioni`);
  else warnings.push(...layout.validation.warnings);
  const inventory=equipmentInventory(exercise,expectedElements,laidOut),infos=inventoryInfos(inventory),issues=[...elementIssues,...relationIssues,...layoutIssues],status:TacticalSetupValidationStatus=issues.length?"NEEDS_REVIEW":warnings.length?"VALID_WITH_WARNINGS":"VALID";
  return{status,diagram:laidOut,relevantData:relevantData(exercise),expectedElements,declaredElements:extractDeclaredTacticalEquipment(exercise),generatedElements:counts(laidOut),equipmentInventory:inventory,expectedRelations:relationChecks.map(item=>item.expected),generatedRelations:relationChecks.map(item=>item.generated),elementValidation:{valid:elementIssues.length===0,issues:elementIssues},relationValidation:{valid:relationIssues.length===0,issues:relationIssues,checks:relationChecks},layoutValidation:layout.validation,layoutDensity:layout.density,layoutZones:layout.zones,layoutAdjustments:layout.adjustments,issues,warnings,infos,repairs};
}
