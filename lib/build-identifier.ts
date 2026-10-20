/** Only a full commit SHA may cross the server/build boundary. */
export function buildIdentifier(value: unknown): string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : "local/unknown";
}
