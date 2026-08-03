# World Book v0.13 Architecture

The application is organized as layered chains so each maintained source stays small and replaceable.

## Python onion

`server.py` -> `worldbook_runtime/bootstrap.py` -> ordered files in `worldbook_runtime/layers/manifest.json`.
Each layer is compiled with its own filename into one shared runtime namespace. This preserves the simple standard-library server while separating foundation, taxonomy, state, workspace I/O, transfers, copy scope, snapshots, recovery, routing, and startup.

## Browser onion

`index.html` loads `bootstrap.js`. The bootstrap inserts semantic HTML fragments, loads reusable components, assembles the ordered app chain in memory, then activates the independent recovery controller.

## CSS onion

`assets/css/app.css` contains only ordered imports. Base tokens, layout, editor/dialogs, focus mode, links/themes, responsive rules, drag/tags, and recovery each live in separate layers.

## Recovery layers

Portable JSON remains suited to review and selective state restore. Full Recovery ZIP stores exact workspace bytes, state, imported snapshots, portable JSON, a manifest, and SHA-256 hashes. Restore verifies before writing and creates a rollback before active-state replacement.

## External integration onion

`integration/core.js` owns path and provenance primitives. `operations.js` owns protected mutations. `planner.js` validates, clones, applies, and records idempotent plans. `ui.js` handles paste/file input, preview, rollback, apply, and history. The server exposes only a narrow state-rollback endpoint; injection planning remains local in the browser.


See CANON_GRAPH_SPEC.md for v0.12 canonical graph behavior.

## Canon Integrity onion

`integrity/core.js` owns scan state, canonical context, finding fingerprints, and report ordering.
`integrity/rules.js` contains independent advisory detectors. `integrity/ui.js` renders the dedicated
view and persists only ignored findings and intentional scaffolding marks. The scan never mutates lore.
`16_integrity_state.py` preserves this small reconciliation state through save, restore, and backup.

See CANON_INTEGRITY_SPEC.md for v0.13 behavior.
