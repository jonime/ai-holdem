"""Export screenshots and action/screenshot-only traces, excluding HTTP and storage data."""
import json
import pathlib
import re
import shutil
import sys
import zipfile

source, output = map(pathlib.Path, sys.argv[1:])
output.mkdir(parents=True, exist_ok=True)
for path in source.rglob("*"):
    if path.is_file() and path.suffix == ".png":
        target = output / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    elif path.is_file() and path.name == "cleanup-summary.txt":
        lines = [line for line in path.read_text().splitlines()
                 if re.fullmatch(r"(?:Guest release|Deletion) failed for run table [0-9a-f-]{36}|Browser context cleanup failed", line)]
        target = output / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(lines))
    elif path.is_file() and path.name == "trace.zip":
        target = output / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(path) as raw, zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as clean:
            # Never export network events, DOM snapshots, sources or body resources.
            screenshot_resources = set()
            for name in raw.namelist():
                data = raw.read(name)
                if name.endswith(".trace"):
                    events = []
                    for line in data.decode().splitlines():
                        event = json.loads(line)
                        if event.get("type") == "screencast-frame":
                            events.append(event)
                            if isinstance(event.get("file"), str):
                                screenshot_resources.add(event["file"])
                            elif isinstance(event.get("sha1"), str):
                                screenshot_resources.add("resources/" + event["sha1"])
                        elif event.get("type") in ("before", "after"):
                            action = {key: event[key] for key in
                                      ("type", "callId", "startTime", "endTime", "apiName", "class", "method", "pageId")
                                      if key in event}
                            if event["type"] == "before":
                                action["params"] = {}
                            if "error" in event:
                                action["error"] = {"name": "Error", "message": "Action failed (details removed)"}
                            events.append(action)
                        elif event.get("type") == "context-options":
                            context = {key: event[key] for key in
                                       ("type", "version", "origin", "browserName", "platform", "wallTime", "monotonicTime", "sdkLanguage", "contextId", "playwrightVersion")
                                       if key in event}
                            context["options"] = {}
                            events.append(context)
                    clean.writestr(name, "\n".join(json.dumps(event) for event in events))
            for name in screenshot_resources:
                data = raw.read(name)
                if data.startswith(b"\xff\xd8\xff"):
                    clean.writestr(name, data)
