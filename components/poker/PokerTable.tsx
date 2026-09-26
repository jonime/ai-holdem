import { PlayingCard } from "@/components/poker/PlayingCard";
import { Button } from "@/components/Button";
import { Seat } from "@/components/poker/Seat";
import styles from "@/components/poker/PokerTable.module.css";
import type {
  Game,
  LegalAction,
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { findGameWinnerId, formatChips } from "@/components/poker/view-model";
import { useI18n } from "@/components/poker/I18nProvider";

export function PokerTable({
  game,
  seatRows,
  linearSeats,
  human,
  viewerToken,
  isSpectator,
  canStartNextHand,
  isHumanTurn,
  sizedAction,
  amount,
  loading,
  setAmount,
  onClaimFirstOpenSeat,
  onStandUp,
  onSubmitAction,
  onBeginNextHand,
  onRevealCards,
  onOpenHistory,
  feedCollapsed,
  onToggleFeed,
  latestActions,
}: {
  readonly game: Game;
  readonly seatRows: {
    readonly top: readonly PublicPokerPlayer[];
    readonly bottom: readonly PublicPokerPlayer[];
  };
  readonly linearSeats: readonly PublicPokerPlayer[];
  readonly human: PublicPokerPlayer | null;
  readonly viewerToken: string | null;
  readonly isSpectator: boolean;
  readonly canStartNextHand: boolean;
  readonly isHumanTurn: boolean;
  readonly sizedAction:
    | Extract<LegalAction, { type: "bet" | "raise" }>
    | undefined;
  readonly amount: number | null;
  readonly loading: boolean;
  readonly setAmount: (value: number | null) => void;
  readonly onClaimFirstOpenSeat: () => void;
  readonly onStandUp: () => void;
  readonly onSubmitAction: (
    action: LegalAction,
    amountOverride?: number | null,
  ) => void;
  readonly onBeginNextHand: () => void;
  readonly onRevealCards: () => void;
  readonly onOpenHistory: () => void;
  readonly feedCollapsed: boolean;
  readonly onToggleFeed: () => void;
  readonly latestActions: Readonly<Record<string, LatestPlayerAction>>;
}) {
  const { locale, t } = useI18n();
  const gameWinnerId = findGameWinnerId(game.poker.players, game.poker.street);
  const gameOver = gameWinnerId !== null;
  const canRevealCards =
    game.poker.street === "complete" &&
    game.poker.completionReason === "fold" &&
    human?.playerToken === viewerToken &&
    human.holeCards !== null &&
    !human.cardsRevealed;
  const isFoldEndedHand =
    game.poker.street === "complete" && game.poker.completionReason === "fold";
  const legalAction = (type: LegalAction["type"]) =>
    game.poker.legalActions.find((action) => action.type === type);
  const checkCallAction = legalAction("check") ?? legalAction("call");
  const botOnlyGame = game.poker.players
    .filter((player) => player.status === "claimed" || player.status === "bot")
    .every((player) => player.controller === "bot");
  const selectedAmount = sizedAction
    ? Math.min(
        sizedAction.maxAmount,
        Math.max(sizedAction.minAmount, amount ?? sizedAction.minAmount),
      )
    : null;
  const potPresetAmount = (fraction: number) => {
    if (!sizedAction) return 0;
    const call = legalAction("call");
    const callAmount = call?.type === "call" ? call.amount : 0;
    const target =
      sizedAction.type === "raise"
        ? callAmount + Math.round(game.poker.pot * fraction)
        : Math.round(game.poker.pot * fraction);
    return Math.min(
      sizedAction.maxAmount,
      Math.max(sizedAction.minAmount, target),
    );
  };
  const submitFixedAction = (type: LegalAction["type"]) => {
    const action = legalAction(type);
    if (!action) return;
    if (
      (action.type === "bet" || action.type === "raise") &&
      selectedAmount !== null
    ) {
      onSubmitAction(action, selectedAmount);
      return;
    }
    onSubmitAction(action);
  };

  return (
    <section className={styles.tableShell}>
      <div className={styles.tableMeta}>
        <span>{t("table.hand", { hand: game.poker.handNumber })}</span>
        <span>
          {game.poker.street
            ? t(`table.${game.poker.street}`)
            : t("table.waiting")}
        </span>
        <div className={styles.tableMetaActions}>
          {human?.playerToken === viewerToken ? (
            <Button
              variant="ghost"
              size="small"
              className={styles.standUpToggle}
              disabled={loading || human.leaving}
              onClick={onStandUp}
            >
              {human.leaving ? t("table.leaving") : t("table.standUp")}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="small"
            className={styles.historyToggle}
            onClick={onOpenHistory}
          >
            {t("table.history")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            className={styles.feedToggle}
            onClick={onToggleFeed}
            aria-pressed={!feedCollapsed}
            aria-label={t(feedCollapsed ? "feed.expand" : "feed.collapse")}
          >
            {t(feedCollapsed ? "feed.title" : "feed.hide")}
          </Button>
        </div>
      </div>
      <div className={styles.felt}>
        <div
          className={`${styles.seatRow} ${styles.topRow} ${styles.desktopSeats}`}
        >
          {seatRows.top.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
            />
          ))}
        </div>
        <div className={styles.centerTable}>
          <div className={styles.pot}>
            {t("table.pot")}{" "}
            <strong>{formatChips(game.poker.pot, locale)}</strong>
          </div>
          <div className={styles.communityCards}>
            {[
              ...game.poker.communityCards,
              ...Array(Math.max(0, 5 - game.poker.communityCards.length)).fill(
                "",
              ),
            ].map((card, index) => (
              <PlayingCard key={`${card}-${index}`} card={card || undefined} />
            ))}
          </div>
        </div>
        <div
          className={`${styles.seatRow} ${styles.bottomRow} ${styles.desktopSeats}`}
        >
          {seatRows.bottom.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
            />
          ))}
        </div>
        <div className={styles.mobileSeats}>
          {linearSeats.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              winner={game.poker.winnerIds.includes(player.id)}
              winnerAmount={game.poker.winnerAmounts[player.id] ?? null}
              latestAction={latestActions[player.id] ?? null}
              dealerSeat={game.poker.dealerSeat}
              smallBlindSeat={game.poker.smallBlindSeat}
              bigBlindSeat={game.poker.bigBlindSeat}
              gameWinner={player.id === gameWinnerId}
            />
          ))}
        </div>
      </div>
      <section className={styles.actionTray}>
        {isSpectator ? (
          <div className={styles.actionControls}>
            {botOnlyGame && !gameOver ? (
              <Button
                variant="primary"
                disabled={
                  loading ||
                  game.poker.street !== "complete" ||
                  !canStartNextHand
                }
                onClick={onBeginNextHand}
              >
                {t("table.nextHand")}
              </Button>
            ) : !botOnlyGame &&
              game.poker.players.some((player) => player.status === "open") ? (
              <Button
                variant="primary"
                disabled={loading}
                onClick={onClaimFirstOpenSeat}
              >
                {loading ? t("table.claimingSeat") : t("table.sitOpenSeat")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className={styles.actionControls}>
              <Button
                disabled={!isHumanTurn || loading || !legalAction("fold")}
                onClick={() => submitFixedAction("fold")}
              >
                {t("table.fold")}
              </Button>
              <Button
                disabled={
                  loading ||
                  gameOver ||
                  (game.poker.street === "complete"
                    ? human?.playerToken !== viewerToken
                    : !isHumanTurn || !checkCallAction)
                }
                onClick={() => {
                  if (game.poker.street === "complete") {
                    onBeginNextHand();
                  } else if (checkCallAction) {
                    submitFixedAction(checkCallAction.type);
                  }
                }}
              >
                {game.poker.street === "complete"
                  ? loading
                    ? t("table.preparing")
                    : t("table.nextHand")
                  : checkCallAction?.type === "call"
                    ? t("table.call", {
                        amount: formatChips(checkCallAction.amount, locale),
                      })
                    : t("table.check")}
              </Button>
              <Button
                disabled={
                  loading ||
                  (isFoldEndedHand
                    ? !canRevealCards
                    : !isHumanTurn || !sizedAction)
                }
                onClick={() => {
                  if (isFoldEndedHand) {
                    onRevealCards();
                  } else if (sizedAction) {
                    submitFixedAction(sizedAction.type);
                  }
                }}
              >
                {isFoldEndedHand
                  ? t("table.show")
                  : sizedAction
                    ? t(
                        sizedAction.type === "raise"
                          ? "table.raiseTo"
                          : "table.betTo",
                        {
                          amount: formatChips(
                            selectedAmount ?? sizedAction.minAmount,
                            locale,
                          ),
                        },
                      )
                    : t("table.bet")}
              </Button>
            </div>
            <div className={styles.amountControl}>
              <div className={styles.amountHeading}>
                <span>{t("table.betSize")}</span>
                <strong>
                  {sizedAction && selectedAmount !== null
                    ? formatChips(selectedAmount, locale)
                    : "-"}
                </strong>
              </div>
              <input
                type="range"
                min={sizedAction?.minAmount ?? 0}
                max={sizedAction?.maxAmount ?? 100}
                value={
                  sizedAction ? (selectedAmount ?? sizedAction.minAmount) : 0
                }
                disabled={!sizedAction || !isHumanTurn || loading}
                onChange={(event) => setAmount(Number(event.target.value))}
                aria-label={t("table.betAmount")}
              />
              <div className={styles.amountPresets}>
                {[0.5, 0.75, 1].map((fraction) => (
                  <Button
                    key={fraction}
                    size="small"
                    disabled={!sizedAction || !isHumanTurn || loading}
                    onClick={() => setAmount(potPresetAmount(fraction))}
                  >
                    {fraction === 1
                      ? t("table.pot")
                      : t("table.potPercent", { percent: fraction * 100 })}
                  </Button>
                ))}
                <Button
                  size="small"
                  disabled={!sizedAction || !isHumanTurn || loading}
                  onClick={() => {
                    if (sizedAction) setAmount(sizedAction.maxAmount);
                  }}
                >
                  {t("table.max")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
