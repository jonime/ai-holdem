import { PlayingCard } from "@/components/poker/PlayingCard";
import { Seat } from "@/components/poker/Seat";
import type {
  Game,
  LegalAction,
  LatestPlayerAction,
  PublicPokerPlayer,
} from "@/components/poker/types";
import { formatChips } from "@/components/poker/view-model";

export function PokerTable({
  game,
  seatRows,
  human,
  viewerToken,
  isSpectator,
  isHumanTurn,
  sizedAction,
  amount,
  loading,
  setAmount,
  onClaimFirstOpenSeat,
  onStandUp,
  onSubmitAction,
  onBeginNextHand,
  onOpenHistory,
  handResult,
  latestActions,
}: {
  readonly game: Game;
  readonly seatRows: {
    readonly top: readonly PublicPokerPlayer[];
    readonly bottom: readonly PublicPokerPlayer[];
  };
  readonly human: PublicPokerPlayer;
  readonly viewerToken: string | null;
  readonly isSpectator: boolean;
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
  readonly onOpenHistory: () => void;
  readonly handResult: string | null;
  readonly latestActions: Readonly<Record<string, LatestPlayerAction>>;
}) {
  const legalAction = (type: LegalAction["type"]) =>
    game.poker.legalActions.find((action) => action.type === type);
  const checkCallAction = legalAction("check") ?? legalAction("call");
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
    <section className="table-shell">
      <div className="table-meta">
        <span>HAND {game.poker.handNumber}</span>
        <span>{game.poker.street?.toUpperCase() ?? "WAITING"}</span>
        <div className="table-meta-actions">
          {human.playerToken === viewerToken ? (
            <button
              type="button"
              className="stand-up-toggle"
              disabled={loading || human.leaving}
              onClick={onStandUp}
            >
              {human.leaving ? "Leaving" : "Stand up"}
            </button>
          ) : null}
          <button
            type="button"
            className="history-toggle"
            onClick={onOpenHistory}
          >
            History
          </button>
        </div>
      </div>
      <div className="felt">
        <div className="seat-row top-row">
          {seatRows.top.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              latestAction={latestActions[player.id] ?? null}
            />
          ))}
        </div>
        <div className="center-table">
          <div className="pot">
            POT <strong>{formatChips(game.poker.pot)}</strong>
          </div>
          <div className="community-cards">
            {[
              ...game.poker.communityCards,
              ...Array(Math.max(0, 5 - game.poker.communityCards.length)).fill(
                "",
              ),
            ].map((card, index) => (
              <PlayingCard key={`${card}-${index}`} card={card || undefined} />
            ))}
          </div>
          <p className="hand-result" aria-live="polite">
            {handResult ?? "\u00a0"}
          </p>
        </div>
        <div className="seat-row bottom-row">
          {seatRows.bottom.map((player) => (
            <Seat
              key={player.id}
              player={player}
              active={game.poker.currentActorId === player.id}
              latestAction={latestActions[player.id] ?? null}
            />
          ))}
        </div>
      </div>
      <section className="action-tray">
        {isSpectator ? (
          <div className="action-controls">
            <button
              type="button"
              disabled={
                loading ||
                !game.poker.players.some((player) => player.status === "open")
              }
              onClick={onClaimFirstOpenSeat}
            >
              {loading
                ? "Claiming seat"
                : game.poker.players.some((player) => player.status === "open")
                  ? "Sit in an open seat"
                  : "No open seats"}
            </button>
          </div>
        ) : (
          <>
            <div className="action-controls">
              <button
                type="button"
                disabled={!isHumanTurn || loading || !legalAction("fold")}
                onClick={() => submitFixedAction("fold")}
              >
                Fold
              </button>
              <button
                type="button"
                disabled={
                  loading ||
                  (game.poker.street === "complete"
                    ? human.playerToken !== viewerToken
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
                    ? "Preparing"
                    : "Next Hand"
                  : checkCallAction?.type === "call"
                    ? `Call ${formatChips(checkCallAction.amount)}`
                    : "Check"}
              </button>
              <button
                type="button"
                disabled={!isHumanTurn || loading || !sizedAction}
                onClick={() => {
                  if (sizedAction) submitFixedAction(sizedAction.type);
                }}
              >
                {sizedAction
                  ? `${sizedAction.type === "raise" ? "Raise" : "Bet"} to ${formatChips(selectedAmount ?? sizedAction.minAmount)}`
                  : "Bet"}
              </button>
            </div>
            <div className="amount-control">
              <div className="amount-heading">
                <span>Bet size</span>
                <strong>
                  {sizedAction && selectedAmount !== null
                    ? formatChips(selectedAmount)
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
                aria-label="Bet amount"
              />
              <div className="amount-presets">
                {[0.5, 0.75, 1].map((fraction) => (
                  <button
                    key={fraction}
                    type="button"
                    disabled={!sizedAction || !isHumanTurn || loading}
                    onClick={() => setAmount(potPresetAmount(fraction))}
                  >
                    {fraction === 1 ? "Pot" : `${fraction * 100}% Pot`}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!sizedAction || !isHumanTurn || loading}
                  onClick={() => {
                    if (sizedAction) setAmount(sizedAction.maxAmount);
                  }}
                >
                  Max
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
