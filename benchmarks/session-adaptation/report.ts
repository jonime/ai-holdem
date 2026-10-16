import type { Evidence } from "./storage";
export function report(e: Evidence) {
  const windows = [[1, 10], [11, 30], [31, 60]];
  const blocks = e.blocks.map(b => {
    const hands = e.hands.filter(h => h.block === b.id), requests = e.requests.filter(r => r.block === b.id);
    const complete = b.status === "complete" && [0, 1].every(seat => [true, false].every(memory => {
      const rows = hands.filter(h => h.seat === seat && h.memory === memory);
      return rows.length === 60 && new Set(rows.map(r => r.hand)).size === 60 && rows.every(r => r.hand >= 1 && r.hand <= 60);
    }));
    const difference = (first: number, last: number) => [0, 1].reduce((sum, seat) => sum + [true, false].reduce((delta, memory) => delta + (memory ? 1 : -1) * hands.filter(h => h.seat === seat && h.memory === memory && h.hand >= first && h.hand <= last).reduce((n, h) => n + h.profitBB, 0), 0), 0) / 2 * 100 / (last - first + 1);
    return { ...b, complete, requests: requests.length, unresolvedReservations: requests.filter(r => r.status === "reserved").length, completedHands: hands.length, completionProportion: hands.length / 240, differenceBB100: complete ? difference(1, 60) : null,
      windows: windows.map(([first, last]) => ({ first, last, failures: e.failures.filter(f => f.block === b.id && f.hand >= first && f.hand <= last), differenceBB100: complete ? difference(first, last) : null, arms: [true, false].map(memory => {
        const rows = e.decisions.filter(d => d.block === b.id && d.memory === memory && d.hand >= first && d.hand <= last), own = rows.filter(d => d.role === "subject");
        return { memory, completedHands: hands.filter(h => h.memory === memory && h.hand >= first && h.hand <= last).length, requests: requests.filter(r => r.hand >= first && r.hand <= last && r.episode.endsWith(memory ? "memory" : "omitted")).length,
          beforeUsable: own.filter(d => !d.usable).length, afterUsable: own.filter(d => d.usable).length, adviceActive: own.filter(d => d.advice > 0).length, confidenceSignalAvailable: own.filter(d => d.confidenceSignal > 0).length,
          observations: own.map(d => ({ episode: d.episode, hand: d.hand, index: d.index, participants: d.observations?.participants ?? [] })),
          behavior: ["subject", "opponent"].map(role => ({ role, actions: Object.fromEntries(["raise", "bet", "call", "fold", "check"].map(action => [action, rows.filter(d => d.role === role && d.action.type === action).length])), opens: rows.filter(d => d.role === role && d.index === 0 && d.action.type === "raise").length,
            sizing: rows.filter(d => d.role === role && ["bet", "raise"].includes(d.action.type)).map(d => ({ sizing: d.sizing, paymentBB: d.paymentBB, potFraction: d.potFraction, stackFraction: d.stackFraction })) })),
          profitBB: hands.filter(h => h.memory === memory && h.hand >= first && h.hand <= last).reduce((n, h) => n + h.profitBB, 0), cost: own.reduce((n, d) => n + (d.cost ?? 0), 0), knownCostDecisions: own.filter(d => d.cost !== null).length, revisions: [...new Set(own.map(d => d.revision).filter(Boolean))] };
      }) })) };
  });
  return { version: e.version, manifestHash: e.manifestHash, status: e.status, failure: e.failure, requests: e.requests.length, requestMaximum: e.limits?.combinedCap ?? 4800, blocks,
    cells: ["jev", "llm"].flatMap(provider => ["frequent-folder", "frequent-caller"].map(opponent => {
      const selected = blocks.filter(b => b.provider === provider && b.opponent === opponent), complete = selected.filter(b => b.complete);
      return { provider, opponent, independentBlocks: complete.length, plannedBlocks: 2, differencesBB100: complete.map(b => b.differenceBB100), descriptiveMeanBB100: complete.length ? complete.reduce((n, b) => n + b.differenceBB100!, 0) / complete.length : null };
    })), interpretation: "Exploratory feasibility pilot. Two independent blocks maximum per cell; no reliable significance or interval claims. Budget exclusions are behavior-dependent and can bias complete-block chip results. Time windows do not prove learning. Seeds reused across providers add no independence. No paid Eevo evidence. Review exposure, behavioral response and complete paired chips separately before choosing a confirmatory study, focused policy experiment, or retaining current behavior." };
}

export function markdown(result: ReturnType<typeof report>) {
  const lines = ["# Session adaptation pilot", "", `Status: ${result.status}. Reserved dispatches: ${result.requests}/${result.requestMaximum.toLocaleString("en-US")}. Freeze: ${result.manifestHash}.`, "", "| Provider | Opponent | Complete blocks | Descriptive memory minus omitted BB/100 |", "| --- | --- | --- | --- |"];
  for (const cell of result.cells) lines.push(`| ${cell.provider} | ${cell.opponent} | ${cell.independentBlocks}/2 | ${cell.descriptiveMeanBB100?.toFixed(2) ?? "excluded"} |`);
  lines.push("", "## Block evidence", "", "| Block | Status | Hands / 240 | Requests | Difference BB/100 |", "| --- | --- | --- | --- | --- |");
  for (const block of result.blocks) lines.push(`| ${block.id} | ${block.status} | ${block.completedHands} | ${block.requests} | ${block.differenceBB100?.toFixed(2) ?? "excluded"} |`);
  lines.push("", "## Exposure and behavior", "", "| Block | Window | Memory | Before usable | After usable | Advice active |", "| --- | --- | --- | --- | --- | --- |");
  for (const block of result.blocks) for (const window of block.windows) for (const arm of window.arms) lines.push(`| ${block.id} | ${window.first}–${window.last} | ${arm.memory} | ${arm.beforeUsable} | ${arm.afterUsable} | ${arm.adviceActive} |`);
  lines.push("", "The adjacent JSON contains per-decision public counts, action/sizing distributions, window chips, request counts, failures and available cost/revision metadata. Advice active counts supplied Jev confidence advice. LLM retains its general production session guidance; confidence eligibility is only a diagnostic there. Advice activation measures an available production signal; stochastic arm differences alone do not establish that a decision causally responded to it.", "", result.interpretation, "", "Choose a larger confirmatory study only after reviewing complete blocks and exposure. Sparse exposure or heavy missingness supports feasibility conclusions. Consider a separately authorized focused policy experiment if observations accumulate but behavior remains unresponsive; otherwise retaining current behavior remains an option. This pilot changes no production policy.", "");
  return lines.join("\n");
}
