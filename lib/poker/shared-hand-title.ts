import "server-only";
import { z } from "zod";
import { getLlmServerEnv } from "@/lib/env/server";
import type { Locale } from "@/lib/i18n";
import { titleSchema, sharedReplaySchema } from "@/lib/http/share-contracts";
import type { ProviderFetch } from "@/lib/bots/provider-request";

/** A title-only lifetime; gameplay transport is a frozen evaluation dependency. */
async function requestTitleJson(fetcher: ProviderFetch, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error("Title deadline")); controller.abort(); }, 8_000);
  });
  try {
    const response = await Promise.race([fetcher(url, { ...init, signal: controller.signal }), deadline]);
    if (!response.ok) throw new Error("Title provider failure");
    return await Promise.race([response.json(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Explicit field allowlist: no participant names or source identifiers. */
export function titleFacts(snapshot: unknown) {
  const { replay } = sharedReplaySchema.parse(snapshot);
  const facts = {
    dealerSeat: replay.dealerSeat, smallBlindSeat: replay.smallBlindSeat, bigBlindSeat: replay.bigBlindSeat,
    frames: replay.frames.map(f => ({ street: f.street, board: f.board, action: f.action,
      pot: f.pot, players: f.players.map(p => ({ seat: p.seat, cards: p.cards, stack: p.stack, bet: p.bet, folded: p.folded, allIn: p.allIn })) })),
    pots: replay.pots,
  };
  const text = JSON.stringify(facts);
  // Decline excessive hands rather than truncate away their outcome.
  if (text.length > 24_000) throw new Error("Title summary too large");
  return text;
}
export async function generateSharedHandTitle(snapshot: unknown, locale: Locale, fetcher: ProviderFetch = fetch): Promise<string | null> {
  if (!process.env.SHARED_HAND_TITLE_MODEL?.trim() || process.env.EXTERNAL_INFERENCE_ENABLED === "false") return null;
  try {
    const facts = titleFacts(snapshot);
    const { apiEndpoint, apiKey } = getLlmServerEnv();
    const body = await requestTitleJson(fetcher, apiEndpoint, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.SHARED_HAND_TITLE_MODEL.trim(), max_tokens: 256,
        reasoning: { effort: "minimal" },
        messages: [
          { role: "system", content: `Write a factual public poker hand title in ${locale}, roughly 4–10 words and at most 80 characters. Use seat-relative identities only. No coaching, insults, or unsupported claims about bluffs, intent, or luck. Use only supplied facts. Return structured JSON with only title.` },
          { role: "user", content: facts },
        ],
        response_format: { type: "json_schema", json_schema: { name: "shared_hand_title", strict: true,
          schema: { type: "object", additionalProperties: false, required: ["title"], properties: { title: { type: "string" } } } } },
      }),
    });
    const response = z.object({ error: z.never().optional(), choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) }).parse(body);
    return z.strictObject({ title: titleSchema }).parse(JSON.parse(response.choices[0].message.content)).title;
  } catch { return null; }
}
