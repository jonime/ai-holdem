export const turnSoundStorageKey = "ai-holdem-turn-sound";
export function readTurnSound(storage: Pick<Storage, "getItem">): boolean {
  try { return storage.getItem(turnSoundStorageKey) === "true"; } catch { return false; }
}
export function writeTurnSound(storage: Pick<Storage, "setItem">, enabled: boolean) {
  try { storage.setItem(turnSoundStorageKey, String(enabled)); } catch { /* Optional preference. */ }
}
export function createTurnAudio(factory: () => AudioContext) {
  let context: AudioContext | null = null;
  let disposed = false;
  return {
    async unlock() {
      try {
        if (disposed) return false;
        context ??= factory();
        await context.resume();
        return !disposed && context.state === "running";
      } catch { return false; }
    },
    play() {
      if (disposed || context?.state !== "running") return false;
      try {
        const start = context.currentTime;
        [660, 880].forEach((frequency, index) => {
          const oscillator = context!.createOscillator();
          const gain = context!.createGain();
          const at = start + index * 0.14;
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(0.035, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
          oscillator.connect(gain); gain.connect(context!.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(at); oscillator.stop(at + 0.13);
        });
        return true;
      } catch { return false; }
    },
    dispose() { disposed = true; if (context) void context.close().catch(() => {}); context = null; },
  };
}
