export type ConnectionNotice = "none" | "offline" | "reconnecting" | "refreshFailed";

/** Transport mode and routine refresh activity never produce a notice. */
export function connectionNotice(online: boolean, reconnecting: boolean, failed: boolean): ConnectionNotice {
  if (!online) return "offline";
  if (failed) return "refreshFailed";
  return reconnecting ? "reconnecting" : "none";
}

export function connectionFeedback(kind: ConnectionNotice, recoveryBlocked: boolean) {
  return {
    message: recoveryBlocked && kind === "refreshFailed" ? "none" : kind,
    refresh: recoveryBlocked || kind === "refreshFailed",
  };
}
