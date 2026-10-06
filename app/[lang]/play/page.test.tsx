import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PersonalContent, DirectoryContent, generateMetadata } from "./page";
import { getPlayDictionary, getJoinGameDictionary } from "@/lib/i18n/server";
import { SUPPORTED_LOCALES } from "@/lib/i18n";
const { token, mine, directory } = vi.hoisted(() => ({ token: vi.fn(), mine: vi.fn(), directory: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: token }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), notFound: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseGameRepository: () => ({ listMyGames: mine }) }));
vi.mock("@/lib/poker/public-directory-cache", () => ({ getPublicDirectoryPage: directory }));
beforeEach(() => { vi.clearAllMocks(); token.mockReturnValue({ value: "owner" }); mine.mockResolvedValue([]); directory.mockResolvedValue({ games: [], nextCursor: null }); });
async function personal() { return renderToStaticMarkup(await PersonalContent({ lang: "en-US", dictionary: await getPlayDictionary("en-US") })); }
it("hides a successfully empty section and does not create missing identities", async () => {
  token.mockReturnValue(undefined);
  expect(await personal()).toBe(""); expect(mine).not.toHaveBeenCalled();
});
it("renders a personal error and retry without blocking public tables", async () => {
  mine.mockRejectedValue(new Error("private"));
  expect(await personal()).toContain('role="alert"'); expect(await personal()).toContain("Retry");
  const publicMarkup = renderToStaticMarkup(await DirectoryContent({ lang: "en-US", dictionary: await getJoinGameDictionary("en-US") }));
  expect(publicMarkup).toContain("No public tables are available"); expect(directory).toHaveBeenCalledWith("owner");
});
it("renders browser ownership, status and return links when the public section fails", async () => {
  directory.mockRejectedValue(new Error("failure"));
  mine.mockResolvedValue([{ gameId: "11111111-1111-4111-8111-111111111111", title: null, status: "complete", updatedAt: "2026-10-06T12:00:00Z", occupiedSeats: 2, totalSeats: 6 }]);
  const html = await personal();
  expect(html).toContain("Recently active"); expect(html).toContain("Hand complete"); expect(html).toContain("2/6 seats"); expect(html).toContain("Return to table"); expect(html).toContain("These tables belong to this browser");
  const publicMarkup = renderToStaticMarkup(await DirectoryContent({ lang: "en-US", dictionary: await getJoinGameDictionary("en-US") }));
  expect(publicMarkup).toContain("Public tables could not be loaded"); expect(publicMarkup).not.toContain("No public tables are available");
});
it.each(SUPPORTED_LOCALES)("provides localized Play strings and noindex metadata for %s", async lang => {
  const d = await getPlayDictionary(lang);
  expect(Object.values(d).filter(value => typeof value === "string").every(value => value.trim())).toBe(true);
  expect(Object.keys(d.statuses)).toEqual(["waiting", "playing", "complete", "error"]);
  const metadata = await generateMetadata({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) });
  expect(metadata.robots).toEqual({ index: false, follow: true }); expect(metadata.alternates?.canonical).toContain(`/${lang}/play`);
});

it("keeps every locale's Play keys and placeholders aligned", async () => {
  function leaves(value: unknown, path = ""): Record<string, string> {
    if (typeof value === "string") return { [path]: value };
    return Object.assign({}, ...Object.entries(value as Record<string, unknown>).map(([key, child]) => leaves(child, `${path}.${key}`)));
  }
  const english = leaves(await getPlayDictionary("en-US"));
  for (const locale of SUPPORTED_LOCALES) {
    const translated = leaves(await getPlayDictionary(locale));
    expect(Object.keys(translated)).toEqual(Object.keys(english));
    for (const key of Object.keys(english)) expect(translated[key].match(/\{\w+\}/g) ?? []).toEqual(english[key].match(/\{\w+\}/g) ?? []);
  }
});
