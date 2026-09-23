import { z } from "zod";

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(path, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Request failed";
    throw new Error(message);
  }

  if (schema) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new Error("Invalid response payload");
    }
    return parsed.data;
  }

  return body as T;
}
