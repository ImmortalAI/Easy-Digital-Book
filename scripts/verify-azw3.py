#!/usr/bin/env python3
"""Calibre inspect/round-trip and audit generated AZW3 fixture resources/links."""

from __future__ import annotations

import argparse
import json
import posixpath
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET


CALIBRE = Path("/Applications/calibre.app/Contents/MacOS")
CONTAINER_NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
URL_RE = re.compile(r"url\([\"']?([^\"')]+)[\"']?\)", re.IGNORECASE)


def local_target(source: str, raw: str) -> tuple[str, str] | None:
    parsed = urlsplit(raw.strip())
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    target = posixpath.normpath(posixpath.join(posixpath.dirname(source), path)) if path else source
    return target, unquote(parsed.fragment)


def audit_epub(epub: Path) -> dict:
    with zipfile.ZipFile(epub) as archive:
        names = set(archive.namelist())
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container.find("c:rootfiles/c:rootfile", CONTAINER_NS)
        if rootfile is None:
            raise RuntimeError("EPUB container has no rootfile")
        opf_path = rootfile.attrib["full-path"]
        opf = ET.fromstring(archive.read(opf_path))
        base = posixpath.dirname(opf_path)
        html_paths = [
            path
            for path in names
            if path.lower().endswith((".xhtml", ".html", ".htm"))
        ]
        ids: dict[str, set[str]] = {}
        parsed_html = {}
        for path in html_paths:
            root = ET.fromstring(archive.read(path))
            parsed_html[path] = root
            ids[path] = {
                value
                for node in root.iter()
                for value in (node.attrib.get("id"), node.attrib.get("name"))
                if value
            }

        counts = {"links": 0, "images": 0, "css_images": 0}
        failures = []

        def check(source: str, raw: str, category: str) -> None:
            target = local_target(source, raw)
            if target is None:
                return
            target_path, fragment = target
            counts[category] += 1
            if target_path not in names:
                failures.append(f"{source}: missing {target_path} ({raw})")
            elif fragment and target_path in ids and fragment not in ids[target_path]:
                failures.append(f"{source}: missing #{fragment} in {target_path}")

        css_paths = {
            path for path in names if path.lower().endswith((".css", ".cssf"))
        }
        for path in css_paths:
            css = archive.read(path).decode("utf-8", errors="replace")
            for match in URL_RE.finditer(css):
                raw = match.group(1).strip()
                if raw and not raw.startswith("data:"):
                    check(path, raw, "css_images")

        for path, root in parsed_html.items():
            for node in root.iter():
                for key, raw in node.attrib.items():
                    if key.rsplit("}", 1)[-1] not in ("href", "src"):
                        continue
                    if not raw or raw.startswith("data:"):
                        continue
                    category = "images" if key.rsplit("}", 1)[-1] == "src" and node.tag.rsplit("}", 1)[-1] in ("img", "image") else "links"
                    check(path, raw, category)
                if node.tag.rsplit("}", 1)[-1] == "style" and node.text:
                    for match in URL_RE.finditer(node.text):
                        raw = match.group(1).strip()
                        if raw and not raw.startswith("data:"):
                            check(path, raw, "css_images")

        return {
            "epub": str(epub),
            "html_files": len(html_paths),
            "links": counts["links"],
            "inline_images": counts["images"],
            "css_image_urls": counts["css_images"],
            "failures": failures,
            "all_resolved": not failures,
        }


def run(command: list[str], cwd: Path, output: Path) -> None:
    completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    output.write_text(completed.stdout + completed.stderr, encoding="utf-8")
    if completed.returncode:
        raise RuntimeError(f"{command[0]} exited {completed.returncode}; see {output}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture_dir", type=Path)
    parser.add_argument("--calibre-dir", type=Path, default=CALIBRE)
    args = parser.parse_args()
    fixture_dir = args.fixture_dir.resolve()
    audit_dir = fixture_dir / "calibre-audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for azw3 in sorted(fixture_dir.glob("*.azw3")):
        stem = azw3.stem
        work = audit_dir / stem
        work.mkdir(parents=True, exist_ok=True)
        inspect_dir = work / "inspect"
        inspect_dir.mkdir(exist_ok=True)
        inspect_log = work / "inspect.txt"
        run(
            [str(args.calibre_dir / "calibre-debug"), "--inspect-mobi", str(azw3)],
            inspect_dir,
            inspect_log,
        )
        epub = work / f"{stem}.epub"
        convert_log = work / "convert.txt"
        run(
            [str(args.calibre_dir / "ebook-convert"), str(azw3), str(epub)],
            work,
            convert_log,
        )
        summary = audit_epub(epub)
        summary["azw3"] = str(azw3)
        summary["inspect_log"] = str(inspect_log)
        summary["convert_log"] = str(convert_log)
        summaries.append(summary)

    report = {"fixture_dir": str(fixture_dir), "fixtures": summaries}
    output = audit_dir / "audit.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if summaries and all(summary["all_resolved"] for summary in summaries) else 1


if __name__ == "__main__":
    sys.exit(main())
