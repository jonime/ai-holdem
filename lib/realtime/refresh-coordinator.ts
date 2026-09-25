export const CONNECTED_POLL_INTERVAL_MS = 30_000;
export const FALLBACK_POLL_INTERVAL_MS = 5_000;
export const REALTIME_DEBOUNCE_MS = 75;
export const REFRESH_TIMEOUT_MS = 10_000;

export type RefreshConnectionStatus =
  | "live"
  | "checking"
  | "offline"
  | "error";

export function pollingInterval(
  subscribed: boolean,
  online: boolean,
  visible: boolean,
): number | null {
  if (!online || !visible) return null;
  return subscribed
    ? CONNECTED_POLL_INTERVAL_MS
    : FALLBACK_POLL_INTERVAL_MS;
}

export function connectionStatus({
  subscribed,
  online,
  refreshing,
  refreshFailed,
}: {
  readonly subscribed: boolean;
  readonly online: boolean;
  readonly refreshing: boolean;
  readonly refreshFailed: boolean;
}): RefreshConnectionStatus {
  if (!online) return "offline";
  if (refreshFailed) return "error";
  if (refreshing || !subscribed) return "checking";
  return "live";
}

export function createRefreshTimeout() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  return {
    controller,
    cancel: () => clearTimeout(timeout),
  };
}

export class RefreshCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private pending = false;
  private disposed = false;

  constructor(private readonly refresh: () => Promise<void>) {}

  schedule(delay = REALTIME_DEBOUNCE_MS) {
    if (this.disposed) return;
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  pollEvery(delay: number | null) {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (delay === null || this.disposed) return;
    this.interval = setInterval(() => this.schedule(0), delay);
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
    this.timer = null;
    this.interval = null;
    this.pending = false;
  }

  private async run() {
    if (this.disposed || this.inFlight) return;
    this.inFlight = true;
    try {
      await this.refresh();
    } finally {
      this.inFlight = false;
      if (this.pending && !this.disposed) {
        this.pending = false;
        this.schedule(0);
      }
    }
  }
}
