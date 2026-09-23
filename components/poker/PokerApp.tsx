"use client";

import { useState } from "react";

import { AppHeader } from "@/components/poker/AppHeader";
import { HistoryModal } from "@/components/poker/HistoryModal";
import { LobbyPanel } from "@/components/poker/LobbyPanel";
import { PokerTable } from "@/components/poker/PokerTable";
import { useGameSession } from "@/components/poker/useGameSession";
import { getClientPlayerToken } from "@/lib/identity/player-token-client";
import {
  arrangeSeats,
  availableHistoryHands,
  describeHandResult,
  resolveViewer,
} from "@/components/poker/view-model";

const playerNameStorageKey = "ai-holdem-player-name";

export default function PokerApp({ gameId }: { readonly gameId?: string }) {
  const [playerName, setPlayerName] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(playerNameStorageKey) ?? ""),
  );
  const [amount, setAmount] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const {
    game,
    history,
    selectedHistoryHand,
    liveDecisions,
    loading,
    error,
    createGame,
    claimSeatAt,
    assignBot,
    releaseSeat,
    startWaitingGame,
    updateSeatCount,
    submitAction,
    beginNextHand,
    selectHistoryHand,
  } = useGameSession(gameId);

  const viewerToken = getClientPlayerToken();
  const { viewerPlayer, human } = resolveViewer(
    game?.poker.players ?? [],
    viewerToken,
  );
  const currentActor = game?.poker.players.find(
    (player) => player.id === game.poker.currentActorId,
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
  const seatRows = arrangeSeats(
    game?.poker.players ?? [],
    (viewerPlayer ?? human)?.id ?? null,
  );
  const displayedHistoryHand = selectedHistoryHand ?? game?.poker.handNumber;
  const currentHistory =
    history && history.handNumber === displayedHistoryHand
      ? history.value
      : null;
  const availableHands = game
    ? availableHistoryHands(game.poker.handNumber)
    : [];
  const winnerNames = game?.poker.winnerIds
    .map(
      (winnerId) =>
        game.poker.players.find((player) => player.id === winnerId)?.name,
    )
    .filter((name): name is string => Boolean(name));
  const handResult =
    game?.poker.street === "complete" ? describeHandResult(winnerNames) : null;

  return (
    <main className="poker-app">
      <AppHeader loading={loading} onNewGame={() => void createGame()} />
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {!game ? (
        <div className="route-loading" aria-label="Loading table" />
      ) : game.status === "waiting" ? (
        <LobbyPanel
          game={game}
          loading={loading}
          playerName={playerName}
          setPlayerName={setPlayerName}
          viewerToken={viewerToken}
          onClaimSeatAt={(seat) => void claimSeatAt(seat, playerName)}
          onAssignBot={(seat, difficulty) => void assignBot(seat, difficulty)}
          onReleaseSeat={(seat) => void releaseSeat(seat)}
          onStartWaitingGame={() => void startWaitingGame()}
          onUpdateSeatCount={(count) => void updateSeatCount(count)}
        />
      ) : !human ? (
        <section className="empty-state">
          <p>This table is waiting for a playable seat.</p>
        </section>
      ) : (
        <div className="game-layout">
          <PokerTable
            game={game}
            seatRows={seatRows}
            human={human}
            viewerToken={viewerToken}
            currentActor={currentActor}
            isSpectator={isSpectator}
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
              if (human) {
                void releaseSeat(human.seat);
              }
            }}
            onSubmitAction={(action, amountOverride = amount ?? null) =>
              void submitAction(action, amountOverride)
            }
            onBeginNextHand={() => void beginNextHand()}
            onOpenHistory={() => setHistoryOpen(true)}
            handResult={handResult}
          />
          {historyOpen && displayedHistoryHand ? (
            <HistoryModal
              onClose={() => setHistoryOpen(false)}
              handNumber={displayedHistoryHand}
              history={currentHistory}
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
