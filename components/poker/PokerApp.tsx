"use client";

import { useEffect, useState } from "react";

import {
  ActionFeedModal,
  ActionFeedPanel,
} from "@/components/poker/ActionFeedPanel";
import { HistoryModal } from "@/components/poker/HistoryModal";
import { useI18n } from "@/components/poker/I18nProvider";
import { LobbyPanel } from "@/components/poker/LobbyPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import styles from "@/components/poker/PokerApp.module.css";
import { useGameSession } from "@/components/poker/useGameSession";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import {
  arrangeSeats,
  arrangeSeatsLinear,
  availableHistoryHands,
  resolveViewer,
} from "@/components/poker/view-model";

const playerNameStorageKey = "ai-holdem-player-name";
const feedCollapsedStorageKey = "ai-holdem-feed-collapsed";

export default function PokerApp({ gameId }: { readonly gameId?: string }) {
  const { t } = useI18n();
  const [playerName, setPlayerName] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(playerNameStorageKey) ?? ""),
  );
  const [amount, setAmount] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [feedCollapsed, setFeedCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 900px)").matches ||
        window.localStorage.getItem(feedCollapsedStorageKey) === "true",
  );
  const [feedModalOpen, setFeedModalOpen] = useState(false);

  const toggleFeedCollapsed = () => {
    setFeedCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(feedCollapsedStorageKey, String(next));
      return next;
    });
  };

  const toggleFeed = () => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      const next = !feedModalOpen;
      setFeedModalOpen(next);
      setFeedCollapsed(!next);
      window.localStorage.setItem(feedCollapsedStorageKey, String(!next));
      return;
    }
    toggleFeedCollapsed();
  };

  const closeFeedModal = () => {
    setFeedModalOpen(false);
    setFeedCollapsed(true);
    window.localStorage.setItem(feedCollapsedStorageKey, "true");
  };

  const {
    game,
    botCatalog,
    history,
    historyLoading,
    feed,
    feedLoading,
    selectedHistoryHand,
    liveDecisions,
    loading,
    error,
    claimSeatAt,
    assignBot,
    releaseSeat,
    updateTableSettings,
    startWaitingGame,
    submitAction,
    beginNextHand,
    revealCards,
    retryBotTurn,
    selectHistoryHand,
  } = useGameSession(gameId, historyOpen);

  const viewerToken = getClientPlayerToken();
  const { viewerPlayer, human } = resolveViewer(
    game?.poker.players ?? [],
    viewerToken,
  );
  const sizedAction = game?.poker.legalActions.find(
    (
      action,
    ): action is Extract<
      (typeof game)["poker"]["legalActions"][number],
      { type: "bet" | "raise" }
    > => action.type === "bet" || action.type === "raise",
  );
  const isHumanTurn =
    viewerPlayer !== null &&
    viewerPlayer.controller === "human" &&
    game?.poker.currentActorId === viewerPlayer.id;
  const isSpectator = viewerPlayer === null && Boolean(game);
  const canRevealCards =
    game?.poker.street === "complete" &&
    game.poker.completionReason === "fold" &&
    human?.playerToken === viewerToken &&
    human.holeCards !== null &&
    !human.cardsRevealed;
  const seatRows = arrangeSeats(
    game?.poker.players ?? [],
    viewerPlayer?.id ?? null,
  );
  const linearSeats = arrangeSeatsLinear(
    game?.poker.players ?? [],
    viewerPlayer?.id ?? null,
  );
  const displayedHistoryHand = selectedHistoryHand ?? game?.poker.handNumber;
  const currentHistory =
    history && history.handNumber === displayedHistoryHand
      ? history.value
      : null;
  const availableHands = game
    ? availableHistoryHands(game.poker.handNumber)
    : [];
  const latestActions = Object.fromEntries(
    (currentHistory?.actions ?? [])
      .filter((action) => action.street === game?.poker.street)
      .flatMap((action) => {
        const player = game?.poker.players.find(
          (candidate) => candidate.name === action.player,
        );
        return player ? [[player.id, action] as const] : [];
      }),
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const completedHand = game?.poker.street === "complete";
      const canStartNextHand =
        completedHand && viewerPlayer?.controller === "human";
      if (
        !game ||
        (!isHumanTurn && !canStartNextHand) ||
        loading ||
        historyOpen ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (canStartNextHand && ["s", "enter", " "].includes(key)) {
        event.preventDefault();
        void beginNextHand();
        return;
      }

      if (completedHand) {
        if (key === "d" && canRevealCards) {
          event.preventDefault();
          void revealCards();
        }
        return;
      }

      const actionByKey = {
        a: game.poker.legalActions.find((action) => action.type === "fold"),
        s: game.poker.legalActions.find(
          (action) => action.type === "check" || action.type === "call",
        ),
      };
      const action = key === "a" || key === "s" ? actionByKey[key] : null;

      if (action) {
        event.preventDefault();
        void submitAction(
          action,
          action.type === "call" ? action.amount : null,
        );
        return;
      }

      if (key === "d" && sizedAction) {
        event.preventDefault();
        void submitAction(
          sizedAction,
          Math.min(
            sizedAction.maxAmount,
            Math.max(sizedAction.minAmount, amount ?? sizedAction.minAmount),
          ),
        );
        return;
      }

      if (
        (key === "q" ||
          key === "e" ||
          key === "arrowleft" ||
          key === "arrowright") &&
        sizedAction
      ) {
        event.preventDefault();
        const currentAmount = Math.min(
          sizedAction.maxAmount,
          Math.max(sizedAction.minAmount, amount ?? sizedAction.minAmount),
        );
        const direction = key === "q" || key === "arrowleft" ? -1 : 1;
        setAmount(
          Math.min(
            sizedAction.maxAmount,
            Math.max(
              sizedAction.minAmount,
              currentAmount + direction * game.poker.bigBlind,
            ),
          ),
        );
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    amount,
    game,
    beginNextHand,
    canRevealCards,
    historyOpen,
    isHumanTurn,
    loading,
    sizedAction,
    submitAction,
    revealCards,
    viewerPlayer,
  ]);

  return (
    <main className={styles.pokerApp}>
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
          {game?.poker.players.some(
            (player) =>
              player.id === game.poker.currentActorId &&
              player.controller === "bot",
          ) ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void retryBotTurn()}
            >
              {t("errors.retryBot")}
            </button>
          ) : null}
        </p>
      ) : null}
      {!game ? (
        <div className="route-loading" aria-label={t("table.waiting")} />
      ) : game.status === "waiting" ? (
        <LobbyPanel
          game={game}
          botCatalog={botCatalog}
          loading={loading}
          playerName={playerName}
          setPlayerName={setPlayerName}
          viewerToken={viewerToken}
          onClaimSeatAt={(seat) => void claimSeatAt(seat, playerName)}
          onAssignBot={(seat, difficulty, botId) =>
            void assignBot(seat, difficulty, botId)
          }
          onReleaseSeat={(seat) => void releaseSeat(seat)}
          onApplyTableSettings={(settings) =>
            void updateTableSettings(settings)
          }
          onStartWaitingGame={(settings) => void startWaitingGame(settings)}
        />
      ) : (
        <div className={styles.gameLayout}>
          <div
            className={`${styles.tableRow} ${feedCollapsed ? styles.feedCollapsed : ""}`}
          >
            <PokerTable
              game={game}
              seatRows={seatRows}
              linearSeats={linearSeats}
              human={human}
              viewerToken={viewerToken}
              isSpectator={isSpectator}
              canStartNextHand={game.viewerIsHost}
              isHumanTurn={isHumanTurn}
              sizedAction={sizedAction}
              amount={amount}
              loading={loading}
              setAmount={setAmount}
              onClaimFirstOpenSeat={() => {
                const openSeat = game.poker.players.find(
                  (player) => player.status === "open",
                );
                if (openSeat) {
                  void claimSeatAt(openSeat.seat, playerName);
                }
              }}
              onStandUp={() => {
                if (human) void releaseSeat(human.seat);
              }}
              onSubmitAction={(action, amountOverride = amount ?? null) =>
                void submitAction(action, amountOverride)
              }
              onBeginNextHand={() => void beginNextHand()}
              onRevealCards={() => void revealCards()}
              onOpenHistory={() => setHistoryOpen(true)}
              feedCollapsed={feedCollapsed}
              onToggleFeed={toggleFeed}
              latestActions={latestActions}
            />
            {feedCollapsed ? null : (
              <div className={styles.feedColumn}>
                <div className={styles.desktopFeed}>
                  <ActionFeedPanel
                    feed={feed}
                    loading={feedLoading}
                  />
                </div>
              </div>
            )}
          </div>
          {feedModalOpen ? (
            <ActionFeedModal
              feed={feed}
              loading={feedLoading}
              onClose={closeFeedModal}
            />
          ) : null}
          {historyOpen && displayedHistoryHand ? (
            <HistoryModal
              onClose={() => setHistoryOpen(false)}
              handNumber={displayedHistoryHand}
              history={currentHistory}
              loading={historyLoading}
              availableHands={availableHands}
              onSelectHand={(hand) => selectHistoryHand(hand)}
              liveDecisions={
                displayedHistoryHand === game?.poker.handNumber
                  ? liveDecisions
                  : []
              }
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
