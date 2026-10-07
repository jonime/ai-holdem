import { beforeEach, expect, it, vi } from "vitest";
import { GET as feed } from "./[gameId]/feed/route";
import { GET as directory } from "./public/route";
import { GET as bots } from "@/app/api/bots/route";
import { feedResponseSchema } from "@/lib/http/feed-contracts";
import { directoryResponseSchema } from "@/lib/http/discovery-contracts";
import { botCatalogResponseSchema } from "@/lib/http/creation-contracts";
const { readFeed, page } = vi.hoisted(() => ({ readFeed: vi.fn(), page: vi.fn() }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), connection: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({}) }));
vi.mock("@/lib/poker/game-service", () => ({ getGameFeed: readFeed }));
vi.mock("@/lib/poker/public-directory-cache", async original => ({ ...await original<typeof import("@/lib/poker/public-directory-cache")>(), getPublicDirectoryPage: page }));
vi.mock("@/lib/bots/registry", () => ({ getBotCatalog: () => [{ id: "rules", label: "Rules", provider: "rules", modelId: null }] }));
const context = { params: Promise.resolve({ gameId: "game-1" }) };
const request = (query = "") => new Request(`http://localhost/api/games/game-1${query}`, { headers: { cookie: "ai-holdem-player-id=owner" } });
beforeEach(() => {
  readFeed.mockReset(); readFeed.mockResolvedValue({ events: [] });
  page.mockReset(); page.mockResolvedValue({ games: [], nextCursor: "next" });
});
it("validates actual feed output", async () => { feedResponseSchema.parse(await (await feed(request("?sinceHand=001"), context)).json()); expect(readFeed).toHaveBeenCalledWith(expect.anything(), "game-1", 1); });
it("validates actual catalog", async () => { botCatalogResponseSchema.parse(await (await bots()).json()); });
it("validates directory pagination, ownership and private cache headers", async () => {
  const cursor = Buffer.from(JSON.stringify({ gameId: "game-1", publishedAt: "2026-10-04" })).toString("base64url");
  const response = await directory(request(`?cursor=${cursor}`));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  directoryResponseSchema.parse(await response.json());
  expect(page).toHaveBeenCalledWith("owner", { gameId: "game-1", publishedAt: "2026-10-04" });
});
it("rejects invalid directory cursors", async () => { expect((await directory(request("?cursor=broken"))).status).toBe(400); expect(page).not.toHaveBeenCalled(); });
