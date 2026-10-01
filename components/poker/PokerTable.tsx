import { adjustTarget, clampTarget, potPresetTarget, validatedTarget } from "@/components/poker/bet-sizing";
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
  readonly amount: string;
  readonly loading: boolean;
  readonly setAmount: (value: string) => void;
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
  const selectedAmount = validatedTarget(amount, sizedAction);
  const committedStreet = human?.committedStreet ?? 0;
  const potPresetAmount = (fraction: number) => {
    if (!sizedAction) return 0;
    const call = legalAction("call");
    return potPresetTarget(sizedAction, game.poker.pot, committedStreet, call?.type === "call" ? call.amount : 0, fraction);
  };
  const submitFixedAction = (type: LegalAction["type"]) => {
    const action = legalAction(type);
    if (!action) return;
    if (action.type === "bet" || action.type === "raise") {
      if (selectedAmount === null) return;
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
                variant="muted"
                size="action"
                shortcut={legalAction("fold") ? "A" : undefined}
                disabled={!isHumanTurn || loading || !legalAction("fold")}
                onClick={() => submitFixedAction("fold")}
              >
                {t("table.fold")}
              </Button>
              <Button
                variant="green"
                size="action"
                shortcut={game.poker.street === "complete" || checkCallAction ? "S" : undefined}
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
                variant="amber"
                size="action"
                shortcut={isFoldEndedHand || sizedAction ? "D" : undefined}
                disabled={
                  loading ||
                  (isFoldEndedHand
                    ? !canRevealCards
                    : !isHumanTurn || !sizedAction || selectedAmount === null)
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
                          amount: selectedAmount === null ? "-" : formatChips(selectedAmount, locale),
                        },
                      )
                    : t("table.bet")}
              </Button>
            </div>
            <div className={styles.amountControl}>
              <label className={styles.amountHeading} htmlFor="bet-target">
                {t("table.betAmount")}
              </label>
              <div className={styles.amountInputs}>
                <div className={styles.sliderControl}>
                  <div className={styles.sliderShortcuts} aria-hidden="true">
                    <kbd>Q −</kbd>
                    <kbd>Shift ×5</kbd>
                    <kbd>E +</kbd>
                  </div>
                <input
                  type="range"
                  min={sizedAction?.minAmount ?? 0}
                  max={sizedAction?.maxAmount ?? 100}
                  step={1}
                  value={sizedAction ? clampTarget(selectedAmount ?? sizedAction.minAmount, sizedAction) : 0}
                  disabled={!sizedAction || !isHumanTurn || loading}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-label={t("table.betAmount")}
                  aria-keyshortcuts="Q E ArrowLeft ArrowRight Shift+Q Shift+E Shift+ArrowLeft Shift+ArrowRight"
                  onKeyDown={(event) => {
                    if (!sizedAction || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                    event.preventDefault();
                    setAmount(String(adjustTarget(
                      sizedAction,
                      selectedAmount,
                      game.poker.bigBlind,
                      event.key === "ArrowLeft" ? -1 : 1,
                      event.shiftKey,
                    )));
                  }}
                />
                </div>
                <input
                  id="bet-target"
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={sizedAction?.minAmount}
                  max={sizedAction?.maxAmount}
                  value={amount}
                  disabled={!sizedAction || !isHumanTurn || loading}
                  aria-invalid={Boolean(sizedAction && selectedAmount === null)}
                  aria-describedby="bet-addition"
                  onChange={(event) => setAmount(event.target.value)}
                />
                <output
                  id="bet-addition"
                  className={styles.amountAddition}
                  htmlFor="bet-target"
                  aria-label={t("table.youAdd", {
                    amount: selectedAmount === null
                      ? "-"
                      : formatChips(selectedAmount - committedStreet, locale),
                  })}
                >
                  {selectedAmount === null
                    ? "-"
                    : `+${formatChips(selectedAmount - committedStreet, locale)}`}
                </output>
              </div>
              <div className={styles.amountPresets}>
                {[0.5, 0.75, 1].map((fraction) => (
                  <Button
                    key={fraction}
                    variant="outline"
                    size="preset"
                    disabled={!sizedAction || !isHumanTurn || loading}
                    onClick={() => setAmount(String(potPresetAmount(fraction)))}
                  >
                    {fraction === 1
                      ? t("table.pot")
                      : t("table.potPercent", { percent: fraction * 100 })}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="preset"
                  disabled={!sizedAction || !isHumanTurn || loading}
                  onClick={() => {
                    if (sizedAction) setAmount(String(sizedAction.maxAmount));
                  }}
                >
                  {t("table.allIn")}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
