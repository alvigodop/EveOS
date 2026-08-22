from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 450
EXTENSIONS = {".js", ".css", ".html", ".py"}

# The module policy governs World Portal's own source. Vendored outer tools are
# read-only upstream code and are never reformatted to satisfy our rules; see
# docs/OUTER-TOOLS.txt. .git is skipped so packed objects are never read as text.
SKIPPED_PARTS = {"__pycache__", ".git", "node_modules"}

violations = []
skipped_trees = set()
for path in ROOT.rglob("*"):
    if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
        continue
    relative = path.relative_to(ROOT)
    parts = set(relative.parts)
    blocked = parts & SKIPPED_PARTS
    vendored = relative.parts[0] == "outer"
    if blocked or vendored:
        if vendored:
            skipped_trees.add("outer")
        continue
    lines = len(path.read_text(encoding="utf-8").splitlines())
    if lines > LIMIT:
        violations.append((path.relative_to(ROOT), lines))

if violations:
    for path, lines in violations:
        print(f"{path}: {lines} lines (limit {LIMIT})")
    sys.exit(1)

note = " Vendored outer tools were skipped." if skipped_trees else ""
print(f"Source line cap passed: every checked file is <= {LIMIT} lines.{note}")
