import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TableLoadingShell, TableLoadingIndicator } from "./TableLoadingShell";
import { TableRouteLoading } from "./TableRouteLoading";
import EnglishLoading from "@/app/(english)/game/[gameId]/loading";
import LocaleLoading from "@/app/[lang]/game/[gameId]/loading";
import { I18nProvider } from "./I18nProvider";
import { MissingTable, TableLoadingError } from "./TableLoadingFallback";
import { SUPPORTED_LOCALES, addLocalePrefix } from "@/lib/i18n";
import { getGameDictionary } from "@/lib/i18n/server";

const hooks = vi.hoisted(() => ({ pending: false, tasks: [] as Promise<void>[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: false }),
  useTransition: () => [hooks.pending, (task: () => Promise<void>) => { hooks.tasks.push(task()); }],
}));

describe("table loading fallbacks", () => {
  beforeEach(() => { hooks.pending = false; hooks.tasks = []; });

  it.each(SUPPORTED_LOCALES)("shares a neutral localized loader for %s", async locale => {
    const dictionary = await getGameDictionary(locale);
    const indicator = renderToStaticMarkup(<TableLoadingIndicator label={dictionary.table.loading} />);
    const shell = renderToStaticMarkup(<TableLoadingShell label={dictionary.table.loading}
      homeHref={addLocalePrefix("/", locale)}
      controlLabels={[dictionary.gameHeader.help, dictionary.settings.title, dictionary.gameHeader.lobby]} />);
    expect(shell).toContain(indicator);
    expect(shell).toContain("AI Hold&#x27;em");
    expect(indicator).toContain(dictionary.table.loading);
    expect(indicator).toContain('role="status" aria-live="polite" aria-atomic="true"');
    expect(indicator).toContain('aria-busy="true"');
    expect(indicator).toContain('aria-hidden="true"');
    expect(shell).not.toMatch(/felt|tableShell|actionTray|playing-card|<button|<input|<article|<aside/);
  });

  it.each(SUPPORTED_LOCALES)("uses the shared neutral shell at the %s game segment", async locale => {
    const dictionary = await getGameDictionary(locale);
    expect(EnglishLoading).toBe(TableRouteLoading);
    expect(LocaleLoading).toBe(TableRouteLoading);
    const expected = renderToStaticMarkup(<I18nProvider locale={locale} dictionary={dictionary}>
      <TableLoadingShell label={dictionary.table.loading} homeHref={addLocalePrefix("/", locale)}
        controlLabels={[dictionary.gameHeader.help, dictionary.settings.title, dictionary.gameHeader.lobby]} />
    </I18nProvider>);
    expect(renderToStaticMarkup(<I18nProvider locale={locale} dictionary={dictionary}>
      <LocaleLoading />
    </I18nProvider>)).toBe(expected);
  });

  it("can hide the visible label while retaining the accessible status and shared spinner", () => {
    const html = renderToStaticMarkup(<TableLoadingIndicator label="Loading…" hideLabel />);
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<span class="[^"]*srOnly[^"]*">Loading…<\/span>/);
    expect(html).toContain('aria-hidden="true"');
  });

  it("invokes only explicit retry and guards duplicate invocations", async () => {
    let finish!: () => void;
    const retry = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const panel = TableLoadingError({ error: new Error("private"), retry });
    expect(retry).not.toHaveBeenCalled();
    panel.props.onRetry();
    panel.props.onRetry();
    expect(retry).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all(hooks.tasks);
    panel.props.onRetry();
    expect(retry).toHaveBeenCalledTimes(2);
    finish();
    await Promise.all(hooks.tasks);
  });

  it("disables retry throughout boundary recovery", () => {
    hooks.pending = true;
    const retry = vi.fn();
    const panel = TableLoadingError({ error: new Error("private"), retry });
    panel.props.onRetry();
    expect(retry).not.toHaveBeenCalled();
    expect(panel.props.pending).toBe(true);
  });

  it.each(SUPPORTED_LOCALES)("uses the layout's %s dictionary and Lobby destination", async locale => {
    const dictionary = await getGameDictionary(locale);
    for (const failure of ["missing", "error"] as const) {
      const html = renderToStaticMarkup(<I18nProvider locale={locale} dictionary={dictionary}>
        {failure === "missing" ? <MissingTable /> : <TableLoadingError error={Object.assign(new Error("secret database ownership stack"), { digest: "private-digest" })} retry={() => { throw new Error("no automatic retry"); }} />}
      </I18nProvider>);
      expect(html).toContain(dictionary.tableLoading[failure === "missing" ? "missingTitle" : "errorTitle"]);
      expect(html).toContain(`href="${addLocalePrefix("/play", locale)}"`);
      expect(html).toContain(dictionary.gameHeader.lobby);
      expect(html).toContain('<h1 id="table-loading-title">');
      expect(html.includes('<button')).toBe(failure === "error");
      expect(html).not.toMatch(/secret database|ownership stack|private-digest/);
    }
  });
});
