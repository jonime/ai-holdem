import { useState } from "react";

import type {
  AIDifficulty,
  Game,
  TableSettings,
} from "@/components/poker/types";
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
  onUpdateTableSettings,
}: {
  readonly game: Game;
  readonly loading: boolean;
  readonly playerName: string;
  readonly setPlayerName: (value: string) => void;
  readonly viewerToken: string | null;
  readonly onClaimSeatAt: (seat: number) => void;
  readonly onAssignBot: (seat: number, difficulty: AIDifficulty) => void;
  readonly onReleaseSeat: (seat: number) => void;
  readonly onStartWaitingGame: () => void;
  readonly onUpdateTableSettings: (settings: TableSettings) => void;
}) {
  const canManage = canManageTable(game.poker.players, viewerToken);
  const occupiedSeats = filledSeatCount(game.poker.players);
  const [botDifficulties, setBotDifficulties] = useState<
    Readonly<Record<number, AIDifficulty>>
  >({});
  const [settingsDraft, setSettingsDraft] = useState({
    seatCount: String(game.poker.seatCount),
    smallBlind: String(game.poker.smallBlind),
    bigBlind: String(game.poker.bigBlind),
    startingStack: String(game.poker.startingStack),
  });
  const parsedSettings: TableSettings = {
    seatCount: Number(settingsDraft.seatCount),
    smallBlind: Number(settingsDraft.smallBlind),
    bigBlind: Number(settingsDraft.bigBlind),
    startingStack: Number(settingsDraft.startingStack),
  };
  const settingsValid =
    Number.isSafeInteger(parsedSettings.seatCount) &&
    parsedSettings.seatCount >= 2 &&
    parsedSettings.seatCount <= 6 &&
    Number.isSafeInteger(parsedSettings.smallBlind) &&
    parsedSettings.smallBlind > 0 &&
    Number.isSafeInteger(parsedSettings.bigBlind) &&
    parsedSettings.bigBlind > parsedSettings.smallBlind &&
    Number.isSafeInteger(parsedSettings.startingStack) &&
    parsedSettings.startingStack >= parsedSettings.bigBlind;
  const settingsChanged =
    parsedSettings.seatCount !== game.poker.seatCount ||
    parsedSettings.smallBlind !== game.poker.smallBlind ||
    parsedSettings.bigBlind !== game.poker.bigBlind ||
    parsedSettings.startingStack !== game.poker.startingStack;

  const updateDraft = (key: keyof typeof settingsDraft, value: string) => {
    setSettingsDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="lobby-panel">
      <header className="lobby-heading">
        <div>
          <div className="panel-kicker">WAITING ROOM</div>
          <h2>Choose your table</h2>
        </div>
        <p>Fill at least two seats, then start the hand.</p>
      </header>
      <div className="lobby-setup">
        <label className="lobby-field player-name-field">
          <span>Your name</span>
          <input
            type="text"
            value={playerName}
            maxLength={30}
            placeholder="Anonymous"
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
        {canManage ? (
          <form
            className="table-settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (settingsValid && settingsChanged) {
                onUpdateTableSettings(parsedSettings);
              }
            }}
          >
            <label className="lobby-field compact-field">
              <span>Seats</span>
              <select
                value={settingsDraft.seatCount}
                disabled={loading}
                onChange={(event) =>
                  updateDraft("seatCount", event.target.value)
                }
              >
                {[2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="blind-fields">
              <legend>Blinds</legend>
              <label>
                <span>Small</span>
                <input
                  aria-label="Small blind"
                  type="number"
                  min="1"
                  step="1"
                  value={settingsDraft.smallBlind}
                  disabled={loading}
                  onChange={(event) =>
                    updateDraft("smallBlind", event.target.value)
                  }
                />
              </label>
              <span className="blind-separator" aria-hidden="true">
                /
              </span>
              <label>
                <span>Big</span>
                <input
                  aria-label="Big blind"
                  type="number"
                  min="2"
                  step="1"
                  value={settingsDraft.bigBlind}
                  disabled={loading}
                  onChange={(event) =>
                    updateDraft("bigBlind", event.target.value)
                  }
                />
              </label>
            </fieldset>
            <label className="lobby-field stack-field">
              <span>Starting stack</span>
              <input
                type="number"
                min={Math.max(1, parsedSettings.bigBlind || 1)}
                step="1"
                value={settingsDraft.startingStack}
                disabled={loading}
                onChange={(event) =>
                  updateDraft("startingStack", event.target.value)
                }
              />
              <small>
                {settingsValid
                  ? `${Math.round(parsedSettings.startingStack / parsedSettings.bigBlind)} BB`
                  : "Check values"}
              </small>
            </label>
            <button
              className="apply-settings"
              type="submit"
              disabled={loading || !settingsValid || !settingsChanged}
            >
              Apply settings
            </button>
          </form>
        ) : (
          <div className="table-settings-summary" aria-label="Table settings">
            <div>
              <span>Seats</span>
              <strong>{game.poker.seatCount}</strong>
            </div>
            <div>
              <span>Blinds</span>
              <strong>
                {game.poker.smallBlind} / {game.poker.bigBlind}
              </strong>
            </div>
            <div>
              <span>Starting stack</span>
              <strong>{game.poker.startingStack.toLocaleString()}</strong>
            </div>
          </div>
        )}
      </div>
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
              <div className="lobby-seat-heading">
                <span className="seat-label">SEAT {seat + 1}</span>
                <span className="seat-state">
                  {player?.status === "open" ? "OPEN" : "FILLED"}
                </span>
              </div>
              <div className="lobby-seat-person">
                <strong>{player?.name ?? "Open seat"}</strong>
                <span>
                  {player?.status === "bot"
                    ? `TypeSafe AI · ${player.aiDifficulty ?? "medium"}`
                    : player?.status === "claimed"
                      ? "Human player"
                      : "Available"}
                </span>
              </div>
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
                    <div className="bot-assignment-controls">
                      <select
                        aria-label={`Bot difficulty for seat ${seat + 1}`}
                        value={botDifficulties[seat] ?? "medium"}
                        disabled={loading}
                        onChange={(event) =>
                          setBotDifficulties((current) => ({
                            ...current,
                            [seat]: event.target.value as AIDifficulty,
                          }))
                        }
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          onAssignBot(seat, botDifficulties[seat] ?? "medium")
                        }
                      >
                        Assign bot
                      </button>
                    </div>
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
        <span>
          {occupiedSeats} of {game.poker.seatCount} seats filled
        </span>
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
