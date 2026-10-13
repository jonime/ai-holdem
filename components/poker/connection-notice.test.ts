import { expect, it } from "vitest";
import { connectionNotice, connectionFeedback } from "./connection-notice";

it("prioritizes offline, then failed reads, then reconnecting", () => {
  expect(connectionNotice(false, true, true)).toBe("offline");
  expect(connectionNotice(true, true, true)).toBe("refreshFailed");
  expect(connectionNotice(true, true, false)).toBe("reconnecting");
  expect(connectionNotice(true, false, false)).toBe("none");
});
it("keeps healthy polling silent and gives recovery one refresh action with context", () => {
  expect(connectionFeedback("none", false)).toEqual({ message: "none", refresh: false });
  expect(connectionFeedback("refreshFailed", true)).toEqual({ message: "none", refresh: true });
  expect(connectionFeedback("offline", true)).toEqual({ message: "offline", refresh: true });
  expect(connectionFeedback("reconnecting", true)).toEqual({ message: "reconnecting", refresh: true });
});
