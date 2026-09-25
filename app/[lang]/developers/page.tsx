import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { hasLocale } from "@/lib/i18n";

import styles from "./page.module.css";

type DeveloperPageProps = Readonly<{
  params: Promise<{ lang: string }>;
}>;

export async function generateMetadata({
  params,
}: DeveloperPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return {
    title: "Developer resources",
    description:
      "AI Hold'em developer resources, architecture, integration status, source code, and machine-readable discovery files.",
    alternates: { canonical: "/en-US/developers" },
  };
}

export default async function DeveloperResources({ params }: DeveloperPageProps) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  return (
    <main className={styles.page}>
      <article lang="en-US" className={styles.card}>
        <p className={styles.eyebrow}>AI Hold&apos;em</p>
        <h1>Developer resources</h1>
        <p>
          AI Hold&apos;em is an open-source Next.js and TypeScript demonstration
          of multiplayer, agent-assisted Texas Hold&apos;em. The installed poker
          engine remains authoritative while server services validate human and
          AI actions and persist version-checked state in Supabase.
        </p>

        <h2>Integration status</h2>
        <p>
          The JSON endpoints under <code>/api/games</code> support the web
          application itself. They are not currently a versioned public API,
          and AI Hold&apos;em does not publish an SDK, API key program, or MCP
          server. Integrators should review the repository&apos;s architecture and
          security boundaries before reusing those routes.
        </p>

        <h2>Documentation and discovery</h2>
        <ul>
          <li>
            <a href="https://github.com/jonime/ai-holdem">Project repository</a>
          </li>
          <li>
            <a href="https://github.com/jonime/ai-holdem#readme">
              Setup and architecture
            </a>
          </li>
          <li>
            <a href="https://github.com/jonime/ai-holdem/blob/main/CONTRIBUTING.md">
              Contribution guide
            </a>
          </li>
          <li>
            <a href="/llms.txt">Agent and site map</a>
          </li>
          <li>
            <a href="/sitemap.xml">XML sitemap</a>
          </li>
        </ul>

        <Link className={styles.back} href={`/${lang}`}>
          Return to AI Hold&apos;em
        </Link>
      </article>
    </main>
  );
}
