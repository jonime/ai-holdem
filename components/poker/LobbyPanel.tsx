import { useState } from "react";

import { useI18n } from "@/components/poker/I18nProvider";
import type {
  AIDifficulty,
  Game,
  TableSettings,
} from "@/components/poker/types";
import { filledSeatCount } from "@/components/poker/view-model";

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
  onSeatCountChange,
}: {
  readonly game: Game;
  readonly loading: boolean;
  readonly playerName: string;
  readonly setPlayerName: (value: string) => void;
  readonly viewerToken: string | null;
  readonly onClaimSeatAt: (seat: number) => void;
  readonly onAssignBot: (seat: number, difficulty: AIDifficulty) => void;
  readonly onReleaseSeat: (seat: number) => void;
  readonly onStartWaitingGame: (settings: TableSettings) => void;
  readonly onSeatCountChange: (settings: TableSettings) => void;
}) {
  const { t } = useI18n();
  const canManage = game.viewerIsHost;
  const occupiedSeats = filledSeatCount(game.poker.players);
  const [botDifficulties, setBotDifficulties] = useState<
    Readonly<Record<number, AIDifficulty>>
  >({});
  const [settingsDraft, setSettingsDraft] = useState({
    seatCount: String(game.poker.seatCount),
    smallBlind: String(game.poker.smallBlind),
    bigBlind: String(game.poker.bigBlind),
    startingStack: String(game.poker.startingStack),
    botsShowUncontestedWins: game.poker.botsShowUncontestedWins ?? false,
  });
  const parsedSettings: TableSettings = {
    seatCount: Number(settingsDraft.seatCount),
    smallBlind: Number(settingsDraft.smallBlind),
    bigBlind: Number(settingsDraft.bigBlind),
    startingStack: Number(settingsDraft.startingStack),
    botsShowUncontestedWins: settingsDraft.botsShowUncontestedWins,
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
  const updateDraft = (key: keyof typeof settingsDraft, value: string) => {
    setSettingsDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="lobby-panel">
      <header className="lobby-heading">
        <div>
          <div className="panel-kicker">{t("lobby.waitingRoom")}</div>
          <h2>{t("lobby.chooseTable")}</h2>
        </div>
        <p>{t("lobby.instructions")}</p>
      </header>
      <div className="lobby-setup">
        <label className="lobby-field player-name-field">
          <span>{t("lobby.yourName")}</span>
          <input
            type="text"
            value={playerName}
            maxLength={30}
            placeholder={t("lobby.anonymous")}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>
        {canManage ? (
          <div className="table-settings-form">
            <label className="lobby-field compact-field">
              <span>{t("lobby.seats")}</span>
              <select
                value={settingsDraft.seatCount}
                disabled={loading}
                onChange={(event) => {
                  const seatCount = Number(event.target.value);
                  updateDraft("seatCount", event.target.value);
                  if (seatCount !== game.poker.seatCount) {
                    onSeatCountChange({
                      seatCount,
                      smallBlind: game.poker.smallBlind,
                      bigBlind: game.poker.bigBlind,
                      startingStack: game.poker.startingStack,
                      botsShowUncontestedWins:
                        game.poker.botsShowUncontestedWins ?? false,
                    });
                  }
                }}
              >
                {[2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="blind-fields">
              <legend>{t("lobby.blinds")}</legend>
              <label>
                <span>{t("lobby.small")}</span>
                <input
                  aria-label={t("lobby.smallBlind")}
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
                <span>{t("lobby.big")}</span>
                <input
                  aria-label={t("lobby.bigBlind")}
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
              <span>{t("lobby.startingStack")}</span>
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
                  : t("lobby.checkValues")}
              </small>
            </label>
            <label className="lobby-toggle">
              <input
                type="checkbox"
                checked={settingsDraft.botsShowUncontestedWins}
                disabled={loading}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    botsShowUncontestedWins: event.target.checked,
                  }))
                }
              />
              <span>{t("lobby.botsShowUncontestedWins")}</span>
            </label>
          </div>
        ) : (
          <div
            className="table-settings-summary"
            aria-label={t("lobby.tableSettings")}
          >
            <div>
              <span>{t("lobby.seats")}</span>
              <strong>{game.poker.seatCount}</strong>
            </div>
            <div>
              <span>{t("lobby.blinds")}</span>
              <strong>
                {game.poker.smallBlind} / {game.poker.bigBlind}
              </strong>
            </div>
            <div>
              <span>{t("lobby.startingStack")}</span>
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
          const seatCanManage = game.viewerIsHost;
          return (
            <article
              className={`lobby-seat ${player?.status ?? "open"}`}
              key={seat}
            >
              <div className="lobby-seat-heading">
                <span className="seat-label">
                  {t("lobby.seat", { seat: seat + 1 })}
                </span>
                <span className="seat-state">
                  {player?.status === "open"
                    ? t("lobby.open")
                    : t("lobby.filled")}
                </span>
              </div>
              <div className="lobby-seat-person">
                <strong>{player?.name ?? t("lobby.openSeat")}</strong>
                <span>
                  {player?.status === "bot"
                    ? t("lobby.typesafeAi", {
                        difficulty: t(
                          `lobby.${player.aiDifficulty ?? "medium"}`,
                        ),
                      })
                    : player?.status === "claimed"
                      ? t("lobby.humanPlayer")
                      : t("lobby.available")}
                </span>
              </div>
              {player?.status === "open" ? (
                <div className="lobby-actions">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onClaimSeatAt(seat)}
                  >
                    {t("lobby.sitHere")}
                  </button>
                  {seatCanManage ? (
                    <div className="bot-assignment-controls">
                      <select
                        aria-label={t("lobby.botDifficulty", {
                          seat: seat + 1,
                        })}
                        value={botDifficulties[seat] ?? "medium"}
                        disabled={loading}
                        onChange={(event) =>
                          setBotDifficulties((current) => ({
                            ...current,
                            [seat]: event.target.value as AIDifficulty,
                          }))
                        }
                      >
                        <option value="easy">{t("lobby.easy")}</option>
                        <option value="medium">{t("lobby.medium")}</option>
                        <option value="hard">{t("lobby.hard")}</option>
                      </select>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          onAssignBot(seat, botDifficulties[seat] ?? "medium")
                        }
                      >
                        {t("lobby.assignBot")}
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
                  {t("lobby.standUp")}
                </button>
              ) : null}
              {seatCanManage && player?.status === "bot" ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onReleaseSeat(seat)}
                >
                  {t("lobby.removeBot")}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="lobby-footer">
        <span>
          {t("lobby.seatsFilled", {
            occupied: occupiedSeats,
            total: game.poker.seatCount,
          })}
        </span>
        {canManage ? (
          <button
            type="button"
            disabled={
              filledSeatCount(game.poker.players) < 2 ||
              !settingsValid ||
              loading
            }
            onClick={() => onStartWaitingGame(parsedSettings)}
          >
            {t("lobby.startHand")}
          </button>
        ) : null}
        {!canManage ? <span>{t("lobby.waitingForHost")}</span> : null}
      </div>
    </section>
  );
}
