"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { PlayingCard } from "@/components/poker/PlayingCard";
import type { GameFeed, GameFeedEvent } from "@/components/poker/types";
import { useI18n } from "@/components/poker/I18nProvider";
import { feedEventLabel } from "@/components/poker/view-model";
import styles from "@/components/poker/ActionFeedPanel.module.css";

interface FeedHandGroup {
  readonly handNumber: number;
  readonly events: GameFeedEvent[];
}

function groupByHand(events: readonly GameFeedEvent[]): readonly FeedHandGroup[] {
  const hands: FeedHandGroup[] = [];
  for (const event of events) {
    const current = hands.at(-1);
    if (current && current.handNumber === event.handNumber) {
      current.events.push(event);
    } else {
      hands.push({ handNumber: event.handNumber, events: [event] });
    }
  }
  return hands;
}

interface FeedProps {
  readonly feed: GameFeed | null;
  readonly loading: boolean;
  readonly viewerPlayerId: string | null;
}

function FeedBody({ feed, loading, viewerPlayerId }: FeedProps) {
  const { locale, t, dictionary } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const events = feed?.events;
  const hasEvents = Boolean(events?.length);
  const following = useRef(true);
  const [paused, setPaused] = useState(false);

  const jumpToLatest = () => {
    following.current = true;
    setPaused(false);
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  };

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [events]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (following.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasEvents]);

  if (loading && !events?.length) {
    return <p className={styles.status}>{t("feed.loading")}</p>;
  }
  if (!events?.length) {
    return <p className={styles.status}>{t("feed.empty")}</p>;
  }

  return (
    <>
      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          following.current =
            node.scrollHeight - node.clientHeight - node.scrollTop <= 24;
          setPaused(!following.current);
        }}
      >
        {groupByHand(events).map((hand) => (
          <section key={hand.handNumber} className={styles.hand}>
            <div className={styles.handHeader}>
              {t("feed.hand", { hand: hand.handNumber })}
            </div>
            <ol className={styles.eventList}>
              {hand.events
                .filter((event) => event.type !== "handStarted")
                .map((event, index) => {
                  const isViewerEvent =
                    (event.type === "action" || event.type === "blind") &&
                    viewerPlayerId !== null &&
                    event.playerId === viewerPlayerId;
                  return (
                    <li
                      key={index}
                      className={[
                        event.type === "win" ? styles.winEvent : "",
                        event.type === "street" ? styles.streetEvent : "",
                        isViewerEvent ? styles.viewerEvent : "",
                      ].join(" ")}
                    >
                      {event.type === "street" ? (
                        <>
                          <h3>{dictionary.feed[event.street]}</h3>
                          {event.cards.length > 0 ? (
                            <div className={styles.boardCards}>
                              {event.cards.map((card, index) => (
                                <PlayingCard key={`${card}-${index}`} card={card} />
                              ))}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {feedEventLabel(event, locale, dictionary.feed)}
                        </>
                      )}
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}
      </div>
      {paused ? (
        <Button size="small" className={styles.latestAction} onClick={jumpToLatest}>
          {t("feed.latestAction")}
        </Button>
      ) : null}
    </>
  );
}

export function ActionFeedPanel(props: FeedProps) {
  const { t } = useI18n();
  return (
    <aside className={styles.panel} aria-label={t("feed.title")}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2>{t("feed.title")}</h2>
        </div>
      </div>
      <FeedBody {...props} />
    </aside>
  );
}

export function ActionFeedModal({
  onClose,
  ...props
}: FeedProps & { readonly onClose: () => void }) {
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
        <FeedBody {...props} />
      </div>
    </div>
  );
}
