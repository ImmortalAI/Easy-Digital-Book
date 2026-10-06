#!/usr/bin/env python3
"""Calibre inspect/round-trip and audit generated AZW3 fixture resources/links."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import re
import subprocess
import sys
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET


CALIBRE = Path(os.environ.get("CALIBRE_DIR", "/Applications/calibre.app/Contents/MacOS"))
MANIFEST_PATH = Path(__file__).resolve().parents[1] / "src/services/azw3/__tests__/fixture-manifest.json"
CONTAINER_NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
URL_RE = re.compile(r"url\([\"']?([^\"')]+)[\"']?\)", re.IGNORECASE)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def text_content(node: ET.Element) -> str:
    return " ".join(" ".join(node.itertext()).split())


def first_content_anchor(node: ET.Element) -> ET.Element | None:
    if node.text and node.text.strip():
        return None
    children = list(node)
    if not children:
        return None
    first = children[0]
    if local_name(first.tag) == "a":
        return first
    return first_content_anchor(first)


def href_path(base: str, href: str) -> str:
    return posixpath.normpath(posixpath.join(base, unquote(urlsplit(href).path)))


def expand_expected_chapters(expected: dict) -> list[dict]:
    if "chapters" in expected:
        return expected["chapters"]
    prefix = expected["chapter_title_prefix"]
    markers = expected.get("chapter_markers", {})
    return [
        {"title": f"{prefix}{number}", "markers": markers.get(str(number), [])}
        for number in range(1, expected["chapter_count"] + 1)
    ]


def local_target(source: str, raw: str) -> tuple[str, str] | None:
    parsed = urlsplit(raw.strip())
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    target = posixpath.normpath(posixpath.join(posixpath.dirname(source), path)) if path else source
    return target, unquote(parsed.fragment)


def audit_epub(epub: Path, expected: dict) -> dict:
    with zipfile.ZipFile(epub) as archive:
        names = set(archive.namelist())
        container = ET.fromstring(archive.read("META-INF/container.xml"))
        rootfile = container.find("c:rootfiles/c:rootfile", CONTAINER_NS)
        if rootfile is None:
            raise RuntimeError("EPUB container has no rootfile")
        opf_path = rootfile.attrib["full-path"]
        opf = ET.fromstring(archive.read(opf_path))
        base = posixpath.dirname(opf_path)
        html_paths = sorted(
            path
            for path in names
            if path.lower().endswith((".xhtml", ".html", ".htm"))
        )
        ids: dict[str, set[str]] = {}
        nodes_by_id: dict[str, dict[str, ET.Element]] = {}
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
            nodes_by_id[path] = {
                value: node
                for node in root.iter()
                for value in (node.attrib.get("id"), node.attrib.get("name"))
                if value
            }

        counts = {"links": 0, "images": 0, "css_images": 0}
        failures: list[str] = []

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

        css_paths = {path for path in names if path.lower().endswith((".css", ".cssf"))}
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

        # Resolve spine reading order and its semantic chapter text. Calibre may
        # split or rename XHTML and rewrite IDs, so this compares visible text
        # and link semantics rather than source filenames or original IDs.
        manifest_items = {
            node.attrib.get("id", ""): node
            for node in opf.iter()
            if local_name(node.tag) == "item"
        }
        spine_paths = []
        for itemref in (node for node in opf.iter() if local_name(node.tag) == "itemref"):
            item = manifest_items.get(itemref.attrib.get("idref", ""))
            if item is not None:
                spine_paths.append(href_path(base, item.attrib.get("href", "")))

        spine_text = [(path, text_content(parsed_html[path])) for path in spine_paths if path in parsed_html]
        spine_headings = [
            (path, text_content(node), node)
            for path in spine_paths
            if path in parsed_html
            for node in parsed_html[path].iter()
            if re.fullmatch(r"h[1-6]", local_name(node.tag).lower())
        ]
        expected_chapters = expand_expected_chapters(expected)
        chapter_paths: list[str] = []
        heading_cursor = 0
        for chapter in expected_chapters:
            title = chapter["title"]
            match_index = next(
                (index for index in range(heading_cursor, len(spine_headings)) if spine_headings[index][1] == title),
                None,
            )
            if match_index is None:
                all_indices = [index for index, (_path, heading, _node) in enumerate(spine_headings) if heading == title]
                issue = "chapter order mismatch" if all_indices else "missing expected chapter"
                failures.append(f"{issue}: {title}")
                chapter_paths.append("")
                continue
            path, _heading, heading_node = spine_headings[match_index]
            content = next(content for source, content in spine_text if source == path)
            heading_cursor = match_index + 1
            chapter_paths.append(path)
            for marker in chapter.get("markers", []):
                if marker not in content:
                    failures.append(f"chapter {title} missing text marker: {marker}")

        # Parse either an EPUB nav document or the NCX used by Calibre 9.15's
        # round-trip conversion. Verify actual href targets against matching
        # chapter documents, allowing rewritten file names and anchor IDs.
        nav_items = []
        nav_targets: list[tuple[str, str]] = []
        ordered_paths = [path for path in spine_paths if path in parsed_html] + [
            path for path in parsed_html if path not in spine_paths
        ]
        for path in ordered_paths:
            root = parsed_html[path]
            for node in root.iter():
                if local_name(node.tag) == "nav" and "toc" in " ".join(
                    value for key, value in node.attrib.items() if local_name(key) in ("type", "role")
                ).lower():
                    for link in node.iter():
                        if local_name(link.tag) in ("a", "content") and link.attrib.get("href", link.attrib.get("src")):
                            href = link.attrib.get("href", link.attrib.get("src", ""))
                            nav_items.append(text_content(link))
                            target = local_target(path, href)
                            nav_targets.append(target or ("", ""))
        for item in (node for node in opf.iter() if local_name(node.tag) == "item"):
            if item.attrib.get("media-type") == "application/x-dtbncx+xml":
                ncx_path = href_path(base, item.attrib.get("href", ""))
                if ncx_path in names:
                    ncx = ET.fromstring(archive.read(ncx_path))
                    for content in (node for node in ncx.iter() if local_name(node.tag) == "content"):
                        parent_text = ""
                        # The nearest navPoint's label is its human-visible target.
                        for point in (node for node in ncx.iter() if local_name(node.tag) == "navPoint"):
                            if content in list(point.iter()):
                                label = next(
                                    (text_content(label_node) for label_node in point.iter() if local_name(label_node.tag) == "text"),
                                    "",
                                )
                                parent_text = label
                                break
                        nav_items.append(parent_text)
                        target = local_target(ncx_path, content.attrib.get("src", ""))
                        nav_targets.append(target or ("", ""))
        expected_nav = expected.get("nav", [])
        if not expected_nav and "nav_title_prefix" in expected:
            expected_nav = [
                f"{expected['nav_title_prefix']}{number}"
                for number in range(1, expected["nav_count"] + 1)
            ]
        if expected_nav:
            matched = []
            cursor = 0
            for expected_title in expected_nav:
                next_index = next(
                    (index for index in range(cursor, len(nav_items)) if nav_items[index] == expected_title),
                    None,
                )
                if next_index is None:
                    failures.append(f"nav missing or out of order: {expected_title}")
                    continue
                matched.append((nav_targets[next_index], expected_title))
                cursor = next_index + 1
            for index, (target, expected_title) in enumerate(matched):
                target_path, fragment = target
                expected_path = chapter_paths[index] if index < len(chapter_paths) else ""
                if target_path not in names or (expected_path and target_path != expected_path):
                    failures.append(f"nav target mismatch for {expected_title}: {target_path}")
                    continue
                if fragment:
                    target_node = nodes_by_id.get(target_path, {}).get(fragment)
                    if target_node is None:
                        failures.append(f"nav target missing #{fragment} for {expected_title}: {target_path}")
                        continue
                    target_headings = [
                        text_content(node)
                        for node in target_node.iter()
                        if re.fullmatch(r"h[1-6]", local_name(node.tag).lower())
                    ]
                    if re.fullmatch(r"h[1-6]", local_name(target_node.tag).lower()):
                        target_headings.insert(0, text_content(target_node))
                    # A wrapper may contain the chapter heading and its body;
                    # use the first heading at the target, or exact text for
                    # direct paragraph/anchor targets. Substring matching here
                    # confuses prefix-colliding titles such as Chapter 1/10.
                    target_title = target_headings[0] if target_headings else text_content(target_node)
                    if target_title != expected_title:
                        failures.append(f"nav target anchor belongs to a different chapter for {expected_title}: #{fragment}")
                elif chapter_paths.count(expected_path) > 1:
                    failures.append(f"nav target is ambiguous without an anchor for {expected_title}: {target_path}")

        # Every expected note must be present, receive the expected number of
        # noteref links, and begin its content with a working backlink.
        all_links = []
        for path in ordered_paths:
            root = parsed_html[path]
            for node in root.iter():
                if local_name(node.tag) == "a" and node.attrib.get("href"):
                    all_links.append((path, node, local_target(path, node.attrib["href"])))
        for note in expected.get("notes", []):
            marker = note["marker"]
            note_path = next((path for path, content in ((path, text_content(root)) for path, root in parsed_html.items()) if marker in content), None)
            if note_path is None:
                failures.append(f"note missing marker: {marker}")
                continue
            note_container = next(
                (
                    node
                    for node in parsed_html[note_path].iter()
                    if node.attrib.get("id")
                    and marker in text_content(node)
                    and (
                        "endnote" in node.attrib.get("class", "").split()
                        or "footnote" in node.attrib.get("class", "").split()
                        or "endnote" in node.attrib.get("{http://www.idpf.org/2007/ops}type", "").split()
                        or local_name(node.tag) == "aside"
                    )
                ),
                None,
            )
            note_id = note_container.attrib.get("id") if note_container is not None else None
            if note_id is None:
                failures.append(f"note missing address: {marker}")
                continue
            inbound = [
                (source, node)
                for source, node, target in all_links
                if target and target[0] == note_path and target[1] == note_id
            ]
            if len(inbound) != note.get("references", 1):
                failures.append(f"note reference count mismatch for {marker}: {len(inbound)}")
            note_node = next(
                (node for node in parsed_html[note_path].iter() if node.attrib.get("id") == note_id),
                None,
            )
            backlink = first_content_anchor(note_node) if note_node is not None else None
            back_target = local_target(note_path, backlink.attrib["href"]) if backlink is not None and backlink.attrib.get("href") else None
            first_reference = next(
                ((source, node.attrib["id"]) for source, node in inbound if node.attrib.get("id")),
                None,
            )
            if back_target is None or back_target != first_reference:
                failures.append(f"note missing backlink to a reference: {marker}")

        cover = expected.get("cover")
        if cover:
            cover_href = None
            cover_id = None
            metadata_cover_id = next(
                (node.attrib.get("content") for node in opf.iter() if local_name(node.tag) == "meta" and node.attrib.get("name") == "cover"),
                None,
            )
            for item in manifest_items.values():
                if "cover-image" in item.attrib.get("properties", "") or item.attrib.get("id") == metadata_cover_id:
                    cover_href = item.attrib.get("href")
                    break
            cover_path = href_path(base, cover_href or "") if cover_href else ""
            if not cover_path or cover_path not in names:
                failures.append("expected cover missing from OPF or archive")
            else:
                cover_bytes = archive.read(cover_path)
                if hashlib.sha256(cover_bytes).hexdigest() != cover["sha256"]:
                    failures.append("cover fingerprint mismatch")

        for marker in expected.get("css_markers", []):
            if not any(marker in archive.read(path).decode("utf-8", errors="replace") for path in css_paths):
                failures.append(f"CSS marker missing: {marker}")
        for marker in expected.get("image_markers", []):
            found = any(
                marker in text_content(root)
                or any(marker == node.attrib.get("alt") for node in root.iter())
                for root in parsed_html.values()
            )
            if not found:
                failures.append(f"image marker missing: {marker}")
        for key, category in (("inline_image_count", "images"), ("css_image_count", "css_images")):
            if key in expected and counts[category] != expected[key]:
                failures.append(f"{category} count mismatch: expected {expected[key]}, found {counts[category]}")

        return {
            "epub": str(epub),
            "html_files": len(html_paths),
            "links": counts["links"],
            "inline_images": counts["images"],
            "css_image_urls": counts["css_images"],
            "failures": failures,
            "all_resolved": not failures,
            "semantic_match": not failures,
        }


def run(command: list[str], cwd: Path, output: Path) -> None:
    try:
        completed = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    except OSError as error:
        output.write_text(str(error) + "\n", encoding="utf-8")
        raise RuntimeError(f"could not run {command[0]}; see {output}: {error}") from error
    output.write_text(completed.stdout + completed.stderr, encoding="utf-8")
    if completed.returncode:
        raise RuntimeError(f"{command[0]} exited {completed.returncode}; see {output}")


def verify_inspection(header: str) -> list[str]:
    failures = []
    headers = re.findall(r"\*+ (MOBI \d+ Header) \*+", header)
    if headers != ["MOBI 8 Header"]:
        failures.append(f"expected only a MOBI 8 header, found {headers or 'no MOBI header'}")
    if not re.search(r"File version:\s*8\b", header):
        failures.append("inspection does not report MOBI file version 8")
    if "CDE Type (501): b'EBOK'" not in header:
        failures.append("inspection does not report EBOK content type")
    return failures


def verify_calibre_version(output: str, required: str) -> None:
    if f"calibre {required}" not in output:
        raise RuntimeError(f"expected Calibre {required}, got: {output.strip() or 'no version output'}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture_dir", type=Path)
    parser.add_argument("--calibre-dir", type=Path, default=CALIBRE)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()
    calibre_dir = args.calibre_dir.expanduser().resolve()
    fixture_dir = args.fixture_dir.resolve()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    fixture_stems = {path.stem for path in fixture_dir.glob("*.azw3")}
    manifest_stems = set(manifest)
    if fixture_stems != manifest_stems:
        missing = sorted(manifest_stems - fixture_stems)
        unexpected = sorted(fixture_stems - manifest_stems)
        details = []
        if missing:
            details.append(f"missing fixture files: {', '.join(missing)}")
        if unexpected:
            details.append(f"fixtures without manifest entries: {', '.join(unexpected)}")
        print("AZW3 fixture/manifest mismatch: " + "; ".join(details), file=sys.stderr)
        return 1
    audit_dir = fixture_dir / "calibre-audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    version_log = audit_dir / "calibre-version.txt"
    try:
        version_result = subprocess.run(
            [str(calibre_dir / "ebook-convert"), "--version"],
            cwd=fixture_dir,
            text=True,
            capture_output=True,
        )
    except OSError as error:
        version_log.write_text(str(error) + "\n", encoding="utf-8")
        raise RuntimeError(f"could not run Calibre version check; see {version_log}: {error}") from error
    version_output = version_result.stdout + version_result.stderr
    version_log.write_text(version_output, encoding="utf-8")
    if version_result.returncode:
        raise RuntimeError(f"Calibre version check exited {version_result.returncode}; see {version_log}")
    verify_calibre_version(version_output, "9.15.0")
    summaries = []
    for azw3 in sorted(fixture_dir.glob("*.azw3")):
        stem = azw3.stem
        work = audit_dir / stem
        work.mkdir(parents=True, exist_ok=True)
        inspect_dir = work / "inspect"
        inspect_dir.mkdir(exist_ok=True)
        inspect_log = work / "inspect.txt"
        run(
            [str(calibre_dir / "calibre-debug"), "--inspect-mobi", str(azw3)],
            inspect_dir,
            inspect_log,
        )
        header_files = list(inspect_dir.rglob("header.txt"))
        if len(header_files) != 1:
            raise RuntimeError(f"expected one Calibre header inspection for {stem}, found {len(header_files)}")
        inspection_failures = verify_inspection(header_files[0].read_text(encoding="utf-8", errors="replace"))
        if inspection_failures:
            raise RuntimeError(f"{stem}: " + "; ".join(inspection_failures))
        epub = work / f"{stem}.epub"
        convert_log = work / "convert.txt"
        run(
            [str(calibre_dir / "ebook-convert"), str(azw3), str(epub)],
            work,
            convert_log,
        )
        expected = manifest.get(stem)
        if expected is None:
            raise RuntimeError(f"no expected semantic manifest for fixture: {stem}")
        summary = audit_epub(epub, expected)
        summary["azw3"] = str(azw3)
        summary["inspect_log"] = str(inspect_log)
        summary["header_report"] = str(header_files[0])
        summary["convert_log"] = str(convert_log)
        summaries.append(summary)

    report = {"fixture_dir": str(fixture_dir), "fixtures": summaries}
    output = audit_dir / "audit.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if summaries and all(summary["all_resolved"] and summary["semantic_match"] for summary in summaries) else 1


if __name__ == "__main__":
    sys.exit(main())
