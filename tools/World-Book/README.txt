EVE OS WORLD BOOK — v0.15.0

V0.15.0 COLLAPSIBLE WORLD BOOK HEADER
--------------------------------------
- Added a Collapse header button directly inside World Book's own header.
- Collapsed mode hides Workspace, Mount path, Refresh, and the action row while keeping a compact World Book strip with an Expand header control.
- The setting persists in the browser and behaves the same standalone, detached, or embedded in EveOS.
- This is a UI-only update: lore, recovery files, server lifecycle preferences, and portable state schema 10 remain unchanged.

V0.14.0 AUTHOR CONTROL, RECOVERY, AND PROVENANCE
------------------------------------------------
- Added user-created Smart Collections with a normal Create/Edit interface.
- Added a rule builder for relationship + target, semantic kind, status, ALL tags, and ANY tags.
- Added live match previews before a Smart Collection can be saved.
- Added a manual semantic-kind selector for canonical World Book entries.
- Added recoverable virtual deletion, Undo delete, a Deleted Items view, Restore, and deliberate permanent purge.
- Restored entries keep their stable IDs, so existing links and shortcuts reconnect automatically.
- Added visible entry provenance: source, known-as-of boundary, confidence, and creator.
- Added non-owning Eve Injection provenance operations and provenance support on patch/upsert.
- Copy Scope now includes node role, semantic kind, entry provenance, relationship type, and relationship provenance.
- Added an in-app Eve Injection guide and one-click Copy context guide for a fresh AI context.
- Portable state schema is now 10.


V0.13.1 SMART COLLECTION RELIABILITY
-----------------------------------
- Fixed tag-filtered smart collections so they read effective tag names correctly.
- Eve Injection smart-collection rules may use relationshipTargetPath instead of embedding an internal entry ID.
- Added classify / set-semantic-kind operations for assigning smart-collection categories without duplicating entries or transferring their ownership.
- This hotfix is required for the Chapter 1 introduced-element collections.

V0.13.0 CANON INTEGRITY
----------------------
Added a dedicated Reconciliation / Canon Integrity view.
- Scans the World Book for broken shortcuts, broken or duplicate links, duplicate identity risks,
  mirrored relationship prose, lens copies that may become shortcuts, empty canonical sources,
  manual chapter indexes that may become smart collections, mostly-empty scaffolding branches,
  and provenance gaps.
- Findings are advisory and never reorganize or rewrite lore automatically.
- Open affected entries directly, ignore a finding, restore it later, or mark a large branch as
  intentional scaffolding.
- Search and filter findings by severity and issue type from a dedicated Integrity tab.
- Preserves typed-link relationship and provenance fields during server-side state normalization.

V0.12.2 BIDIRECTIONAL LINKS
--------------------------
The Links panel now shows both directions of the World Book graph.
- From here: links owned by the current entry.
- To here: files or folders whose links point to the current entry.
- All links: both directions together.
Incoming links use the inverse relationship wording and open their source entry, so you can
move back and forth without duplicating information. Incoming relationships are edited from
the source that owns them, preserving a single authority for every link.

V0.12.1 RECOVERY HOTFIX
-----------------------
Full Recovery Backup self-validation now ignores unrelated manifest.json files whose
JSON root is an array or another non-object value. This is required when the mounted
workspace contains Eve OS itself, because its layer and fragment manifests are arrays.


V0.11.2 EVE INJECTION SPACING POLISH
- Added breathing room between the ownership notice and JSON controls.
- Added separation between the JSON control row and Injection JSON field.
- Added space below Preview safely before history or preview results.
- Kept the spacing fix isolated in its own CSS layer.

V0.11.1 EVE INJECTION RESPONSIVE PANEL
- Eve Injection now sizes itself from the usable browser viewport instead of letting its inner card exceed the dialog shell.
- The panel grows on large screens and shrinks cleanly on narrow or short windows.
- Horizontal clipping and the bottom horizontal scrollbar are removed.
- JSON, preview, and history areas use viewport-aware height limits while keeping their own scrolling.
- Buttons wrap into practical rows on small windows, and all long text is allowed to wrap safely.

V0.11.0 EVE INJECTION
- Added controlled external JSON integration for focused World Book updates.
- Paste JSON or load a .json file, preview every planned change, then apply explicitly.
- Existing entries are protected unless they carry the hidden manual tag "Injected from Eve".
- New injected entries receive that hidden tag and internal provenance automatically.
- Supported operations: upsert/create, patch/update, move, rename, additive tags, sharing, visibility, and links.
- Missing parent folders can be created along the requested path without touching existing user content.
- Applied injection ID + revision pairs are idempotent and kept in recent history.
- Every apply creates an automatic state rollback before replacing active state.
- Automatic rollback JSON files can be restored through the normal Import JSON workflow.
- The Links section is now collapsible and its preference persists.
- EVE_INJECTION_SPEC.md records the permanent ownership and generation rules.

V0.10.2 TAG FILTER HOTFIX
- Find entries now shows matching tag suggestions while you type.
- Choose a suggestion or press Enter/comma to apply the tag filter.
- A runtime regression check now protects the tag picker from missing module-local helpers.


V0.10.1 UI HOTFIX
- Find entries now responds to the usable panel width instead of overflowing behind the window edge.
- Tag overview loads its compact layer correctly, has clearer heading spacing, smaller cards, and a bounded scroll area.

WHAT CHANGED
v0.2 is no longer a file://-only prototype. It runs on localhost so it can safely work with a real folder on your PC.

START IT
1. Extract this ZIP somewhere permanent.
2. Double-click launch.bat.
3. Your browser should open http://127.0.0.1:8766/
4. Enter a workspace path such as C:\Lex-Temp and click Mount path.

The server binds only to 127.0.0.1, so other computers cannot access it.

LIVE PHYSICAL WORKSPACE
The Live files tab mirrors the configured Windows folder.
You can:
- Browse real folders and files
- Preview supported text files
- Preview DOCX text
- Edit supported text files directly
- Create physical folders
- Create physical .txt/.md/etc. files
- Rename physical files and folders
- Open files/folders in their normal Windows application
- Reveal entries in File Explorer
- Attach tags, canon status, and connected notes without changing file contents

SUPPORTED PREVIEW
Text-like formats such as TXT, MD, JSON, HTML, CSS, JS, PY, XML, YAML, CSV, logs, configs, and source code.
DOCX is readable as extracted text but is preview-only.
Unsupported formats can still be opened externally.

WORLD BOOK TAB
The previous virtual World Book still exists for entries that do not need to be physical files.
A v0.1 JSON export can be imported and migrated.

EXPORT SNAPSHOT
Export snapshot creates a portable JSON file containing:
- Project settings
- Virtual World Book data
- Tags/status/notes attached to physical paths
- The physical folder/file index
- Extracted content from readable files, within safety limits
- Metadata for unreadable/binary files

IMPORTS TAB
A v0.2 snapshot imports as a read-only archive.
It does not overwrite or recreate physical files.
This lets you browse captured text later even if the original path moved or disappeared.

DATA LOCATION
Server settings and metadata are stored inside:
data\config.json
data\state.json
data\imports\

Your physical writing files remain wherever you mounted them.

SAFETY
- There is no physical delete button in v0.2.
- Every backend path is restricted to the mounted workspace root.
- Export snapshots regularly.
- Stop the app with Ctrl+C in its command window.

PORT
Default: 8766
Alternative:
py server.py --port 9000


V0.3 SIDEBAR
- Drag the narrow divider between the sidebar and editor to resize it.
- Deep trees keep full names and can scroll horizontally instead of swallowing entries.
- The chosen sidebar width is saved in World Book state.

LIVE FILES TO WORLD BOOK
1. Select a physical file or folder.
2. Click Copy to World Book.
3. Choose a virtual destination folder.
4. The physical source remains untouched.
Readable contents and the nested structure are copied into virtual entries.

WORLD BOOK TO LIVE FILES
1. Select a virtual World Book file or folder.
2. Click Export ZIP to Live.
3. Enter a destination relative to the mounted workspace.
4. The server creates a physical ZIP there.

Every World Book ZIP includes _EVE_WORLDBOOK_METADATA.json so statuses,
tags, folder notes, IDs, and source paths are preserved with the text files.


V0.4 TAG LIBRARY
- Entry tags are chips instead of comma-separated typing.
- Click the tag box to select an existing tag.
- Type a new name once and press Enter to create it.
- Reuse tags such as Core Group across any number of entries.
- The Tags tab shows every tag, usage counts, attached entries, and latest activity.
- Filters support ALL selected tags or ANY selected tag.
- Results combine physical workspace entries and virtual World Book entries.
- Results sort by most recent update, oldest update, or name.

CUSTOM STATUSES
- Statuses are no longer hard-coded display names.
- Create custom statuses and rename existing statuses globally.
- Status IDs remain stable when a display name changes, so attached entries do not break.
- An in-use status cannot be deleted until its entries are reassigned.


V0.5 COPY SCOPE
A new Copy scope button sits beside Expand all and Collapse all in the sidebar.
It works in Live Files and World Book.

Scope choices:
- Selected branch
- Entire current tree

Copy modes:
- Folders only: folder and subfolder path tree
- Folders + files: complete tree without contents
- Full contextual copy: tree plus readable file contents, tags, status names,
  connected notes, filesystem/metadata edit times, and virtual created/edited times

The generated text is copied to the clipboard and can also be downloaded as TXT.
Choose Unicode branches for a visual tree or ASCII branches for maximum compatibility.


V0.6 FOCUS MODE
- Click Focus in the header or press Ctrl+Shift+F.
- The large header, footer, sidebar, and resize divider collapse away.
- A small floating dock remains with Tree, Details, and Exit focus controls.
- Tree opens the sidebar temporarily as an overlay and closes after you select an entry.
- Details reveals or hides status, tags, and entry-detail panels.
- The active file/editor expands to use almost the full browser window.
- Escape closes the temporary tree first, then exits focus mode.


V0.7 LINKS
- Every live or virtual entry can link to one or more virtual World Book files/folders.
- Links sit below Connected notes.
- Each link may use a custom display name.
- Clicking a link opens the target World Book source.
- The Back button returns to the entry that sent you there.
- Edit or remove links without duplicating source information.
- Missing/deleted targets remain visible as broken links until repaired or removed.
- Full Copy Scope output and World Book ZIP metadata now include links.

V0.7 THEMES
- Normal preserves the original Eve OS World Book appearance.
- Dark provides a complete dark palette.
- Custom allows manual control of background, panels, sidebar, text, muted text,
  accent, soft accent, borders, and danger colors.
- Theme changes preview live and save inside the World Book state.


V0.8 MOVING AND REORDERING
- World Book files and folders can be dragged directly in the sidebar.
- Drop above or below an entry to reorder beside it.
- Drop in the middle of a folder to move the entry inside it.
- Drop a child above or below one of its ancestors to move it back up a level.
- The World Book root accepts dropped entries as top-level content.
- Links remain valid after a move because they follow stable entry IDs instead of paths.
- Invalid moves into the entry itself or one of its descendants are blocked.
- The editor also includes a Move button for a precise folder picker.
- Undo move restores the most recent drag or move-dialog action.

V0.8 EFFECTIVE TAGS
Tags now have three independent sources:
- Manual: attached directly to the current entry.
- Shared: selected manual tags inherited from parent folders.
- Path: automatic tags generated from ancestor folder names below the book container.

Shared and Path tags are calculated instead of copied into every descendant. Moving an
entry therefore removes old Path tags, gains its new Path tags, and inherits only the
Shared tags from its new ancestry without leaving stale duplicates behind.

COMPACT TAG DISPLAY
- The main editor shows only tags selected for the compact view.
- Hiding a chip does not detach the tag or remove it from search/filtering.
- Manage opens the complete tag stack for the selected entry.
- The manager shows each tag's source, whether it is manually attached, whether it is
  shown beside status, and—on folders—whether it is shared with all descendants.
- Show all and Hide all change only the compact display.
- Existing v0.7 manual tags remain visible during migration.

AUTOMATIC PATH TAGS
- Path tags are enabled by default for virtual World Book entries.
- Example: Characters / Main Character / Leon / Info gives Info the automatic tags
  Characters, Main Character, and Leon.
- World Book Manager and the top book-container folder are excluded to avoid noise.
- The automation can be disabled from an entry's Manage tags panel.
- Tag search, ALL/ANY filtering, usage counts, and Copy Scope use effective tags.

SNAPSHOT EXPORT REPAIR
- Repaired the snapshot builder error that could stop v0.7 exports.
- Export now saves current state first and reports a readable error instead of silently failing.
- Physical folder metadata is captured as well as physical file metadata.
- v0.8 snapshots include manual, shared, and visible tags plus the path-tag automation settings needed to reconstruct effective tags.


V0.9 FULL RECOVERY
- Backup & Restore center separates portable JSON from exact Full Recovery ZIP.
- Full ZIP includes original workspace bytes, active state, imported snapshots, portable JSON, manifest, and SHA-256 checksums.
- Recovery ZIPs are inspected and verified before restore.
- Restore modes: World Book state, physical workspace, or everything.
- Physical restore defaults to a new folder and supports skip-existing or explicit overwrite.
- Active-state restores create an automatic rollback JSON first.
- Full recovery can remount the restored workspace when restoring everything.
- JSON snapshot import now supports archive, virtual World Book restore, or full state restore.

V0.9 MODULARIZATION
- Maintained source files are capped at 450 lines.
- Python, browser app logic, HTML dialogs, taxonomy, and CSS were split into ordered onion layers.
- CODEBASE_RULES.md records the permanent modularization and preservation doctrine.
- ARCHITECTURE.md explains the chained runtime.


CODEBASE CHECKS
- Run tools\run_checks.bat or python tools/check_codebase.py.
- Run python tools/verify_recovery_backup.py <backup.zip> for an independent checksum verification.

See CANON_GRAPH_SPEC.md for v0.12 canonical graph behavior.
