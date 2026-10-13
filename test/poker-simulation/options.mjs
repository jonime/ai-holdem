/** Strict CLI parser shared by the runner, dedicated config, and regression tests. */
export function simulationOptions(args = []) {
  const options = { seed: undefined, seats: undefined, hands: 40 };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!["--seed", "--seats", "--hands"].includes(flag) || seen.has(flag)) {
      throw new Error(`Unknown or duplicate simulation option: ${flag}`);
    }
    seen.add(flag);
    const value = args[i + 1];
    if (!value || !/^\d+$/.test(value)) throw new Error(`Invalid ${flag}: expected an integer`);
    const number = Number(value);
    const [min, max] = flag === "--seed" ? [0, 0xffffffff] : flag === "--seats" ? [2, 6] : [1, 40];
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw new Error(`Invalid ${flag}: expected ${min}–${max}`);
    }
    if (flag === "--hands") options.hands = number;
    else if (flag === "--seed") options.seed = number;
    else options.seats = number;
  }
  return options;
}

export function simulationCases(options) {
  const seats = options.seats === undefined ? [2, 3, 4, 5, 6] : [options.seats];
  const seeds = options.seed === undefined ? Array.from({ length: 50 }, (_, i) => i + 1) : [options.seed];
  const cases = seats.flatMap(seats => seeds.map(seed => ({ seed, seats, hands: options.hands })));
  if (cases.length === 0) throw new Error("Empty simulation selection");
  return cases;
}
