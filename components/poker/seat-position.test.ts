import { describe, expect, it } from "vitest";
import { seatPositions } from "./seat-position";
describe("presentation seat positions", () => {
  it.each([2, 3, 4, 5, 6])("anchors any owned identity while preserving clockwise order at %i seats", count => {
    const seats = Array.from({ length: count }, (_, i) => ({ id: `player-${i}`, seat: i }));
    for (const owned of seats) {
      const positions = seatPositions([...seats].reverse(), owned.id);
      expect(positions.get(owned.id)?.x).toBe(50);
      expect(positions.get(owned.id)?.mobileX).toBe(50);
      expect(positions.get(owned.id)?.mobileY).toBeGreaterThan(80);
      expect(new Set([...positions.values()].map(p => `${p.x},${p.y}`)).size).toBe(count);
      for (const position of positions.values()) for (const coordinate of Object.values(position)) expect(coordinate).toBeGreaterThan(0);
      // Advancing physical seats advances layout positions, independent of array order.
      const next = seats[(owned.seat + 1) % count];
      expect(positions.get(next.id)).toEqual(seatPositions(seats, seats[0].id).get(seats[1].id));
    }
  });
  it("uses the lowest physical seat for spectators and handles empty tables", () => {
    const seats = [{ id: "b", seat: 5 }, { id: "a", seat: 2 }];
    expect(seatPositions(seats).get("a")?.x).toBe(50);
    expect(seatPositions(seats, "unknown")).toEqual(seatPositions(seats));
    expect(seatPositions([]).size).toBe(0);
  });
});
