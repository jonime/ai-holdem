import { expect, it } from "vitest";
import { formatResultAmount as format } from "./personal-results-format";
it("formats aggregated historical BB without converting chips using a current blind", () => {
  expect(format(5, 0, "bigBlinds", "en-US", "chips")).toBe("0 BB");
  expect(format(5, 1 / 3, "bigBlinds", "en-US", "chips")).toBe("≈+0.33 BB");
  expect(format(-1, -0.001, "bigBlinds", "en-US", "chips")).toBe("-<0.01 BB");
  expect(format(1, 0.001, "bigBlinds", "fi-FI", "merkkiä")).toBe("+<0,01 BB");
  expect(format(-1000, -0.5, "chips", "en-US", "chips")).toBe("-1,000 chips");
});
