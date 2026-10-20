import { z } from "zod";
import { createDeterministicDeck, pokerEngineAdapter as engine } from "@/lib/poker/adapter";
import type { PokerAction, PokerGameState } from "@/lib/poker/types";
import { deck } from "../range-equity/calculator";

const card=z.string().regex(/^[2-9TJQKA][cdhs]$/);
const action=z.discriminatedUnion("type",[z.object({type:z.literal("check")}).strict(),z.object({type:z.literal("call"),amount:z.number().optional()}).strict(),z.object({type:z.literal("bet"),amount:z.number().int().positive()}).strict(),z.object({type:z.literal("raise"),amount:z.number().int().positive()}).strict()]);
export const specSchema=z.object({version:z.literal("first-to-act-river-v1"),id:z.string(),hero:z.tuple([card,card]),board:z.tuple([card,card,card,card,card]),stacks:z.tuple([z.number().int().positive(),z.number().int().positive()]),smallBlind:z.number().int().positive(),bigBlind:z.number().int().positive(),buttonSeat:z.literal(0),heroSeat:z.literal(1),history:z.array(z.object({sequence:z.number().int().positive(),seat:z.union([z.literal(0),z.literal(1)]),street:z.enum(["preflop","flop","turn"]),action}).strict())}).strict();
export type Spec=z.infer<typeof specSchema>;
export const key=(a:PokerAction)=>`${a.type}${a.type==="bet"||a.type==="raise"?":"+a.amount:""}`;
export const holdingKey=(cards:readonly string[])=>[...cards].sort().join(",");
export function replay(raw:Spec,opponent:readonly string[]){
  const d=specSchema.parse(raw),used=[...d.hero,...d.board,...opponent];
  if(opponent.length!==2||used.some(c=>!deck.includes(c))||new Set(used).size!==9)throw new Error("Invalid distinct cards");
  const burns=deck.filter(c=>!used.includes(c)).slice(0,3);
  const waiting=engine.createGame({seatCount:2,smallBlind:d.smallBlind,bigBlind:d.bigBlind,players:d.stacks.map((stack,seat)=>({id:`p${seat}`,name:`Seat ${seat}`,seat,stack,controller:"bot"}))});
  let state=engine.startHand(waiting,createDeterministicDeck([d.hero[0],opponent[0],d.hero[1],opponent[1],burns[0],...d.board.slice(0,3),burns[1],d.board[3],burns[2],d.board[4]]));
  if(engine.decisionView(state).buttonSeat!==d.buttonSeat||holdingKey(engine.heroCards(state,"p1"))!==holdingKey(d.hero))throw new Error("Deal orientation mismatch");
  for(const [i,h] of d.history.entries()){
    const view=engine.decisionView(state);
    if(h.sequence!==i+1||view.street!==h.street||view.currentActorSeat!==h.seat)throw new Error("Incomplete or mismatched transcript");
    state=engine.applyAction(state,`p${h.seat}`,h.action);
  }
  const view=engine.decisionView(state);
  if(view.street!=="river"||view.currentActorSeat!==1||view.postflopOrder[0]!==1||view.currentBet!==0||JSON.stringify(view.communityCards)!==JSON.stringify(d.board)||view.players.some(p=>p.folded||p.allIn||p.committedStreet!==0)||view.players[0].committedHand!==view.players[1].committedHand)throw new Error("Unsupported first-to-act river");
  return state;
}
export function terminal(state:PokerGameState,rootStack:number,bb:number){
  const view=engine.decisionView(state),total=state.config.players.reduce((s,p)=>s+p.stack,0);
  if(view.street!=="complete"||view.players.reduce((s,p)=>s+p.stack,0)!==total||view.players.some(p=>!Number.isInteger(p.stack)||p.stack<0))throw new Error("Terminal/chip conservation failure");
  return (view.players.find(p=>p.id==="p1")!.stack-rootStack)/bb;
}
/** Amounts are total street commitments; pot raise = call then raise by pot after calling. */
export function responses(state:PokerGameState){
  const legal=engine.getLegalActions(state),view=engine.decisionView(state),own=view.players.find(p=>p.seat===view.currentActorSeat)!;
  const call=legal.find(a=>a.type==="call"),sized=legal.find(a=>a.type==="bet"||a.type==="raise");
  const slots:{label:string;action:PokerAction}[]=[];
  if(legal.some(a=>a.type==="check"))slots.push({label:"check-back",action:{type:"check"}});
  else {if(!call||call.type!=="call")throw new Error("Missing response call");slots.push({label:"fold",action:{type:"fold"}},{label:"call",action:{type:"call"}});}
  if(sized&&(sized.type==="bet"||sized.type==="raise")){
    const clamp=(n:number)=>Math.min(sized.maxAmount,Math.max(sized.minAmount,Math.round(n)));
    const amounts=sized.type==="bet"?[["half-pot",clamp(view.pot/2)],["full-pot",clamp(view.pot)],["all-in",sized.maxAmount]] as const:
      [["minimum-raise",sized.minAmount],["pot-raise",clamp(own.committedStreet+(call?.type==="call"?call.amount:0)+view.pot+(call?.type==="call"?call.amount:0))],["all-in",sized.maxAmount]] as const;
    for(const [label,amount] of amounts)slots.push({label,action:{type:sized.type,amount}});
  }
  const unique=new Map<string,{action:PokerAction;labels:string[]}>();
  for(const s of slots){const k=key(s.action),r=unique.get(k)??{action:s.action,labels:[]};r.labels.push(s.label);unique.set(k,r);engine.applyAction(state,`p${view.currentActorSeat}`,s.action);}
  return [...unique.values()];
}
