"""Read a pinned downloaded candidate; no solver imports, solves or network calls."""
import argparse
import gzip
import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("checkout", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
root = args.checkout
revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
if revision != "f78f1b2bc338dd8cbb5226ecb8398bbdb3635676":
    raise SystemExit("Use the pinned audited revision")
path = root / "assets/blueprints/preflop_169class_100bb_anteNone.json.gz"
raw = gzip.decompress(path.read_bytes())
data = json.loads(raw)
manifest = json.loads((root / "assets/blueprints/manifest.json").read_text())
record = next(x for x in manifest["shards"] if x["stack_bb"] == 100 and x["ante_bb"] == 0)
malformed = 0
rows = 0
max_error = 0
unknown_actions = set()
invalid_amounts = 0
for node in data["infosets"].values():
    for action in node["actions"]:
        if action not in ("fold", "call", "check", "all_in") and not re.fullmatch(r"(?:open_to_|raise_to_)\d+", action):
            unknown_actions.add(action)
        match = re.fullmatch(r"(?:open_to_|raise_to_)(\d+)", action)
        if match and not 0 < int(match.group(1)) <= 10000:
            invalid_amounts += 1
    for hand, frequencies in node["strategy"].items():
        rows += 1
        max_error = max(max_error, abs(sum(frequencies) - 1))
        if len(frequencies) != len(node["actions"]) or any(not math.isfinite(x) or not 0 <= x <= 1 for x in frequencies):
            malformed += 1
report = {
    "revision": "f78f1b2bc338dd8cbb5226ecb8398bbdb3635676",
    "file": str(path.relative_to(root)),
    "sha256Compressed": hashlib.sha256(path.read_bytes()).hexdigest(),
    "sha256Uncompressed": hashlib.sha256(raw).hexdigest(),
    "manifestChecksumMatches": record["sha256"] == hashlib.sha256(raw).hexdigest(),
    "config": data["config"], "convergence": data["convergence"], "nodes": len(data["infosets"]),
    "rowsChecked": rows, "malformedRows": malformed, "maximumFrequencySumError": max_error,
    "unknownActionLabels": sorted(unknown_actions), "amountsOutsideStartingStack": invalid_amounts,
    "representativeEntries": {key: {"actions": data["infosets"][key]["actions"],
        "hands": {h: data["infosets"][key]["strategy"][h] for h in ("AA", "AKs", "72o")}}
        for key in ("||p|", "||p|b200", "||p|b300")},
    "accepted": False,
    "reason": "Non-all-in postflop equity/checkdown leaves; not a full-action HUNL reference",
}
args.output.write_text(json.dumps(report, indent=2) + "\n")
