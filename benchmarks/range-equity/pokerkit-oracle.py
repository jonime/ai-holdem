"""Offline independent evaluator; unweighted ranges only, never an app dependency."""
import hashlib
import itertools
import json
import math
import random
import sys
from importlib.metadata import version
from pathlib import Path
from pokerkit import StandardHighHand

if version("pokerkit") != "0.7.7":
    raise RuntimeError("Expected pinned PokerKit 0.7.7")
source = Path(sys.argv[1]).read_bytes()
fixtures = json.loads(source)
deck = [rank + suit for rank in "23456789TJQKA" for suit in "cdhs"]
rows = []
for fixture in fixtures:
    if not fixture["oracle"]:
        continue  # weighted hypotheses have a separate exact product-weight test
    node = fixture["input"]
    visible = node["hero"] + node["board"]
    ranges = []
    for opponent in node["opponents"]:
        if any(combo["weight"] != 1 for combo in opponent["combinations"]):
            raise ValueError("Oracle accepts only unweighted combinations")
        ranges.append([combo["cards"] for combo in opponent["combinations"]
                       if not set(combo["cards"]) & set(visible)])
    exact = len(node["board"]) == 5 and math.prod(map(len, ranges)) <= 50_000
    rng = random.Random("pokerkit-independent-v1:" + fixture["id"])
    def proposals():
        if exact:
            yield from itertools.product(*ranges)
        else:
            for _ in range(2_000_000):
                yield [rng.choice(holdings) for holdings in ranges]
    shares = []
    attempts = 0
    for holes in proposals():
        attempts += 1
        used = visible + list(itertools.chain.from_iterable(holes))
        if len(set(used)) != len(used):
            continue
        board = node["board"] + rng.sample([card for card in deck if card not in used], 5 - len(node["board"]))
        ranks = [StandardHighHand.from_game("".join(hole), "".join(board))
                 for hole in [node["hero"], *holes]]
        best = max(ranks)
        shares.append(0 if ranks[0] != best else 1 / ranks.count(best))
        if not exact and len(shares) == 20_000:
            break
    if not shares or (not exact and len(shares) != 20_000):
        raise RuntimeError("Oracle failed to complete sample budget")
    mean = sum(shares) / len(shares)
    se = 0 if exact else math.sqrt(sum((x - mean) ** 2 for x in shares) / (len(shares) - 1) / len(shares))
    rows.append(dict(id=fixture["id"], method="exact-river" if exact else "independent-monte-carlo",
                     showdownShare=mean, sampleCount=len(shares), standardError=se, attempts=attempts))
result = dict(pokerkitVersion=version("pokerkit"), inputSha256=hashlib.sha256(source).hexdigest(), rows=rows)
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n")
print(f"PokerKit independently checked {len(rows)} unweighted fixtures")
