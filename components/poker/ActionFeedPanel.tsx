"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import type { GameFeed, GameFeedEvent } from "@/components/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import { feedEventLabel } from "@/components/poker/view-model";
import styles from "@/components/poker/ActionFeedPanel.module.css";

interface FeedHandGroup {
  readonly handNumber: number;
  readonly events: readonly GameFeedEvent[];
}

function groupByHand(
  events: readonly GameFeedEvent[],
): readonly FeedHandGroup[] {
  const hands: FeedHandGroup[] = [];
  for (const event of events) {
    const current = hands.at(-1);
    if (current && current.handNumber === event.handNumber) {
      (current.events as GameFeedEvent[]).push(event);
    } else {
      hands.push({ handNumber: event.handNumber, events: [event] });
    }
  }
  return hands;
}

function FeedBody({
  feed,
  loading,
}: {
  readonly feed: GameFeed | null;
  readonly loading: boolean;
}) {
  const { locale, t, dictionary } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const events = feed?.events ?? [];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [events.length]);

  if (loading && events.length === 0) {
    return <p className={styles.status}>{t("feed.loading")}</p>;
  }
  if (events.length === 0) {
    return <p className={styles.status}>{t("feed.empty")}</p>;
  }

  return (
    <div className={styles.scroll} ref={scrollRef}>
      {groupByHand(events).map((hand) => (
        <section key={hand.handNumber} className={styles.hand}>
          <div className={styles.handHeader}>
            {t("feed.hand", { hand: hand.handNumber })}
          </div>
          <ol className={styles.eventList}>
            {hand.events
              .filter((event) => event.type !== "handStarted")
              .map((event, index) => (
                <li
                  key={index}
                  className={event.type === "win" ? styles.winEvent : undefined}
                >
                  {feedEventLabel(event, locale, dictionary.feed)}
                </li>
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

export function ActionFeedPanel({
  feed,
  loading,
}: {
  readonly feed: GameFeed | null;
  readonly loading: boolean;
}) {
  const { t } = useI18n();

  return (
    <aside className={styles.panel} aria-label={t("feed.title")}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2>{t("feed.title")}</h2>
        </div>
      </div>
      <FeedBody feed={feed} loading={loading} />
    </aside>
  );
}

export function ActionFeedModal({
  feed,
  loading,
  onClose,
}: {
  readonly feed: GameFeed | null;
  readonly loading: boolean;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("feed.title")}
    >
      <div className={styles.modalBackdrop} onClick={onClose} />
      <div className={styles.modalDialog}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2>{t("feed.title")}</h2>
          </div>
          <Button
            variant="icon"
            className={styles.modalClose}
            onClick={onClose}
            aria-label={t("feed.close")}
          >
            ×
          </Button>
        </div>
        <FeedBody feed={feed} loading={loading} />
      </div>
    </div>
  );
}
