from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from worldbook_runtime.bootstrap import load_runtime


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python tools/verify_recovery_backup.py <backup.zip>")
        return 2
    runtime = load_runtime()
    result = runtime["inspect_recovery_backup"](Path(sys.argv[1]).expanduser().resolve(), True)
    manifest = result["manifest"]
    print(f"Project: {(manifest.get('project') or {}).get('title', 'Unknown')}")
    print(f"Created: {manifest.get('createdAt', 'Unknown')}")
    print(f"Verified files: {result['verifiedFiles']}")
    if result["integrityOk"]:
        print("Integrity: PASS")
        return 0
    print("Integrity: FAIL")
    for failure in result["failures"]:
        print(f"- {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
