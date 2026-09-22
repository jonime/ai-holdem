import type { Game } from "@/components/poker/types";
import { canManageTable, filledSeatCount } from "@/components/poker/view-model";

export function LobbyPanel({
  game,
  loading,
  playerName,
  setPlayerName,
  viewerToken,
  onClaimSeatAt,
  onAssignBot,
  onReleaseSeat,
  onStartWaitingGame,
  onUpdateSeatCount,
}: {
  readonly game: Game;
  readonly loading: boolean;
  readonly playerName: string;
  readonly setPlayerName: (value: string) => void;
  readonly viewerToken: string | null;
  readonly onClaimSeatAt: (seat: number) => void;
  readonly onAssignBot: (seat: number) => void;
  readonly onReleaseSeat: (seat: number) => void;
  readonly onStartWaitingGame: () => void;
  readonly onUpdateSeatCount: (nextSeatCount: number) => void;
}) {
  const canManage = canManageTable(game.poker.players, viewerToken);

  return (
    <section className="lobby-panel">
      <div className="panel-kicker">WAITING ROOM</div>
      <h2>Choose your table</h2>
      <p>Fill at least two seats, then start the hand.</p>
      <label className="player-name-field">
        Your name
        <input
          type="text"
          value={playerName}
          maxLength={30}
          placeholder="Anonymous"
          onChange={(event) => setPlayerName(event.target.value)}
        />
      </label>
      {!canManage ? null : (
        <label className="seat-count-picker">
          Seats
          <select
            value={game.poker.seatCount}
            disabled={loading}
            onChange={(event) => onUpdateSeatCount(Number(event.target.value))}
          >
            {[2, 3, 4, 5, 6].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="lobby-seats">
        {Array.from({ length: game.poker.seatCount }, (_, seat) => {
          const player = game.poker.players.find(
            (entry) => entry.seat === seat,
          );
          const seatCanManage = canManageTable(game.poker.players, viewerToken);
          return (
            <article
              className={`lobby-seat ${player?.status ?? "open"}`}
              key={seat}
            >
              <span className="seat-label">SEAT {seat + 1}</span>
              <strong>{player?.name ?? "Open seat"}</strong>
              <span>
                {player?.status === "bot"
                  ? "TypeSafe AI"
                  : player?.status === "claimed"
                    ? "Human"
                    : "Available"}
              </span>
              {player?.status === "open" ? (
                <div className="lobby-actions">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onClaimSeatAt(seat)}
                  >
                    Sit here
                  </button>
                  {seatCanManage ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onAssignBot(seat)}
                    >
                      Assign bot
                    </button>
                  ) : null}
                </div>
              ) : null}
              {player?.playerToken === viewerToken &&
              player.status === "claimed" ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onReleaseSeat(seat)}
                >
                  Stand up
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="lobby-footer">
        <button
          type="button"
          disabled={
            !canManage || filledSeatCount(game.poker.players) < 2 || loading
          }
          onClick={onStartWaitingGame}
        >
          Start hand
        </button>
        {!canManage ? <span>Waiting for the host to start.</span> : null}
      </div>
    </section>
  );
}
