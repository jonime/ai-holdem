import "server-only";

// Provisional fairness settings, not cost or per-person guarantees.
export const usagePolicy = {
  ownerAI: { allowance: 600, windowMs: 3_600_000 },
  gameAI: { allowance: 30, windowMs: 60_000 },
  ownerCreation: { allowance: 6, windowMs: 600_000 },
  ipCreation: { allowance: 30, windowMs: 600_000 },
} as const;
