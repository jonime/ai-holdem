import { useState } from "react";

import { useI18n } from "@/components/poker/I18nProvider";
import type {
  AIDifficulty,
  BotDescriptor,
  Game,
  TableSettings,
} from "@/components/poker/types";
import { filledSeatCount } from "@/components/poker/view-model";
import styles from "@/components/poker/LobbyPanel.module.css";

export function LobbyPanel({
  game,
  botCatalog,
  loading,
  playerName,
  setPlayerName,
  viewerToken,
  onSavePlayerName,
  onClaimSeatAt,
  onAssignBot,
  onReleaseSeat,
  onApplyTableSettings,
  onStartWaitingGame,
}: {
  readonly game: Game;
  readonly botCatalog: readonly BotDescriptor[];
  readonly loading: boolean;
  readonly playerName: string;
  readonly setPlayerName: (value: string) => void;
  readonly viewerToken: string | null;
  readonly onSavePlayerName: (seat: number) => void;
  readonly onClaimSeatAt: (seat: number) => void;
  readonly onAssignBot: (
    seat: number,
    difficulty: AIDifficulty,
    botId: string,
  ) => void;
  readonly onReleaseSeat: (seat: number) => void;
  readonly onApplyTableSettings: (settings: TableSettings) => void;
  readonly onStartWaitingGame: (settings: TableSettings) => void;
}) {
  const { t } = useI18n();
  const canManage = game.viewerIsHost;
  const viewerPlayer = game.poker.players.find(
    (player) =>
      player.status === "claimed" && player.playerToken === viewerToken,
  );
  const normalizedPlayerName =
    playerName.trim() ||
    (viewerPlayer ? `Player ${viewerPlayer.seat + 1}` : "");
  const playerNameChanged =
    viewerPlayer !== undefined && normalizedPlayerName !== viewerPlayer.name;
  const occupiedSeats = filledSeatCount(game.poker.players);
  const [botDifficulties, setBotDifficulties] = useState<
    Readonly<Record<number, AIDifficulty>>
  >({});
  const [selectedBots, setSelectedBots] = useState<
    Readonly<Record<number, string>>
  >({});
  const [settingsDraft, setSettingsDraft] = useState({
    seatCount: String(game.poker.seatCount),
    smallBlind: String(game.poker.smallBlind),
    bigBlind: String(game.poker.bigBlind),
    startingStack: String(game.poker.startingStack),
    botsShowUncontestedWins: game.poker.botsShowUncontestedWins ?? false,
  });
  const supportsDifficulty = (
    provider: BotDescriptor["provider"] | undefined,
  ) => provider === "typesafe" || provider === "rules";
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
    <section className={styles.lobbyPanel}>
      <header className={styles.lobbyHeading}>
        <div>
          <div className={styles.panelKicker}>{t("lobby.waitingRoom")}</div>
          <h2>{t("lobby.chooseTable")}</h2>
        </div>
        <p>{t("lobby.instructions")}</p>
      </header>
      <div className={styles.lobbySetup}>
        <div className={styles.playerNameControl}>
          <label className={`${styles.lobbyField} ${styles.playerNameField}`}>
            <span>{t("lobby.yourName")}</span>
            <input
              type="text"
              value={playerName}
              maxLength={30}
              placeholder={t("lobby.anonymous")}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </label>
          {viewerPlayer ? (
            <button
              type="button"
              disabled={loading || !playerNameChanged}
              onClick={() => onSavePlayerName(viewerPlayer.seat)}
            >
              {loading ? t("lobby.savingName") : t("lobby.saveName")}
            </button>
          ) : null}
        </div>
        {canManage ? (
          <div className={styles.tableSettingsForm}>
            <label className={styles.lobbyField}>
              <span>{t("lobby.seats")}</span>
              <select
                value={settingsDraft.seatCount}
                disabled={loading}
                onChange={(event) => {
                  updateDraft("seatCount", event.target.value);
                }}
              >
                {[2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className={styles.blindFields}>
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
              <span className={styles.blindSeparator} aria-hidden="true">
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
            <label className={`${styles.lobbyField} ${styles.stackField}`}>
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
            <label className={styles.lobbyToggle}>
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
            <button
              type="button"
              disabled={!settingsValid || loading}
              onClick={() => onApplyTableSettings(parsedSettings)}
            >
              {t("lobby.applySettings")}
            </button>
          </div>
        ) : (
          <div
            className={styles.tableSettingsSummary}
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
      <div className={styles.lobbySeats}>
        {Array.from({ length: game.poker.seatCount }, (_, seat) => {
          const player = game.poker.players.find(
            (entry) => entry.seat === seat,
          );
          const seatCanManage = game.viewerIsHost;
          return (
            <article
              className={`${styles.lobbySeat} ${player?.status === "claimed" ? styles.claimed : player?.status === "bot" ? styles.bot : ""}`}
              key={seat}
            >
              <div className={styles.lobbySeatHeading}>
                <span className={styles.seatLabel}>
                  {t("lobby.seat", { seat: seat + 1 })}
                </span>
                <span className={styles.seatState}>
                  {player?.status === "open"
                    ? t("lobby.open")
                    : t("lobby.filled")}
                </span>
              </div>
              <div className={styles.lobbySeatPerson}>
                <strong>{player?.name ?? t("lobby.openSeat")}</strong>
                <span>
                  {player?.status === "bot"
                    ? supportsDifficulty(player.bot?.provider)
                      ? `${player.bot.label} · ${t(`lobby.${player.aiDifficulty ?? "medium"}`)}`
                      : (player.bot?.label ?? player.name)
                    : player?.status === "claimed"
                      ? t("lobby.humanPlayer")
                      : t("lobby.available")}
                </span>
              </div>
              {player?.status === "open" ? (
                <div className={styles.lobbyActions}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onClaimSeatAt(seat)}
                  >
                    {t("lobby.sitHere")}
                  </button>
                  {seatCanManage ? (
                    <div className={styles.botAssignmentControls}>
                      <select
                        aria-label={`Bot for seat ${seat + 1}`}
                        value={selectedBots[seat] ?? "jev"}
                        disabled={loading}
                        onChange={(event) =>
                          setSelectedBots((current) => ({
                            ...current,
                            [seat]: event.target.value,
                          }))
                        }
                      >
                        {botCatalog.map((bot) => (
                          <option key={bot.id} value={bot.id}>
                            {bot.label}
                          </option>
                        ))}
                      </select>
                      {supportsDifficulty(
                        botCatalog.find(
                          (bot) => bot.id === (selectedBots[seat] ?? "jev"),
                        )?.provider,
                      ) ? (
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
                      ) : null}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          onAssignBot(
                            seat,
                            botDifficulties[seat] ?? "medium",
                            selectedBots[seat] ?? "jev",
                          )
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
      <div className={styles.lobbyFooter}>
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
