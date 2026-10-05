"""Focused standard-library tests for the AZW3 interoperability verifier."""

from __future__ import annotations

import json
import importlib.util
import hashlib
import contextlib
import io
from unittest.mock import patch
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

VERIFY_PATH = Path(__file__).with_name("verify-azw3.py")
VERIFY_SPEC = importlib.util.spec_from_file_location("verify_azw3", VERIFY_PATH)
assert VERIFY_SPEC and VERIFY_SPEC.loader
verify_azw3 = importlib.util.module_from_spec(VERIFY_SPEC)
VERIFY_SPEC.loader.exec_module(verify_azw3)


MANIFEST = {
    "chapters": [
        {"title": "Chapter One", "markers": ["First semantic marker"]},
        {"title": "Chapter Two", "markers": ["Second semantic marker"]},
    ],
    "nav": ["Chapter One", "Chapter Two"],
    "notes": [{"marker": "Note marker", "references": 1}],
    "cover": {
        "path": "Images/cover.png",
        "sha256": hashlib.sha256(b"e28b cover-marker").hexdigest(),
        "marker": "cover-marker",
    },
    "css_markers": ["fixture-css-marker"],
    "image_markers": ["inline-image-marker"],
    "inline_image_count": 1,
    "css_image_count": 1,
}

CHAPTER_ONE = """<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chapter One</h1><p>First semantic marker <img alt="inline-image-marker" src="Images/inline.png"/><a id="noteref-one" href="notes.xhtml#note-one">1</a></p>
</body></html>"""
CHAPTER_TWO = """<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chapter Two</h1><p>Second semantic marker</p>
</body></html>"""
NOTES = """<html xmlns="http://www.w3.org/1999/xhtml"><body>
<aside id="note-one"><a href="chapter-1.xhtml#noteref-one">↩</a> Note marker</aside>
</body></html>"""
NAV = """<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Chapter One</a></li>
<li><a href="chapter-2.xhtml">Chapter Two</a></li></ol></nav></body></html>"""
OPF = """<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test</dc:title></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>
<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>
<item id="cover" href="Images/cover.png" media-type="image/png" properties="cover-image"/>
<item id="css" href="Styles/book.css" media-type="text/css"/>
<item id="inline" href="Images/inline.png" media-type="image/png"/>
<item id="cssimage" href="Images/css.png" media-type="image/png"/>
</manifest><spine><itemref idref="c1"/><itemref idref="c2"/><itemref idref="notes"/></spine>
</package>"""


def write_epub(path: Path, *, replacements: dict[str, bytes | None] | None = None) -> None:
    entries: dict[str, bytes | None] = {
        "META-INF/container.xml": b'''<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>''',
        "OEBPS/book.opf": OPF.encode(),
        "OEBPS/nav.xhtml": NAV.encode(),
        "OEBPS/chapter-1.xhtml": CHAPTER_ONE.encode(),
        "OEBPS/chapter-2.xhtml": CHAPTER_TWO.encode(),
        "OEBPS/notes.xhtml": NOTES.encode(),
        "OEBPS/Styles/book.css": b"/* fixture-css-marker */ body { background: url(../Images/css.png) }",
        "OEBPS/Images/cover.png": b"e28b cover-marker",
        "OEBPS/Images/inline.png": b"inline-image-marker",
        "OEBPS/Images/css.png": b"css-image-marker",
    }
    entries.update(replacements or {})
    with zipfile.ZipFile(path, "w") as archive:
        for name, content in entries.items():
            if content is not None:
                archive.writestr(name, content)


class VerifyAzw3Tests(unittest.TestCase):
    def test_inspection_requires_kf8_only_and_ebok(self) -> None:
        valid = "******** MOBI 8 Header ********\nFile version: 8\nCDE Type (501): b'EBOK'"
        self.assertEqual(verify_azw3.verify_inspection(valid), [])
        joint = valid + "\n******** MOBI 6 Header ********"
        self.assertIn("MOBI 8 header", " ".join(verify_azw3.verify_inspection(joint)))

    def test_calibre_version_is_exactly_pinned(self) -> None:
        verify_azw3.verify_calibre_version("ebook-convert (calibre 9.15.0)\n", "9.15.0")
        with self.assertRaisesRegex(RuntimeError, "expected Calibre 9.15.0"):
            verify_azw3.verify_calibre_version("ebook-convert (calibre 9.16.0)\n", "9.15.0")

    def test_valid_converted_epub_matches_expected_semantic_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            write_epub(epub)
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertEqual(result["failures"], [])
            self.assertTrue(result["semantic_match"])

    def test_missing_chapter_fails_expected_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            write_epub(epub, replacements={"OEBPS/chapter-2.xhtml": None})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("missing expected chapter", " ".join(result["failures"]))

    def test_cover_mismatch_fails_expected_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            write_epub(epub, replacements={"OEBPS/Images/cover.png": b"wrong cover"})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("cover", " ".join(result["failures"]).lower())

    def test_missing_cover_fails_expected_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            write_epub(epub, replacements={"OEBPS/Images/cover.png": None})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("cover", " ".join(result["failures"]).lower())

    def test_missing_note_anchor_fails_expected_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            write_epub(epub, replacements={"OEBPS/notes.xhtml": b"<html><body><aside>Note marker</aside></body></html>"})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("note", " ".join(result["failures"]).lower())

    def test_note_backlink_must_be_the_first_content_element(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            notes = NOTES.replace(
                '<a href="chapter-1.xhtml#noteref-one">↩</a> Note marker',
                'Text before <a href="chapter-1.xhtml#noteref-one">↩</a> Note marker',
            )
            write_epub(epub, replacements={"OEBPS/notes.xhtml": notes.encode()})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("backlink", " ".join(result["failures"]).lower())

    def test_broken_toc_target_fails_expected_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            epub = Path(temporary) / "converted.epub"
            broken_nav = NAV.replace("chapter-2.xhtml", "missing.xhtml")
            write_epub(epub, replacements={"OEBPS/nav.xhtml": broken_nav.encode()})
            result = verify_azw3.audit_epub(epub, MANIFEST)
            self.assertIn("nav", " ".join(result["failures"]).lower())

    def test_missing_calibre_executable_is_a_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            fixture_dir = Path(temporary)
            (fixture_dir / "one.azw3").write_bytes(b"not used because executable is missing")
            missing_calibre = fixture_dir / "missing-calibre"
            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(verify_azw3.__file__).resolve()),
                    str(fixture_dir),
                    "--calibre-dir",
                    str(missing_calibre),
                ],
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("skip", (result.stdout + result.stderr).lower())

    def test_corrupt_fixture_files_make_cli_return_nonzero(self) -> None:
        corruptions = {
            "missing chapter": {"OEBPS/chapter-2.xhtml": None},
            "chapter order": {
                "OEBPS/book.opf": OPF.replace(
                    '<itemref idref="c1"/><itemref idref="c2"/>',
                    '<itemref idref="c2"/><itemref idref="c1"/>',
                ).encode()
            },
            "missing cover": {"OEBPS/Images/cover.png": None},
            "missing note anchor": {
                "OEBPS/notes.xhtml": b"<html><body><aside>Note marker</aside></body></html>"
            },
            "broken TOC target": {
                "OEBPS/nav.xhtml": NAV.replace("chapter-2.xhtml", "missing.xhtml").encode()
            },
        }
        for label, replacements in corruptions.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                fixture_dir = Path(temporary)
                (fixture_dir / "case.azw3").write_bytes(b"fake AZW3 for mocked converter")
                manifest_path = fixture_dir / "manifest.json"
                manifest_path.write_text(json.dumps({"case": MANIFEST}), encoding="utf-8")

                def fake_run(command: list[str], cwd: Path, output: Path) -> None:
                    output.write_text("mocked Calibre output\n", encoding="utf-8")
                    if "--inspect-mobi" in command:
                        report = cwd / "decompiled_case" / "header.txt"
                        report.parent.mkdir(parents=True)
                        report.write_text(
                            "******** MOBI 8 Header ********\nFile version: 8\nCDE Type (501): b'EBOK'",
                            encoding="utf-8",
                        )
                    else:
                        write_epub(Path(command[2]), replacements=replacements)

                completed = subprocess.CompletedProcess(
                    args=["ebook-convert", "--version"],
                    returncode=0,
                    stdout="ebook-convert (calibre 9.15.0)\n",
                    stderr="",
                )
                with (
                    patch.object(sys, "argv", [str(VERIFY_PATH), str(fixture_dir), "--calibre-dir", str(fixture_dir), "--manifest", str(manifest_path)]),
                    patch.object(verify_azw3.subprocess, "run", return_value=completed),
                    patch.object(verify_azw3, "run", side_effect=fake_run),
                    contextlib.redirect_stdout(io.StringIO()),
                ):
                    self.assertEqual(verify_azw3.main(), 1)


if __name__ == "__main__":
    unittest.main()
