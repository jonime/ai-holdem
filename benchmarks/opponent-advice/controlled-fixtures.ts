import { adviceFixtures } from "./fixtures";

export const controlledFixtureVersion = "opponent-advice-twelve-v2";
/** Preserve v1 evidence. Omit only the target's observations, fixing HERO and unrelated statistics. */
export function controlledAdviceFixtures(samples = 5000) {
  return adviceFixtures(samples).map(fixture => {
    const canonical = fixture.contexts.folding.sessionStats!;
    return { ...fixture, contexts: { ...fixture.contexts, omitted: {
      ...fixture.contexts.omitted,
      sessionStats: { ...canonical, participants: canonical.participants.filter(p => p.seat !== fixture.target) },
    } } };
  });
}
