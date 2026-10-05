import "server-only";

import { getTypesafeServerEnv } from "@/lib/env/server";

import type { SystemOneRequest } from "./types";
import { requestProviderJson } from "@/lib/bots/provider-request";
import { BotProviderError } from "@/lib/bots/types";

const systemOneEndpoint = "https://api.typesafe.ai/v1/systemone";

export interface FetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

export class TypesafeRequestError extends BotProviderError {
  override name = "TypesafeRequestError";
}

export class TypesafeSystemOneClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async evaluate(request: SystemOneRequest): Promise<unknown> {
    let typesafeApiKey: string;
    try {
      ({ typesafeApiKey } = getTypesafeServerEnv());
    } catch (error) {
      if (error instanceof Error && error.message === "External inference is disabled") {
        throw error;
      }
      throw new TypesafeRequestError("TypeSafe credentials are not configured");
    }
    try {
      return await requestProviderJson(this.fetcher, systemOneEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${typesafeApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
    } catch (error) {
      if (error instanceof BotProviderError) {
        throw new TypesafeRequestError(error.message, error.httpFailure, error.requestFailure);
      }
      throw error;
    }
  }
}
