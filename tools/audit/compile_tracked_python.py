#!/usr/bin/env python3
"""Compile tracked Python sources without descending into ignored local runtimes."""

from __future__ import annotations

import py_compile
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def tracked_python_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    return [
        ROOT / raw.decode("utf-8", errors="surrogateescape")
        for raw in result.stdout.split(b"\0")
        if raw.endswith(b".py")
    ]


def main() -> int:
    files = tracked_python_files()
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="eveos-python-audit-") as raw_temp:
        temp = Path(raw_temp)
        for index, file_path in enumerate(files):
            if not file_path.is_file():
                failures.append(f"missing tracked source: {file_path.relative_to(ROOT)}")
                continue
            try:
                py_compile.compile(
                    str(file_path),
                    cfile=str(temp / f"{index}.pyc"),
                    doraise=True,
                )
            except py_compile.PyCompileError as error:
                failures.append(str(error))

    if failures:
        for failure in failures[:40]:
            print(failure, file=sys.stderr)
        if len(failures) > 40:
            print(f"... {len(failures) - 40} more failure(s)", file=sys.stderr)
        return 1

    print(f"TRACKED_PYTHON_COMPILE_OK ({len(files)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
