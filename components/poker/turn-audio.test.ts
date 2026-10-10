import { expect, it, vi } from "vitest";
import { createTurnAudio, readTurnSound, writeTurnSound } from "./turn-audio";
it("defaults off and tolerates failed storage", () => {
  expect(readTurnSound({ getItem: () => null })).toBe(false);
  expect(readTurnSound({ getItem: () => "true" })).toBe(true);
  expect(readTurnSound({ getItem: () => { throw Error(); } })).toBe(false);
  expect(() => writeTurnSound({ setItem: () => { throw Error(); } }, true)).not.toThrow();
});
it("does not initialize audio for a cue and isolates blocked audio", async () => {
  const factory = vi.fn(() => { throw Error(); });
  const player = createTurnAudio(factory);
  expect(player.play()).toBe(false); expect(factory).not.toHaveBeenCalled();
  expect(await player.unlock()).toBe(false); expect(player.play()).toBe(false);
  player.dispose(); expect(await player.unlock()).toBe(false);
});
it("produces two quiet notes only when running and releases resources", async () => {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; onended: () => void }[] = [];
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
  const context = { state: "suspended", currentTime: 1, destination: {}, close: vi.fn(async () => {}), resume: vi.fn(async () => { context.state = "running"; }),
    createGain: () => gain, createOscillator: () => { const oscillator = { frequency: { value: 0 }, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: () => {} }; oscillators.push(oscillator); return oscillator; } };
  const player = createTurnAudio(() => context as unknown as AudioContext);
  expect(player.play()).toBe(false);
  expect(await player.unlock()).toBe(true); expect(player.play()).toBe(true);
  expect(oscillators).toHaveLength(2); expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.035, 1.015);
  oscillators.forEach(o => o.onended()); expect(gain.disconnect).toHaveBeenCalledTimes(2);
  player.dispose(); expect(context.close).toHaveBeenCalledOnce(); expect(player.play()).toBe(false);
});
