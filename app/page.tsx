import Image from "next/image";

import { NewGameForm } from "@/components/poker/NewGameForm";
import { APP_NAME } from "@/lib/constants";

export default async function Home() {
  "use cache";
  return (
    <main className="poker-app">
      <section
        className="empty-state home-empty-state"
        aria-label="Start a new game"
      >
        <Image
          className="empty-state-mark"
          src="/ai-holdem-logo.png"
          alt="AI Hold'em"
          width={270}
          height={270}
          sizes="(max-width: 450px) 60vw, 270px"
          priority
        />
        <h1>{APP_NAME}</h1>
        <p>Create a table, then invite someone to take an open seat.</p>
        <NewGameForm />
      </section>
      <section className="home-attribution" aria-label="About the bots">
        <p>
          The bots at this table use{" "}
          <a href="https://typesafe.ai/" target="_blank" rel="noreferrer">
            TypeSafe
          </a>{" "}
          for their poker decisions. View the source on{" "}
          <a
            href="https://github.com/jonime/ai-holdem"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </main>
  );
}
