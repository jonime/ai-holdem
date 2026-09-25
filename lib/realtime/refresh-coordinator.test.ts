import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONNECTED_POLL_INTERVAL_MS,
  FALLBACK_POLL_INTERVAL_MS,
  RefreshCoordinator,
  connectionStatus,
  createRefreshTimeout,
  pollingInterval,
} from "./refresh-coordinator";

afterEach(() => vi.useRealTimers());

describe("RefreshCoordinator", () => {
  it("debounces events and coalesces events received during a refresh", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const refresh = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const coordinator = new RefreshCoordinator(refresh);

    coordinator.schedule();
    coordinator.schedule();
    await vi.advanceTimersByTimeAsync(75);
    expect(refresh).toHaveBeenCalledTimes(1);

    coordinator.schedule();
    coordinator.schedule();
    finish?.();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("uses the configured poll cadence and stops after disposal", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const coordinator = new RefreshCoordinator(refresh);

    coordinator.pollEvery(CONNECTED_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(CONNECTED_POLL_INTERVAL_MS + 1);
    expect(refresh).toHaveBeenCalledTimes(1);

    coordinator.pollEvery(FALLBACK_POLL_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(FALLBACK_POLL_INTERVAL_MS + 1);
    expect(refresh).toHaveBeenCalledTimes(2);

    coordinator.dispose();
    await vi.advanceTimersByTimeAsync(CONNECTED_POLL_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled refresh after ten seconds", async () => {
    vi.useFakeTimers();
    const timeout = createRefreshTimeout();
    expect(timeout.controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(timeout.controller.signal.aborted).toBe(true);
  });
});

describe("refresh state", () => {
  it("pauses polling while hidden or offline", () => {
    expect(pollingInterval(true, true, true)).toBe(30_000);
    expect(pollingInterval(false, true, true)).toBe(5_000);
    expect(pollingInterval(true, false, true)).toBeNull();
    expect(pollingInterval(true, true, false)).toBeNull();
  });

  it("prioritizes offline and refresh errors in user feedback", () => {
    expect(
      connectionStatus({
        subscribed: true,
        online: false,
        refreshing: false,
        refreshFailed: true,
      }),
    ).toBe("offline");
    expect(
      connectionStatus({
        subscribed: true,
        online: true,
        refreshing: false,
        refreshFailed: true,
      }),
    ).toBe("error");
    expect(
      connectionStatus({
        subscribed: true,
        online: true,
        refreshing: false,
        refreshFailed: false,
      }),
    ).toBe("live");
  });
});
