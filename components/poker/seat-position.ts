/** Presentation only: order by physical seat, then rotate the owned seat to bottom. */
export type PositionedSeat = Readonly<{ id: string; seat: number }>;
export type SeatPosition = Readonly<{ x: number; y: number; mobileX: number; mobileY: number }>;
const positions: Record<number, readonly (readonly [number, number, number, number])[]> = {
  2: [[50, 84, 50, 86], [50, 16, 50, 14]],
  3: [[50, 84, 50, 86], [20, 22, 18, 25], [80, 22, 82, 25]],
  4: [[50, 84, 50, 86], [15, 28, 18, 29], [50, 16, 50, 14], [85, 28, 82, 29]],
  5: [[50, 84, 50, 86], [15, 70, 18, 71], [22, 22, 18, 25], [78, 22, 82, 25], [85, 70, 82, 71]],
  6: [[50, 84, 50, 86], [15, 70, 18, 71], [15, 28, 18, 29], [50, 16, 50, 14], [85, 28, 82, 29], [85, 70, 82, 71]],
};
export function seatPositions(seats: readonly PositionedSeat[], ownedId?: string | null): ReadonlyMap<string, SeatPosition> {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat);
  const anchor = Math.max(0, ordered.findIndex(seat => seat.id === ownedId));
  const layout = positions[ordered.length];
  return new Map(ordered.map((seat, index) => {
    const [x, y, mobileX, mobileY] = layout?.[(index - anchor + ordered.length) % ordered.length] ?? [50, 50, 50, 50];
    return [seat.id, { x, y, mobileX, mobileY }];
  }));
}
