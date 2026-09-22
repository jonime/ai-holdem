import { describe, expect, it } from "vitest";

import { getPlayerToken, PLAYER_TOKEN_COOKIE_NAME } from "./player-token";

describe("getPlayerToken", () => {
  it("creates and reuses the same anonymous token for the browser", async () => {
    const values = new Map<string, string>();
    const cookieStore = {
      get: (name: string) => {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        values.set(name, value);
      },
    };

    const firstToken = await getPlayerToken(cookieStore as never);
    const secondToken = await getPlayerToken(cookieStore as never);

    expect(firstToken).toBe(secondToken);
    expect(firstToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(values.get(PLAYER_TOKEN_COOKIE_NAME)).toBe(firstToken);
  });
});
