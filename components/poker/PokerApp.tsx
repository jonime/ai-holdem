"use client";
import { Modal } from "./Modal";
import { turnRemainingMs } from "./turn-clock";
import Link from "next/link";

import { hasAutomaticTurn } from "./bot-advancement";
import { GameHeader } from "./GameHeader";
import { addLocalePrefix } from "@/lib/i18n";
import { botErrorMessage } from "./bot-error";
import { HttpError, api } from "@/lib/http/api";

import { useEffect, useRef, useState } from "react";

import {
  ActionFeedModal,
  ActionFeedPanel,
} from "@/components/poker/ActionFeedPanel";
import { Button } from "@/components/Button";
import { useI18n } from "@/components/poker/I18nProvider";
import { LobbyPanel } from "@/components/poker/LobbyPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import styles from "@/components/poker/PokerApp.module.css";
import { useGameSession } from "@/components/poker/useGameSession";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import {
  arrangeSeats,
  arrangeSeatsLinear,
  resolveViewer,
  latestActionsForStreet,
  tableFlow,
  canAdvanceBots,
} from "@/components/poker/view-model";

import { adjustTarget, decisionScope, validatedTarget } from "@/components/poker/bet-sizing";

const playerNameStorageKey = "ai-holdem-player-name";
const feedCollapsedStorageKey = "ai-holdem-feed-collapsed";

export default function PokerApp({ gameId }: { readonly gameId?: string }) {
  const { locale, t } = useI18n();
  const replayPending = useRef(false);
  const [replaying, setReplaying] = useState(false);
  const [creationNotice, setCreationNotice] = useState<{ until: number; message: string } | null>(null);
  const [creationWait, setCreationWait] = useState(0);
  useEffect(() => {
    if (!creationNotice) return;
    const timer = setInterval(() => setCreationWait(Math.max(0, creationNotice.until - Date.now())), 250);
    return () => clearInterval(timer);
  }, [creationNotice]);
  const [replayError, setReplayError] = useState(false);
  const [playerName, setPlayerName] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(playerNameStorageKey) ?? ""),
  );
  const [playerNameEdited, setPlayerNameEdited] = useState(false);
  const [amountDraft, setAmountDraft] = useState({ scope: "", value: "" });
  const [overlay, setOverlay] = useState<"none" | "actions" | "join">("none");
  const openerRef = useRef<HTMLElement | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const joinPending = useRef(false);
  const openOverlay = (next: "actions" | "join", opener: HTMLElement) => {
    openerRef.current = opener;
    setOverlay(next);
  };
  const [feedCollapsed, setFeedCollapsed] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 900px)").matches ||
        window.localStorage.getItem(feedCollapsedStorageKey) === "true",
  );

  const toggleFeedCollapsed = () => {
    setFeedCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(feedCollapsedStorageKey, String(next));
      return next;
    });
  };

  const toggleFeed = (opener: HTMLButtonElement) => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      const next = overlay !== "actions";
      if (next) openOverlay("actions", opener);
      else setOverlay("none");
      setFeedCollapsed(!next);
      window.localStorage.setItem(feedCollapsedStorageKey, String(!next));
      return;
    }
    toggleFeedCollapsed();
  };

  const closeFeedModal = () => {
    setOverlay("none");
    setFeedCollapsed(true);
    window.localStorage.setItem(feedCollapsedStorageKey, "true");
  };

  const {
    game,
    unavailable,
    botCatalog,
    feed,
    feedLoading,
    loading,
    navigationLoading,
    requestBusy,
    recoveryBlocked,
    refreshing,
    refreshGame,
    error,
    claimSeatAt,
    updatePlayerName,
    assignBot,
    releaseSeat,
    startWaitingGame,
    submitAction,
    beginNextHand,
    revealCards,
    retryBotTurn,
    usageLimited,
    usageRetryAfterMs,
    refreshDirectoryState,
  } = useGameSession(gameId);

  const viewerToken = getClientPlayerToken();
  const { viewerPlayer, human } = resolveViewer(
    game?.poker.players ?? [],
    viewerToken,
  );

  const canStartNextHand = game ? tableFlow(game.poker.players, game.poker.street, viewerToken, game.viewerIsHost, game.poker.seats).canStartNextHand : false;
  const newQuickPlay = async (botMode?: "rules") => {
    if (loading || replayPending.current || (creationNotice?.until ?? 0) > Date.now()) return;
    replayPending.current = true;
    setReplaying(true);
    setReplayError(false);
    setCreationNotice(null);
    setCreationWait(0);
    try {
      const body = await api.creation.quickPlay({ lang: locale, botMode });
      // Full navigation installs the new table with the refreshed identity cookies.
      window.location.assign(addLocalePrefix(`/game/${body.gameId}`, locale));
    } catch (requestError) {
      if (requestError instanceof HttpError && requestError.code === "GAME_CREATION_LIMIT" && requestError.retryAfterMs) {
        setCreationNotice({ until: Date.now() + requestError.retryAfterMs, message: botErrorMessage(requestError, t) });
        setCreationWait(requestError.retryAfterMs);
      } else setReplayError(true);
      replayPending.current = false;
      setReplaying(false);
    }
  };

  const displayedPlayerName =
    viewerPlayer?.controller === "human" && !playerNameEdited
      ? viewerPlayer.name
      : playerName;
  const sizedAction = game?.poker.legalActions.find(
    (
      action,
    ): action is Extract<
      (typeof game)["poker"]["legalActions"][number],
      { type: "bet" | "raise" }
    > => action.type === "bet" || action.type === "raise",
  );
  const amountScope = decisionScope(game?.id, game?.version, viewerPlayer?.id);
  const defaultAmount = String(sizedAction?.minAmount ?? "");
  // Adjust during render so a changed authoritative context cannot expose an old draft.
  if (amountDraft.scope !== amountScope) {
    setAmountDraft({ scope: amountScope, value: defaultAmount });
  }
  const amount = amountDraft.scope === amountScope ? amountDraft.value : defaultAmount;
  const selectedAmount = validatedTarget(amount, sizedAction);
  const setAmount = (value: string) => {
    setAmountDraft({ scope: amountScope, value });
  };
  const isHumanTurn =
    viewerPlayer !== null &&
    viewerPlayer.controller === "human" &&
    viewerPlayer.status === "claimed" && !viewerPlayer.leaving &&
    game?.poker.currentActorId === viewerPlayer.id;
  const ownedSeat = (game?.poker.seats ?? game?.poker.players ?? []).find(seat =>
    seat.controller === "human" && seat.status === "claimed" && viewerToken !== null && seat.playerToken === viewerToken);
  const isSpectator = viewerPlayer === null && !ownedSeat && Boolean(game);
  if (overlay === "join" && !isSpectator) setOverlay("none");
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
  const latestActions = latestActionsForStreet(
    feed?.events ?? [],
    game?.poker.players ?? [],
    game?.poker.handNumber ?? 0,
    game?.poker.street ?? null,
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (overlay !== "none") return;
      const completedHand = game?.poker.street === "complete";

      if (
        !game ||
        (!completedHand && (turnRemainingMs(game) ?? 1) <= 0) ||
        (!isHumanTurn && !canStartNextHand && !(completedHand && canRevealCards)) ||
        loading || replaying || replayPending.current ||
        event.defaultPrevented ||
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
        ((target instanceof HTMLInputElement && target.type !== "range") ||
          ["TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (target instanceof HTMLElement && target.closest("button, a") &&
        ["enter", " "].includes(key)) return;
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

      if (key === "d" && sizedAction && selectedAmount !== null) {
        event.preventDefault();
        void submitAction(
          sizedAction,
          selectedAmount,
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
        const direction = key === "q" || key === "arrowleft" ? -1 : 1;
        setAmountDraft({
          scope: amountScope,
          value: String(adjustTarget(sizedAction, selectedAmount, game.poker.bigBlind, direction, event.shiftKey)),
        });
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [
    overlay,
    selectedAmount,
    amountScope,
    game,
    beginNextHand,
    canRevealCards,
    canStartNextHand,
    replaying,
    isHumanTurn,
    loading,
    sizedAction,
    submitAction,
    revealCards,
    viewerPlayer,
  ]);

  return (
    <>
    <GameHeader game={game} mutationsBlocked={recoveryBlocked} loading={navigationLoading || replaying} onLeave={releaseSeat} />
    <main className={styles.pokerApp}>
      {creationNotice ? <p className={styles.errorBanner} role="alert">{creationNotice.message} {t("errors.retryAvailable", { seconds: Math.ceil(creationWait / 1000) })}</p> : null}
      {error ? (
        <p className={styles.errorBanner} role="alert">
          {error}
          {recoveryBlocked ? <Button className={styles.recoveryButton} size="small" disabled={refreshing} onClick={refreshGame}>{t("errors.refreshTable")}</Button> : null}
          {usageLimited ? <> <span>{t("errors.retryAvailable", { seconds: Math.ceil(usageRetryAfterMs / 1000) })}</span> <Button size="small" disabled={loading || replaying || creationWait > 0} onClick={() => void newQuickPlay("rules")}>{t("errors.rulesOnlyGame")}</Button></> : null}
          {game && canAdvanceBots(game, viewerToken) && hasAutomaticTurn(game) ? (
            <Button
              size="small"
              disabled={loading || replaying || usageRetryAfterMs > 0}
              onClick={() => { if (!replayPending.current) void retryBotTurn(); }}
            >
              {t(game?.poker.players.find(player => player.id === game.poker.currentActorId)?.controller === "human"
                ? game.poker.players.find(player => player.id === game.poker.currentActorId)?.leaving ? "gameHeader.retryDeparture" : "timer.retry" : "errors.retryBot")}
            </Button>
          ) : null}
        </p>
      ) : null}
      {unavailable ? (
        <Link href={addLocalePrefix("/play", locale)}>{t("gameHeader.lobby")}</Link>
      ) : !game ? (
        <div className="route-loading" aria-label={t("table.waiting")} />
      ) : game.status === "waiting" ? (
        <LobbyPanel
          busy={requestBusy}
          game={game}
          botCatalog={botCatalog}
          loading={loading}
          playerName={displayedPlayerName}
          setPlayerName={(name) => {
            setPlayerName(name);
            setPlayerNameEdited(true);
          }}
          viewerToken={viewerToken}
          onSavePlayerName={(seat) => {
            void updatePlayerName(seat, displayedPlayerName).then((updated) => {
              if (updated) setPlayerNameEdited(false);
            });
          }}
          onClaimSeatAt={(seat) => {
            void claimSeatAt(seat, displayedPlayerName).then((claimed) => {
              if (claimed) setPlayerNameEdited(false);
            });
          }}
          onAssignBot={(seat, difficulty, botId, botProfileId) =>
            void assignBot(seat, difficulty, botId, botProfileId)
          }
          onReleaseSeat={(seat) => void releaseSeat(seat)}
          onStartWaitingGame={(settings) => void startWaitingGame(settings)}
          onRefresh={refreshDirectoryState}
        />
      ) : (
        <div ref={tableRef} tabIndex={-1} className={styles.gameLayout}>
          <div
            className={`${styles.tableRow} ${feedCollapsed ? styles.feedCollapsed : ""}`}
          >
            <PokerTable
              busy={requestBusy}
              game={game}
              seatRows={seatRows}
              linearSeats={linearSeats}
              human={human}
              viewerToken={viewerToken}
              isSpectator={isSpectator}
              canStartNextHand={canStartNextHand}
              replaying={replaying}
              replayError={replayError}
              onNewQuickPlay={() => void newQuickPlay()}
              isHumanTurn={isHumanTurn}
              sizedAction={sizedAction}
              amount={amount}
              loading={loading || replaying || creationWait > 0}
              setAmount={setAmount}
              onClaimFirstOpenSeat={(opener) => {
                openOverlay("join", opener);
              }}
              onStandUp={() => {
                if (ownedSeat && !replayPending.current) void releaseSeat(ownedSeat.seat);
              }}
              onSubmitAction={(action, amountOverride = selectedAmount) => {
                if (replayPending.current) return;
                if ((action.type === "bet" || action.type === "raise") && amountOverride === null) return;
                void submitAction(action, amountOverride);
              }}
              onBeginNextHand={() => { if (!replayPending.current) void beginNextHand(); }}
              onRevealCards={() => { if (!replayPending.current) void revealCards(); }}
              feedCollapsed={feedCollapsed}
              onToggleFeed={toggleFeed}
              latestActions={latestActions}
            />
            {feedCollapsed ? null : (
              <div className={styles.feedColumn}>
                <div className={styles.desktopFeed}>
                  <ActionFeedPanel feed={feed} loading={feedLoading} viewerPlayerId={viewerPlayer?.id ?? null} />
                </div>
              </div>
            )}
          </div>
          {overlay === "actions" ? (
            <ActionFeedModal
              viewerPlayerId={viewerPlayer?.id ?? null}
              feed={feed}
              loading={feedLoading}
              onClose={closeFeedModal}
              restoreFocus={openerRef}
              fallbackFocus={tableRef}
            />
          ) : null}
          {overlay === "join" && isSpectator ? (
            <Modal open title={t("table.joinTitle")} onDismiss={() => setOverlay("none")}
              initialFocus={nameRef} restoreFocus={openerRef} fallbackFocus={tableRef}
              className={styles.joinDialog}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (loading || joinPending.current) return;
                  const openSeat = (game.poker.seats ?? game.poker.players).find(
                    (player) => player.status === "open",
                  );
                  if (!openSeat) {
                    setOverlay("none");
                    return;
                  }
                  joinPending.current = true;
                  void claimSeatAt(openSeat.seat, displayedPlayerName).then(
                    (joined) => {
                      if (joined) {
                        setPlayerNameEdited(false);
                        setOverlay("none");
                      }
                    },
                  ).finally(() => { joinPending.current = false; });
                }}
              >
                <h2 id="join-table-title">{t("table.joinTitle")}</h2>
                <p>{t("table.joinInstructions")}</p>
                <label>
                  <span>{t("lobby.yourName")}</span>
                  <input
                    ref={nameRef}
                    type="text"
                    value={displayedPlayerName}
                    maxLength={30}
                    placeholder={t("lobby.anonymous")}
                    onChange={(event) => {
                      setPlayerName(event.target.value);
                      setPlayerNameEdited(true);
                    }}
                  />
                </label>
                <div className={styles.joinActions}>
                  <Button
                    disabled={loading}
                    onClick={() => setOverlay("none")}
                  >
                    {t("table.joinCancel")}
                  </Button>
                  <Button variant="primary" type="submit" disabled={loading}>
                    {requestBusy ? t("table.claimingSeat") : t("table.joinConfirm")}
                  </Button>
                </div>
              </form>
            </Modal>
          ) : null}
        </div>
      )}
    </main>
    </>
  );
}
