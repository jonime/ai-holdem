import "server-only";

import { getEevoServerEnv } from "@/lib/env/server";

import type { SystemOneRequest } from "@/lib/systemone/types";
import { requestProviderJson } from "@/lib/bots/provider-request";
import { BotProviderError } from "@/lib/bots/types";

const systemOneEndpoint = "https://eevo.io/api/v1/systemone";

export interface FetchLike {
  (input: string, init: RequestInit): Promise<Response>;
}

export class EevoRequestError extends BotProviderError {
  override name = "EevoRequestError";
}

export class EevoSystemOneClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async evaluate(request: SystemOneRequest): Promise<unknown> {
    let eevoApiKey: string;
    try {
      ({ eevoApiKey } = getEevoServerEnv());
    } catch (error) {
      if (error instanceof Error && error.message === "External inference is disabled") {
        throw error;
      }
      throw new EevoRequestError("Eevo credentials are not configured");
    }
    try {
      return await requestProviderJson(this.fetcher, systemOneEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${eevoApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...request, model: "eevo-1" }),
      });
    } catch (error) {
      if (error instanceof BotProviderError) {
        throw new EevoRequestError(error.message, error.httpFailure, error.requestFailure);
      }
      throw error;
    }
  }
}
