import type { BotContext, PokerBot } from "@/lib/bots/types";
import { evaluateVisibleCards } from "@/lib/poker/adapter";
import { prepareProviderContext } from "@/lib/poker/provider-context";

/** Map occupied seats in cyclic order starting at hero; holes form an unordered set. */
export function canonicalContext(context: BotContext): BotContext {
  const seats = [context.hero.seat, ...context.opponents.map(p => p.seat)].sort((a,b) => a-b);
  if (new Set(seats).size !== seats.length) throw new Error("Duplicate visible seat");
  const offset = seats.indexOf(context.hero.seat);
  const seat = (value: number) => {
    const index = seats.indexOf(value);
    if (index < 0) throw new Error("Unmapped visible seat");
    return (index - offset + seats.length) % seats.length;
  };
  const situation = context.situation;
  // Derived facts and advice must be recomputed against the mapped seat references.
  const { facts: ignoredFacts, strategyAdvice: ignoredAdvice, ...base } = context;
  void ignoredFacts; void ignoredAdvice;
  return prepareProviderContext({ ...base,
    hero: { ...context.hero, seat: 0, holeCards: [...context.hero.holeCards].sort(),
      handStrength: { ...context.hero.handStrength, bestFive: [...evaluateVisibleCards([...context.hero.holeCards].sort(), context.hand.communityCards).bestFive].sort() } },
    opponents: context.opponents.map(p => ({ ...p, seat: seat(p.seat) })).sort((a,b) => a.seat-b.seat),
    actionHistory: context.actionHistory.map(a => ({ ...a, actorSeat: a.actorSeat === null ? null : seat(a.actorSeat),
      ...(a.activeSeats ? { activeSeats: a.activeSeats.map(seat).sort((a,b) => a-b) } : {}) })),
    ...(situation ? { situation: { ...situation,
      playersStillToAct: situation.playersStillToAct.map(seat),
      preflopOrder: situation.preflopOrder.map(seat), postflopOrder: situation.postflopOrder.map(seat),
      effectiveStacks: situation.effectiveStacks.map(p => ({ ...p, seat: seat(p.seat) })).sort((a,b) => a.seat-b.seat) } } : {}),
    ...(context.sessionStats ? { sessionStats: { ...context.sessionStats,
      participants: context.sessionStats.participants.map(p => ({ ...p, seat: seat(p.seat) })).sort((a,b) => a.seat-b.seat) } } : {}),
  });
}
export function canonicalBot(bot: PokerBot): PokerBot {
  return { decide: context => bot.decide(canonicalContext(context)) };
}
function permutations(s: string): string[] {
  return s.length ? [...s].flatMap((c,i) => permutations(s.slice(0,i)+s.slice(i+1)).map(t => c+t)) : [""];
}
export const suitPermutations = permutations("cdhs");
/** Only visible information enters the deterministic choice seed. No equity substitution. */
export function canonicalSeed(context: BotContext): string {
  const c = canonicalContext(context);
  const visible = (mapping: string) => {
    const card = (v: string) => v[0] + mapping["cdhs".indexOf(v[1])];
    return { hero: c.hero.holeCards.map(card).sort(), board: c.hand.communityCards.map(card) };
  };
  const cards = suitPermutations.map(s => JSON.stringify(visible(s))).sort()[0];
  const money = new Set(["amount", "payment", "commitment", "potBefore", "potAfter", "raiseIncrement"]);
  const history = c.actionHistory.map(a => Object.fromEntries(Object.entries(a).map(([k,v]) => [k,
    money.has(k) && typeof v === "number" ? ratio(v,c.game.bigBlind) : v])));
  return JSON.stringify({ handNumber: c.game.handNumber, cards, street: c.hand.street, history });
}
function ratio(n: number, d: number): string {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 0 || d <= 0) throw new Error("Invalid chip ratio");
  const gcd = (a: number,b: number): number => b ? gcd(b,a%b) : a;
  const g = gcd(n,d); return `${n/g}/${d/g}`;
}
export function frequency(seed: string): number {
  let hash = 2166136261;
  for (let i=0;i<seed.length;i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash,16777619); }
  return ((hash >>> 0) % 1000) / 1000;
}
