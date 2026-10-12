import type { Metadata } from "next";
import Image from "next/image";
import logo from "@/public/ai-holdem-logo.png";
import Link from "next/link";

import styles from "@/components/poker/TableLoadingFallback.module.css";
import "./globals.css";

export const metadata: Metadata = {
  description: "This page does not exist. Return to the lobby to find a table.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en-US">
      <head>
        <title>404 — Page not found | AI Hold’em</title>
      </head>
      <body>
        <main className={styles.page}>
          <section className={styles.panel} aria-labelledby="not-found-title">
            <Image
              className={styles.icon}
              src={logo}
              alt=""
              width={200}
              height={200}
              sizes="200px"
              loading="eager"
            />
            <p className={styles.brand}>AI Hold’em · 404</p>
            <h1 id="not-found-title">Page not found</h1>
            <p className={styles.guidance}>
              This page doesn’t exist. Check the link or head back to the lobby
              to find a table.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primary} href="/play">Lobby</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
