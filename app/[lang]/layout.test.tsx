import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerRenderings = vi.hoisted(() => [] as unknown[]);

vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({}),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/poker/I18nProvider", () => ({
  I18nProvider: (props: { children: React.ReactNode }) => {
    providerRenderings.push(props);
    return <>{props.children}</>;
  },
  useI18n: vi.fn(),
}));

import LocaleLayout from "./layout";

describe("locale layout", () => {
  beforeEach(() => {
    providerRenderings.length = 0;
  });

  it("renders children without a translation provider", async () => {
    const html = renderToStaticMarkup(
      await LocaleLayout({
        params: Promise.resolve({ lang: "fi-FI" }),
        children: <div>layout-children</div>,
      }),
    );

    expect(html).toContain("<html lang=\"fi-FI\">");
    expect(html).toContain("layout-children");
    expect(providerRenderings).toHaveLength(0);
  });
});
