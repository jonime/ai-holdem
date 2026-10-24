import { addLocalePrefix } from "@/lib/i18n";
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
it("shows a successfully empty section and does not create missing identities", async () => {
  token.mockReturnValue(undefined);
  expect(await personal()).toContain("No tables yet"); expect(mine).not.toHaveBeenCalled();
});
it("renders a personal error and retry without blocking public tables", async () => {
  mine.mockRejectedValue(new Error("private"));
  expect(await personal()).toContain('role="alert"'); expect(await personal()).toContain("Retry");
  const publicMarkup = renderToStaticMarkup(await DirectoryContent({ lang: "en-US", dictionary: await getJoinGameDictionary("en-US") }));
  expect(publicMarkup).toContain("No public tables are available"); expect(directory).toHaveBeenCalledWith("owner");
});
it("renders browser ownership, status and return links when the public section fails", async () => {
  directory.mockRejectedValue(new Error("failure"));
  mine.mockResolvedValue([{ gameId: "11111111-1111-4111-8111-111111111111", title: null, status: "complete", updatedAt: "2026-10-06T12:00:00Z", occupiedSeats: 2, totalSeats: 6, humanCount: 1, botCount: 1, viewerSeated: true, version: 0, removal: "delete" }]);
  const html = await personal();
  expect(html).not.toContain("Recently active"); expect(html).toContain("Hand complete"); expect(html).toContain("2/6 seats"); expect(html).toContain("Return to table"); expect(html).not.toContain("These tables belong to this browser");
  const publicMarkup = renderToStaticMarkup(await DirectoryContent({ lang: "en-US", dictionary: await getJoinGameDictionary("en-US") }));
  expect(publicMarkup).toContain("Public tables could not be loaded"); expect(publicMarkup).not.toContain("No public tables are available");
});
it.each(SUPPORTED_LOCALES)("provides localized Play strings and noindex metadata for %s", async lang => {
  const d = await getPlayDictionary(lang);
  expect(Object.values(d).filter(value => typeof value === "string").every(value => value.trim())).toBe(true);
  expect(Object.keys(d.statuses)).toEqual(["waiting", "playing", "complete", "error"]);
  const metadata = await generateMetadata({ params: Promise.resolve({ lang }), searchParams: Promise.resolve({}) });
  expect(metadata.robots).toEqual({ index: false, follow: true }); expect(metadata.alternates?.canonical).toContain(addLocalePrefix("/play", lang));
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

it.each(["personal", "public", "shared"] as const)("constructs only the selected %s collection and disables tab prefetch", async tab => {
  const { Collections, SharedContent } = await import("./page");
  const tree = await Collections({ lang: "en-US", d: await getPlayDictionary("en-US"), directory: await getJoinGameDictionary("en-US"), searchParams: Promise.resolve(tab === "personal" ? {} : { tab }) });
  const [nav, shell] = tree.props.children;
  const boundary = shell.props.children;
  const links = nav.props.children;
  expect(links).toHaveLength(3);
  expect(links.every((link: { props: { prefetch: boolean } }) => link.props.prefetch === false)).toBe(true);
  expect(links.filter((link: { props: { "aria-current"?: string } }) => link.props["aria-current"] === "page")).toHaveLength(1);
  expect(shell.key).toBe(`en-US:${tab}`);
  expect(shell.props.description).toBeUndefined();
  expect(boundary.props.fallback.props.label).toBe((await getJoinGameDictionary("en-US")).loadingMore);
  const content = boundary.props.children;
  expect(content.type).toBe(tab === "personal" ? PersonalContent : tab === "shared" ? SharedContent : DirectoryContent);
  expect(mine).not.toHaveBeenCalled(); expect(directory).not.toHaveBeenCalled();
});

it("keeps the shared heading outside decorative initial skeletons", async () => {
  const { CollectionShell, CollectionSkeleton } = await import("./Collection");
  const d = await getPlayDictionary("en-US");
  const html = renderToStaticMarkup(<CollectionShell id="shared-hands-heading" title={d.sharedHands} hasAction>
    <CollectionSkeleton label="Loading…" refreshLabel={`${d.refreshList}: ${d.sharedHands}`} />
  </CollectionShell>);
  expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('aria-busy="true"'));
  expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf('aria-busy="true"'));
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('title="Refresh list: Shared hands" disabled=""');
});
