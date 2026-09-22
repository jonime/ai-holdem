import "server-only";

import { getTypesafeServerEnv } from "@/lib/env/server";

import type { SystemOneRequest } from "./types";

const systemOneEndpoint = "https://api.typesafe.ai/v1/systemone";

export interface FetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

export class TypesafeRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypesafeRequestError";
  }
}

export class TypesafeSystemOneClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async evaluate(request: SystemOneRequest): Promise<unknown> {
    const { typesafeApiKey } = getTypesafeServerEnv();
    const response = await this.fetcher(systemOneEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${typesafeApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new TypesafeRequestError(
        `TypeSafe request failed with HTTP ${response.status}`,
      );
    }

    return body;
  }
}
