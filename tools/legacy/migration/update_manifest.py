"""Legacy Gemini manifest migration with explicit paths and dry-run safety."""

from __future__ import annotations

import argparse
from pathlib import Path


SCRIPTS = (
    "js/modules/gemini/gemini-init.js",
    "js/modules/gemini/Script_Loader/Script_Loader.js",
)


def relative_css(project_root: Path, css_root: Path) -> list[str]:
    return sorted(
        path.relative_to(project_root).as_posix()
        for path in css_root.rglob("*.css")
        if path.is_file()
    )


def insert_missing(content: str, marker: str, values: list[str], label: str) -> str:
    missing = [value for value in values if value not in content]
    if not missing:
        return content
    marker_at = content.find(marker)
    if marker_at < 0:
        raise ValueError(f"Manifest marker was not found: {marker}")
    bracket_at = content.find("[", marker_at)
    closing_at = content.find("]", bracket_at)
    if bracket_at < 0 or closing_at < 0:
        raise ValueError(f"Manifest array is malformed near: {marker}")
    lines = [f"        // {label}"] + [f"        '{value}'," for value in missing]
    insertion = "\n" + "\n".join(lines) + "\n"
    return content[:closing_at] + insertion + content[closing_at:]


def migrate(project_root: Path, manifest: Path, css_root: Path) -> str:
    if not manifest.is_file():
        raise FileNotFoundError(f"Manifest does not exist: {manifest}")
    if not css_root.is_dir():
        raise FileNotFoundError(f"CSS directory does not exist: {css_root}")
    content = manifest.read_text(encoding="utf-8")
    content = insert_missing(content, "scripts:", list(SCRIPTS), "Gemini integration")
    return insert_missing(content, "styles:", relative_css(project_root, css_root), "Gemini styles")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_root", type=Path, help="Legacy project root")
    parser.add_argument("--manifest", type=Path, help="Manifest path; defaults under project_root")
    parser.add_argument("--css-root", type=Path, help="Gemini CSS root; defaults under project_root")
    parser.add_argument("--apply", action="store_true", help="Write changes; otherwise only report")
    args = parser.parse_args()

    project_root = args.project_root.expanduser().resolve()
    manifest = (args.manifest or project_root / "js" / "config" / "manifest.js").resolve()
    css_root = (args.css_root or project_root / "css" / "modules" / "gemini").resolve()
    before = manifest.read_text(encoding="utf-8") if manifest.is_file() else ""
    after = migrate(project_root, manifest, css_root)
    changed = before != after
    if changed and args.apply:
        manifest.write_text(after, encoding="utf-8")
    print(("Updated" if args.apply else "Would update") if changed else "No changes needed", manifest)


if __name__ == "__main__":
    main()
