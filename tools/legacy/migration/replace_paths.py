"""Legacy text-path migration with an explicit target and dry-run default."""

from __future__ import annotations

import argparse
from pathlib import Path


TEXT_SUFFIXES = {".js", ".css", ".html"}


def migrate(target: Path, old: str, new: str, apply: bool) -> int:
    if not target.is_dir():
        raise FileNotFoundError(f"Target directory does not exist: {target}")

    changed = 0
    for path in target.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        content = path.read_text(encoding="utf-8")
        if old not in content:
            continue
        changed += 1
        action = "Updating" if apply else "Would update"
        print(f"{action} {path}")
        if apply:
            path.write_text(content.replace(old, new), encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", type=Path, help="Directory whose text assets should be scanned")
    parser.add_argument("--old", default="main_js_files/", help="Text to replace")
    parser.add_argument("--new", default="js/modules/gemini/", help="Replacement text")
    parser.add_argument("--apply", action="store_true", help="Write changes; otherwise only report")
    args = parser.parse_args()

    count = migrate(args.target.expanduser().resolve(), args.old, args.new, args.apply)
    verb = "Updated" if args.apply else "Would update"
    print(f"{verb} {count} file(s).")


if __name__ == "__main__":
    main()
