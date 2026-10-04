export interface GameHostReader {
  getHostToken(gameId: string): Promise<string | null>;
}

export async function isCallerHost(
  repository: GameHostReader,
  gameId: string,
  callerToken: string | null,
): Promise<boolean> {
  const hostToken = await repository.getHostToken(gameId);
  return hostToken !== null && callerToken === hostToken;
}
