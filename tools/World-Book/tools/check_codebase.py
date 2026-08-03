from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CAP = 450
CODE_SUFFIXES = {".py", ".js", ".css", ".html", ".part"}


def line_count(path: Path) -> int:
    return sum(1 for _ in path.open(encoding="utf-8", errors="ignore"))


def check_line_cap() -> list[str]:
    failures = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        if path.suffix not in CODE_SUFFIXES and not path.name.endswith(".js.part"):
            continue
        count = line_count(path)
        if count > CAP:
            failures.append(f"{path.relative_to(ROOT)} has {count} lines (cap: {CAP})")
    return failures


def run(command: list[str]) -> list[str]:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        return [f"{' '.join(command)} failed:\n{result.stderr or result.stdout}"]
    return []


def check_python() -> list[str]:
    files = [ROOT / "server.py", ROOT / "worldbook_runtime/bootstrap.py"]
    files.extend(sorted((ROOT / "worldbook_runtime/layers").glob("*.py")))
    return run([sys.executable, "-m", "py_compile", *map(str, files)])


def check_javascript() -> list[str]:
    failures = []
    failures.extend(run(["node", str(ROOT / "tools/check_tag_picker.js")]))
    failures.extend(run(["node", str(ROOT / "tools/check_injection.js")]))
    failures.extend(run(["node", str(ROOT / "tools/check_links.js")]))
    failures.extend(run(["node", str(ROOT / "tools/check_integrity.js")]))
    failures.extend(run(["node", str(ROOT / "tools/check_v014.js")]))
    failures.extend(run(["node", str(ROOT / "tools/check_v015.js")]))
    standalone = [
        path for path in (ROOT / "app/assets/js").rglob("*.js")
        if path.name not in {"app.js", "taxonomy.js"}
    ]
    for path in sorted(standalone):
        failures.extend(run(["node", "--check", str(path)]))
    manifest_path = ROOT / "app/assets/js/app/chains/manifest.json"
    names = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = "".join((manifest_path.parent / name).read_text(encoding="utf-8") for name in names)
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as handle:
        handle.write(source)
        temporary = Path(handle.name)
    try:
        failures.extend(run(["node", "--check", str(temporary)]))
    finally:
        temporary.unlink(missing_ok=True)
    return failures


def check_css() -> list[str]:
    failures = []
    for path in sorted((ROOT / "app/assets/css/layers").glob("*.css")):
        text = path.read_text(encoding="utf-8")
        if text.count("{") != text.count("}"):
            failures.append(f"Unbalanced CSS braces in {path.relative_to(ROOT)}")
    return failures


def check_html_ids() -> list[str]:
    text = (ROOT / "app/index.html").read_text(encoding="utf-8")
    text += "".join(path.read_text(encoding="utf-8") for path in sorted((ROOT / "app/fragments").glob("*.html")))
    identifiers = re.findall(r'\bid="([^"]+)"', text)
    duplicates = sorted({value for value in identifiers if identifiers.count(value) > 1})
    failures = [f"Duplicate HTML id: {value}" for value in duplicates]
    javascript = "".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (ROOT / "app/assets/js").rglob("*") if path.is_file()
    )
    references = set(re.findall(r'getElementById\("([^"]+)"\)', javascript))
    missing = sorted(references - set(identifiers))
    failures.extend(f"Missing HTML id referenced by JavaScript: {value}" for value in missing)
    return failures


def main() -> int:
    failures = []
    failures.extend(check_line_cap())
    failures.extend(check_python())
    failures.extend(check_javascript())
    failures.extend(check_css())
    failures.extend(check_html_ids())
    if failures:
        print("CODEBASE CHECK FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("CODEBASE CHECK PASSED")
    print(f"All maintained code files are at or below {CAP} lines.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
