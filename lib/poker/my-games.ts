import "server-only";
import { myGamesResponseSchema } from "@/lib/http/discovery-contracts";

export interface MyGamesRepository {
  listMyGames(playerToken: string): Promise<unknown>;
}
export async function listMyGames(repository: MyGamesRepository, playerToken: string) {
  return myGamesResponseSchema.parse({ games: await repository.listMyGames(playerToken) });
}
