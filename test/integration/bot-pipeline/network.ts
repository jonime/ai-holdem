import net from "node:net";

export function assertLoopbackHost(host: unknown): void {
  if (typeof host !== "string" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("Bot pipeline blocked a non-loopback network destination");
  }
}

export function assertLocalOrigin(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Bot pipeline requires a loopback HTTP origin"); }
  assertLoopbackHost(url.hostname);
  if (url.protocol !== "http:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Bot pipeline requires a loopback HTTP origin");
  }
}

/** Fetch redirects are rejected; the socket guard also covers HTTP(S), TLS and raw TCP. */
export function installNetworkGuard(): () => void {
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertLoopbackHost(url.hostname);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Bot pipeline blocked a network protocol");
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const deadline = AbortSignal.timeout(10_000);
    return originalFetch(input, { ...init, redirect: "error", signal: callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline });
  };
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    // Node's createConnection passes normalized [options, callback] arguments.
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = typeof first === "object" && first !== null ? first as { host?: string; path?: string } : null;
    if (options?.path || typeof first === "string") throw new Error("Bot pipeline blocked a socket path");
    const host = options ? options.host ?? "localhost" : typeof args[1] === "string" ? args[1] : "localhost";
    assertLoopbackHost(host);
    return Reflect.apply(originalConnect, this, args);
  } as typeof originalConnect;
  return () => {
    globalThis.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
  };
}
