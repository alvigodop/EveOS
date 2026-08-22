WORLD PORTAL — MULTI-WORLD GEOGRAPHY SYSTEM
Version 0.20.0


WORLD PORTAL 0.20 — PORTABLE AGENT SKILL SYSTEM
World Portal now carries its planetary-refinement operating knowledge with the
project instead of relying on one long-running Eve conversation. The portable
World Portal Agent Skill — Planetary Refinement is model-neutral and can be
shared with ChatGPT, another chat, a local model, Claude, Gemini, Codex-like
agents, or a future MCP bridge.

The skill lives under skills/world-portal-refinement/. SKILL.md is its predictable
entrypoint. Static doctrine explains the world model, evidence rules, mission
workflow, safety boundary, glossary, schemas, and generic examples. At export
time World Portal also generates capability and parameter documentation directly
from the installed capability manifest so agent instructions do not silently
drift away from the executable command set.

The canonical plan protocol is now world-portal-agent-plan version 1. Existing
world-portal-eve-plan files remain accepted as a backwards-compatible alias. Eve
Guided Mode remains the user-facing workflow, but Eve is now one agent identity
rather than a requirement of the protocol.

Agent-ready context ZIPs include eve-briefing.json plus agent-skill/SKILL.md, the
current capability manifest, parameter ranges, intent map, diagnostic checklist,
schemas, worked examples, and portable single-file editions. The briefing also
records skill/protocol compatibility and keeps creative refinement intent as
world/mission data rather than baking one world's preferences into the global
skill.

Eve Guided Mode adds controls to copy full or compact agent instructions, copy a
model starter prompt, download a standalone world-portal-refinement-skill.zip,
download single-file Markdown or JSON skills, and download the skill together
with the active world context. Lab Intelligence ZIPs include the same skill.

The safety boundary is unchanged: an agent writes declarative plans; World Portal
validates, executes, owns layers and missions, controls confirmation, records
provenance, and produces final Orogen exports.

WHAT WORLD PORTAL IS
World Portal is a world-owned geography environment. The active world is the
root domain object, not merely a background image. Each world owns its entire
geographic branch:

World
  -> surface map image
  -> continents
     -> countries and territories
        -> focused maps
           -> boundaries, measurements, rivers, lakes
           -> subdivisions, states, provinces, and future nested layers
  -> current visual and projection settings

Earth remains the built-in world and owns the existing NASA surface and all
bundled country geography. Custom world maps become independent world records
with their own metadata collections.

STARTING ON WINDOWS
1. Extract this files-only patch directly over the existing project folder.
2. Double-click launch.bat.
3. Keep the server window open.
4. World Portal opens automatically in the browser.

NETWORK ACCESS
World Portal runs its own local HTTP server and keeps all world data in the
browser, but it is not fully offline:
- server.py downloads the NASA Blue Marble texture on first launch and caches it
  under assets/textures/. Later launches reuse the cached file.
- index.html resolves three.js 0.185.1 from the jsdelivr CDN through an import
  map, so a launch needs network access unless the browser has already cached
  those modules.
- Check Orogen revision runs git ls-remote against the fixed upstream main ref
  only when the user presses the button. It never runs automatically or sends
  world data.
No world image, layer, mission, plan, or export ever leaves the machine. To run
without any network, vendor three.js into assets/ and repoint the import map.

WORLD LIBRARY
The World library panel controls the active planet.

- Active world switches the visible surface and owning geography hierarchy.
- Add world map accepts PNG, JPEG, or WebP images.
- A 2:1 equirectangular image is recommended for correct globe wrapping.
- Save current world stores the custom image, metadata, and view settings in
  the browser's IndexedDB world library.
- Export world package downloads a portable .world-portal.json file. Version 5
  packages can include Heightmap Forge and Orogen-derived layer assets, sessions,
  refinement lineage, and celestial-system metadata.
- Import world package restores the image and all packaged metadata.
- Remove world deletes the custom map and every metadata collection it owns.

The built-in Earth cannot be removed, so the portal always has a valid fallback
world. Earth can still be exported as a portable copy. Exporting Earth gathers
the bundled country geography records before creating the package.

CONTROL PANEL WORK AREAS
The control panel keeps all existing controls and IDs but groups its 17 panels
into four collapsible work areas:
- World: active planet, library, landmass measurements, and geography;
- Terrain workflow: Heightmap Forge, Outer Tool Port, Refinement Lab, missions,
  and guided workflows;
- Map appearance: surface, hex, overlays, clouds, and lighting; and
- View and space: projection, scale, motion, and orbital bodies.

Group collapse state is stored separately from each panel's own collapse state,
so reorganizing the panel does not discard established controls or preferences.
On first load, World and Terrain workflow are open, with World Library,
Landmasses, and Outer Tools expanded; Map appearance and View and space start
collapsed.

HEIGHTMAP FORGE
Heightmap Forge is an additive, browser-only converter for preparing the active
world's visual map for World Orogen. Open it with Prepare for Orogen in the
control panel.

The converter:
- loads the active world's original visual map without overwriting it;
- normalizes the map to a chosen 2:1 equirectangular output using explicit
  stretch, center-crop, or padding modes;
- lets the user click the ocean to sample its color;
- supports color tolerance, connected-ocean flood fill, and edge ocean seeds;
- writes every designated ocean pixel to exact grayscale 0;
- removes small connected land speckles, optionally keeps the largest landmass,
  fills small holes, and smooths compression-damaged coastlines;
- generates deterministic elevation from coast distance and seeded terrain noise;
- previews the original map, land mask, and grayscale heightmap side by side;
- validates dimensions, land coverage, landmass counts, tiny islands, ocean
  blackness, and maximum elevation;
- exports PNG heightmaps and binary land masks;
- saves both derivative assets beside the active world's original surface.

Default output is 4096 x 2048. 2048 x 1024 and 8192 x 4096 are also available.
PNG is always used for heightmap output so compression cannot turn black ocean
pixels into accidental low-elevation land.

Heightmap Forge does not require AI. The same source, controls, and random seed
produce the same output. Advanced mountain brushes and optional AI suggestions
can be added later without replacing the deterministic converter.

WORLD PACKAGE OWNERSHIP
A saved custom world is one self-contained record containing:
- world identity and name
- map image Blob and source filename
- surface projection information
- continents
- countries and territories grouped by owning continent
- focused country geography records
- boundaries, rivers, lakes, and measurements
- subdivision/state extension collections
- optional Heightmap Forge land mask, heightmap, settings, and validation report
- optional World Orogen satellite, climate, biome, mask, and height layers
- current projection, hex, style, lighting, and layer settings

Because this information is stored under one world record, deleting the world
removes its map and owned metadata together rather than leaving orphan records.

EARTH GEOGRAPHY
Earth continues to provide:
- NASA Blue Marble equirectangular surface
- continent and country labels
- 233 country and territory geography records
- focused country boundaries
- physical measurements
- mapped rivers and lakes
- detailed country maps
- subdivision/state extension points

CUSTOM WORLD METADATA
A newly added image begins with an empty hierarchy. Its world record already
owns the correct metadata slots, so future tools can add continents, countries,
states, rivers, lakes, and focused maps without changing the architecture.
Imported world packages can already populate these collections.

VIEW SETTINGS
Each world keeps its own current view settings in memory. Saving the world
persists those settings with it. Switching worlds restores that world's saved
projection, hex conversion, colors, lighting, layers, motion, planet size,
satellite visibility, and collapsed-section layout.

PLANET, SATELLITE, AND PROJECTION CONTROLS
- Planet size scales the active world's globe, flat map, frame, atmosphere,
  labels, focus distances, and satellite system as one relational unit.
- Planet spin is time-based, so the selected speed remains consistent on 60 Hz,
  120 Hz, 144 Hz, and other display refresh rates.
- Pause spin stops the planet rotation and its satellite motion together;
  cloud drift remains independent.
- Satellite objects (moons) can be shown or hidden without deleting them or any
  world metadata.
- During the globe-to-flat transform, left drag performs full orbital pitch/yaw
  rotation while curvature remains, and right drag pans the transforming world.
  A drag during a preset animation is preserved instead of being replaced by the
  preset's default camera view.

COLLAPSIBLE CONTROL SECTIONS
Every main control-panel section has its own expand/collapse button. The collapsed
section list is part of the active world's view state, so different worlds can
keep different control-panel layouts. The top World Portal brand collapse still
hides or restores the complete panel.

CENTRAL DOMAIN GATEWAY
assets/js/world/world-portal.js is the canonical owner and access gateway. UI
modules do not directly decide which geography is active. They request the
active world's records through World Portal.

Supporting modules:
- assets/js/world/world-library-store.js: IndexedDB persistence and active ID
- assets/js/world/world-package.js: portable export/import packages
- assets/js/ui/world-manager.js: world library controls
- assets/js/world/world-events.js: shared state and ownership event contract

OUTER TOOLS AND THE OROGEN BOUNDARY
World Portal hosts complete external applications as outer tools. An outer tool
is another program that travels in the same repository and is launched by the
same local server; it is not a library, a dependency, or a World Portal module.
World Orogen is the first outer tool. The full contract is docs/OUTER-TOOLS.txt.

Orogen remains a separately maintained GPLv3 project. It is carried as a pinned
git submodule, served at its own path, embedded in World Portal inside its own
iframe, and never edited. The iframe has its own document, realm, and import map.
World Portal does not import Orogen modules, merge import maps, alter upstream
source, or drive Orogen settings or DOM controls.

"Intimate integration" means coordinated operation of two states, not shared
JavaScript state. World Portal owns versioned, world-keyed handoff, sync, intake,
provenance, extractor, update-check, and view-mirror connectors. Every handoff
and return is associated with a world ID, handoff ID, and the checked-out Orogen
commit; a world switch invalidates a stale attachment instead of silently
applying one world's result to another.

Each world retains up to 24 handoff manifests and marks one current handoff.
Return intake is enabled only for a complete current handoff for that same
world, tool, and full Orogen commit; mismatched or partial intake is refused or
rolled back instead of leaving half-imported evidence. Returned images do not
embed a World Portal handoff ID, so selecting them declares their association
with that current handoff; it does not cryptographically prove their origin.

The preferred direct transport is an upstream-supported, capability-negotiated
postMessage endpoint with source, origin, protocol-version, world, and handoff
validation. The pinned upstream does not currently expose that endpoint. Current
compatibility transports are finalized file/data intake, guarded host-side
startup-heightmap substitution for World sync, and a camera-interactive connected
mirror. planet-mirror@1 remains the rendered visual transport. For pinned Orogen
commit cc2662b4edd52231c4f65d8765f3ef12cd82d9b7, World Portal owns a same-origin,
commit-audited fallback that relays only primary drag when unmodified, the wheel
zoom family, and host pinch-to-wheel gestures to the exact full-tuple import
canvas for camera orbit and zoom. Wheel-family input includes Chromium trackpad
pinch emitted as Ctrl+wheel; Alt/Meta/Shift-modified wheel is rejected. This is
not keyboard forwarding. A semantic planet-camera-input@1 postMessage capability
is preferred for a future upstream revision; the pinned commit does not
implement it.

Mirror Planet shows the exact synced import page's main Orogen planet and galaxy
canvas in World Portal's main view. The stage fills the usable viewport beside
the HUD, or the full viewport on compact/collapsed layouts. While the port is
parked, its same live iframe is rendered at that measured rectangle, so Orogen's
camera responds to the real aspect ratio and its WebGL backing store follows the
browser's device-pixel ratio instead of enlarging a smaller capture. Contain is
retained only as a safe fit. Presentation does not auto-zoom Orogen's camera.

The pinned, audited fallback also tracks the local geographic direction produced
by primary Orogen camera drags. Switching to Orogen first aligns it to World
Portal through bounded canvas camera gestures; Orogen drags then update the
hidden World Portal camera, and switching back applies the latest direction
before reveal. World Portal's automatic globe spin is held only while Orogen is
the selected view so the two views do not drift. Zoom and Orogen's optional
Auto-Rotate setting remain Orogen-owned rather than shared semantic state.

Settings UI, keyboard, right/middle buttons, edit gestures, data actions, and
Alt/Meta/Shift-modified wheel remain port-only and are never relayed. Input is
cancelled on view, world, frame, sync, handoff, or commit mismatch. Canvas capture
is best effort: if the surface is missing, not origin-clean, or browser-blocked,
the UI reports mirror unavailable and keeps the World Portal planet.

While the connected view is shown, the port iframe remains layout-active so its
camera, renderer, and settings survive, but it is invisible and inert. Reopening
the port restores native Orogen behavior. A world, revision, token, handoff,
tool, or commit change reloads the bound import view; explicit Reload always
reloads it.

The Landmasses panel prefers the newest recognized Orogen-returned mask, then the
canonical mask, then the newest remaining mask. It shows complete connected,
significant, and tiny-island counts plus spherical area/coverage and the 12
largest cosine-weighted components. Each row reports area and north-south/
east-west raster bounding spans, not one invented "length". The source layer,
tool, version/commit, and repository are displayed, including explicit
"not recorded" values when provenance is missing.

Physical units use the world's selected radius (6371 km default, positive and
capped at 1,000,000 km). Custom worlds autosave it in view state; local settings
provide the app/Earth fallback. Counts depend on mask threshold, cleanup,
resolution, and seam handling. Distances scale with radius and areas with radius
squared.
East-west span is unavailable for a seam-crossing component unless an upstream
circular-longitude span exists. These are generalized estimates, not coastline
lengths or survey measurements.

Upstream changes are checked only when the user asks. The Check Orogen revision
action compares the checked-out commit with the current upstream main ref and
reports whether the ref points at a different commit for review. It never
fetches, checks out, merges, or repoints the submodule.
Actual updates are deliberate repository maintenance, never an automatic launch
or background action.

Portable outer-tool defaults live in tracked
assets/data/outer-tools.default.json. Server-generated live status and
world-specific sync state are ignored runtime files, so a normal launch does not
rewrite a tracked registry or dirty a clean checkout.

This architecture is designed to keep the projects separately maintained and
separately licensed, but an iframe or data boundary is not a legal guarantee.
GPL classification depends on the mechanism and semantics of the coupling. The
canvas input relay is stronger coupling than pixel display alone and must be
included in legal review. See the GNU GPL FAQ's "Mere Aggregation" discussion
and obtain legal advice before distribution:
https://www.gnu.org/licenses/gpl-faq.html#MereAggregation

DEVELOPER ACCESS
window.WorldPortal exposes:
- world: the currently active world
- worlds: summaries of every loaded world
- portal.getActiveSurface()
- portal.getContinents(), getCountries(), and getCountry()
- portal.loadCountryRecord()
- portal.addWorld(), activateWorld(), saveActiveWorld(), and removeWorld()
- portal.replaceActiveMetadata()
- portal.materializeActiveWorld()
- describe()
- heightmapForge.open(), close(), buildPreview(), and getCurrentResult()

PROJECT STRUCTURE
- index.html: application shell and world library controls
- assets/js/world: world ownership, derivative assets, persistence, events, and packages
- assets/js/heightmap: Heightmap Forge UI, worker processing, export, and Orogen adapter
- assets/js/geo: bundled Earth source records and coordinate utilities
- assets/js/ui: presentation and interaction modules
- assets/js/scene: Three.js scene, replaceable surface, projection, and shaders
- assets/data/country-geography: bundled Earth country geography
- assets/textures: built-in Earth texture cache and attribution
- server.py: local HTTP server and built-in Earth texture preparation
- tools: development-only dataset and source-line utilities
- tests: dependency-free unit tests for the pure logic modules
- docs: architecture notes

MODULE POLICY
Every active HTML, CSS, JavaScript, and Python source file remains at or below
450 lines. New capabilities must remain modular rather than expanding one
controller into a monolith.

  python tools/check-source-lines.py

TESTS
The pure, browser-free modules are covered by Node's built-in test runner. There
is no package.json, no install step, and no dependency:

  node --test "tests/*.test.mjs"

Covered today: Orogen finalization and validation invariants, the equirectangular
analysis math, and agent plan validation including the unsafe-content scan.
Modules that decode images or touch IndexedDB are exercised in the browser
instead. Tests are excluded from the 450-line module cap.


WORLD PORTAL 0.15 — PERSISTENT PLANETARY REFINEMENT
World Portal now treats World Orogen exports as evidence owned by the same world
that produced them. Open Orogen Refinement Lab from the control panel to import
several images at once, assign or correct their roles, compare passes, and create
new non-destructive source candidates.

DURABLE LOCAL WORLDS
- New custom worlds are written to IndexedDB immediately.
- World names, map Blobs, Heightmap Forge outputs, Orogen outputs, sessions,
  refinement passes, celestial bodies, and view settings survive reloads.
- The last active world reopens automatically.
- Debounced autosave runs after meaningful changes and displays Saving, Saved
  locally, Save failed, or Storage nearly full.
- Save current world remains an explicit checkpoint, not the only protection.
- Removing a world deletes its complete owned record in one IndexedDB transaction.

DERIVED LAYER REGISTRY
Every custom world may own source, derived, analysis, interpretation, repaired,
confidence, and composite layers. Each layer stores its type, dimensions, format,
projection, source tool, timestamps, notes, checksum when available, session,
pass, parent layers, analysis, status, and canonical state.

The batch importer recognizes common World Orogen names such as:
- orogen-landmask-*
- orogen-land-heightmap-*
- orogen-satellite-*
- orogen-climate-*
- biome, terrain, classified-region, and custom images

Filename inference is only a starting point. Use Edit or the role selector to
correct a layer. Unknown Orogen settings are recorded as Settings incomplete
rather than fabricated. Climate and classification colors are stored without
biome interpretation unless a known legend is supplied.

OROGEN ANALYSIS SESSIONS AND PASSES
Related exports are grouped into an analysis session. Numeric pass tokens in the
filenames create imported-run lineage records automatically. Later mask repairs,
heightmap composites, confidence layers, and synthesized textures can be saved as
new refinement passes with parent references. Previous results are never erased.

COMPARISON AND PHYSICAL ANALYSIS
The Refinement Lab supports opacity blend, side-by-side, swipe, and mask-
difference views. Mask difference colors shared land, Layer A-only land, Layer
B-only land, and shared ocean separately.

Physical analysis may report:
- land coverage, connected landmasses, tiny islands, and largest component;
- centroid, bounding box, coastline edges, and coastline complexity;
- minimum, maximum, average, and percentile elevation;
- lowland, hill, mountain, and peak coverage;
- neighboring-pixel terrain roughness;
- explicit global-land or near-empty anomalies.

These are physical observations, not automatic lore.

PLANETARY REFINEMENT LOOP
The supported deterministic loop is:

Original visual map
  -> Heightmap Forge normalized visual, mask, and heightmap
  -> World Orogen analysis run
  -> Orogen layer import
  -> comparison, consensus, repair, and fusion
  -> new canonical mask and heightmap
  -> next World Orogen run

Mask operations include union, intersection, Layer A preference, Layer B
preference, multi-pass voting, confidence maps, and actual removal of connected
components below the selected tiny-island threshold. Majority voting can reject
a near-global-land failure when multiple better runs agree.

Heightmap fusion includes weighted blending, contrast, smoothing, median multi-
pass fusion, and interior-detail recovery. Interior-detail recovery adds local
ridges and terrain variation from an Orogen result without forcing the entire
Orogen elevation field to replace the source. Lock canonical coastline clips all
elevation to the accepted mask, keeps ocean exactly black, and prevents terrain
processing from changing the intended continent silhouette.

CANONICAL TEXTURE SYNTHESIS
Choose a normalized source visual as Layer A, an Orogen satellite or terrain map
as Layer B, and an accepted mask. Synthesize refined visual map preserves Layer
A's ocean while blending Layer B only inside the land mask. Save the result as a
new layer, then explicitly promote it when it is ready. The source visual remains
in the registry.

EXPORT FOR THE NEXT OROGEN PASS
Export Orogen input set writes the current canonical land-mask PNG, canonical
heightmap PNG, and a JSON provenance manifest. The manifest records world IDs,
layer IDs, checksums when available, refinement lineage, and the upstream Orogen
repository boundary.

CELESTIAL SYSTEM
The old single fixed Moon has become a world-owned celestial system. Each world
may add moons, asteroids, icy bodies, gas bodies, and ring systems. Per-object
controls include name, kind, size, orbit radius, orbit speed, inclination, color,
and visibility. Satellite objects can still be hidden globally without deleting
them. Pause spin freezes the planet and orbital bodies together; clouds continue
their independent drift.


WORLD PORTAL 0.16 — EVE-GUIDED PLANET INTELLIGENCE
World Portal now exposes imported layers as conversation-ready physical evidence.
The selected-layer panel includes richer shape, placement, terrain, raster,
provenance, anomaly, and comparison measurements instead of only basic counts.

DEEP LAYER INTELLIGENCE
Mask reports now include raw and spherical area-corrected coverage, largest and
top-three landmass shares, effective landmass count, fragmentation, patch density,
component-size distribution, geographic centroid, latitude and hemisphere shares,
longitude/latitude extent, antimeridian and pole contact, coastline edge density,
coastal-pixel share, deep-interior shares, coast depth, component compactness, and
anomaly flags.

Heightmap reports now include relief, area-weighted mean, P05-P99 percentiles,
P90-P10 contrast, standard deviation, hypsometric integral, elevation entropy,
lowland/hill/mountain/peak shares, roughness, slope proxies, ridge/valley evidence,
highland systems, peak candidates, near-black land risk, clipping risk, highest
point, elevation center, and latitude-band elevation means.

Visual, satellite, climate, and classified layers expose aspect ratio, exact 2:1
status, transparency, exact black/white shares, luminance distribution, RGB channel
statistics, grayscale share, saturation, palette concentration, dominant colors,
color entropy, texture complexity, and conservative role hints. Palette meanings
are not guessed without a known legend.

Choose Copy report to place a plain-language intelligence report on the clipboard
for chat. Download report JSON preserves the same metadata in a machine-readable
record. Selecting a compatible Layer B also reports mask overlap, spherical
agreement, elevation error/correlation, or visual-image differences.

EVE GUIDED MODE
The Eve Guided Mode panel offers a simpler round trip over Heightmap Forge and the
Orogen Refinement Lab:
1. Export World to Eve.
2. Upload the .eve-context.zip in chat.
3. Import the returned .eve-plan.json.
4. Review the objective, commands, warnings, and required confirmations.
5. Apply the allow-listed plan locally.
6. Build the best current Orogen input.

The context ZIP includes world identity, canonical layers, the layer registry,
sessions, passes, current settings, installed capabilities, deep statistics,
plain-language reports, compact previews, and optional full-resolution canonical
assets. Identical preview assets are deduplicated by checksum when available.

Eve plans are declarative JSON. They cannot execute arbitrary JavaScript, HTML,
shell commands, filesystem paths, or unknown operations. World Portal validates
world identity, context freshness, layer references, supported capabilities, and
confirmation requirements before execution. Canonical promotion always requires
explicit user confirmation.

The file-based protocol works without a live connector. Future MCP, Eve OS, local
agent, or desktop bridges should use the same versioned capabilities rather than
creating a second automation architecture. See docs/EVE-INJECTION-PROTOCOL.txt.

IMAGE CONTAINER METADATA
Orogen batch imports also inspect the file container without sending it anywhere.
For PNG files, reports can include bit depth, color model, alpha/profile state,
interlacing, gamma, chunk inventory, and embedded text fields. JPEG reports may
include JFIF density, encoding precision, progressive state, ICC/XMP/EXIF presence,
and selected non-GPS EXIF fields. WebP reports include its chunk and extended flags.
World Portal may report that a GPS metadata block exists, but it does not extract
or place GPS coordinates into Eve context bundles.

WORLD PORTAL v0.16.1 — OROGEN OUTPUT FINALIZATION FIX
=====================================================
This focused patch corrects the Eve-guided Build Best Orogen Input path.

Heightmap Forge regeneration commands now create persistent full-resolution world layers and return concrete layer IDs. Eve plans may pass those IDs into later commands with either:

  $result.<command-id>.<field>

or an object containing fromCommand and field.

The Orogen finalizer resolves its mask and heightmap when the command executes. It no longer relies on an earlier canonical selection. When a newer generated output exists but has not been selected, export stops and asks the user to choose instead of silently falling back to an older layer.

Before download, World Portal now:
- converts both selected layers to the requested exact 2:1 dimensions;
- writes the mask as strict 0/255 binary pixels;
- forces ocean elevation to 0;
- raises accepted land to at least the configured coast floor;
- removes height outside the mask;
- guarantees identical mask and heightmap land support;
- encodes both PNGs;
- decodes the PNGs again and validates their pixels and dimensions;
- hashes the exact encoded PNG byte arrays that are downloaded.

The manifest records selected source-layer IDs, generated final-layer IDs, final dimensions, land and nonzero counts, support agreement, coast floor, finalization settings, validation, corrections, and final PNG SHA-256 values.

No existing world, source layer, imported Orogen pass, or refinement lineage is overwritten.


WORLD PORTAL v0.17.0 — REFINEMENT MISSIONS
==========================================
Refinement Mission Mode is the operator layer above Heightmap Forge, Orogen
Refinement Lab, Eve Guided Mode, durable persistence, and strict Orogen input
finalization. It does not replace those engines. It keeps track of the loop so
the user no longer has to remember which files, layers, sessions, or passes
belong together.

Each custom world may own an active mission with one highlighted next action:
- Prepare Baseline in Heightmap Forge
- Send Baseline to Orogen
- Import Orogen Results
- Ask Eve to Review
- Import or Apply Eve Recommendation
- Build Next Orogen Input

A mission records its canonical baseline, downloaded Orogen input, expected
return roles, imported Orogen sessions, automatic comparisons, Eve context,
Eve plan and execution, accepted layers, checkpoints, and pass lineage.

AUTOMATIC OROGEN INTAKE
Drop land-mask, land-heightmap, satellite, climate, biome, terrain, and related
Orogen exports together. World Portal groups them by numeric run token, infers
roles from filenames and pixel structure, records uncertainty, verifies their
resolution against the mission baseline, imports them as linked analysis
sessions, and immediately compares the returned mask and heightmap with the
baseline. Uncertain or anomalous results remain provisional evidence.

MISSION ACCURACY
Fast, Balanced, High accuracy, and Forensic profiles tune:
- context preview resolution;
- how many relevant layers receive fresh analysis and previews;
- Orogen filename-role confidence required for automatic intake;
- strict baseline-dimension matching;
- whether full-resolution mission evidence is recommended for Eve.

The underlying mask and height comparisons remain deterministic. The profile
controls evidence scope and automatic-decision strictness rather than changing
the world silently.

CURATED EVE CONTEXT
Export World to Eve now includes the active mission, its baseline, latest Orogen
session, comparison results, current next action, installed capabilities, and a
curation manifest. The bridge state names canonical and newer generated layers,
latest finalization, context accuracy, preview/full-resolution coverage, mission
state, and missing prerequisites.

The Eve capability manifest now exposes the deterministic operations already
owned by World Portal:
- refinement.mergeMasks
- refinement.generateConsensusMask
- refinement.fuseHeightmaps
- refinement.synthesizeVisualMap
- refinement.createPass

CLEAR LAB IMAGES
The Orogen Refinement Lab has a Clear lab images button. It removes imported
Orogen runs and non-canonical provisional refinement images in one confirmed
action. The original visual map, Heightmap Forge baseline, and current canonical
visual/mask/heightmap are preserved. Mission state returns to its baseline step.

SAFE ROLLBACK
Return to Previous Accepted Pass restores the earlier accepted canonical mask,
heightmap, and visual references while keeping later evidence in the world. No
mission action silently destroys the original map or previous passes.

See docs/REFINEMENT-MISSIONS.txt for the persistent workflow contract.

WORLD PORTAL v0.17.1 — REFINEMENT LAB STARTUP FIX
===================================================
This focused maintenance update fixes the JavaScript parser failure that could
leave World Portal stuck at “Loading World Portal surface…”. The Orogen session
import fallback mixed the nullish-coalescing operator with logical OR without
explicit grouping. Browsers reject that expression before any Refinement Lab
code can run. The fallback is now explicitly parenthesized and syntax-safe.

The Refinement Lab is also more modular:
- orogen-lab-controller.js coordinates the workspace and is now 355 lines;
- orogen-layer-list.js owns layer-card rendering, editing, canonical selection,
  comparison shortcuts, and per-layer removal;
- orogen-lab-session-actions.js owns Orogen batch import, form reset, progress,
  active-session assignment, and Clear lab images;
- orogen-session-importer.js remains responsible for file interpretation and
  layer/session creation;
- orogen-lab-cleanup.js remains responsible for ownership-safe bulk removal.

A failure in one of these focused modules is easier to isolate, and the main
controller is no longer at the source-line ceiling. No world data, mission data,
canonical layers, or existing refinement behavior is changed by this patch.



WORLD PORTAL v0.18.0 — OROGEN EVIDENCE ASSIMILATION
====================================================
World Portal now distinguishes hard canonical geography from soft simulated
evidence. A complete Orogen run is no longer accepted or rejected as one unit.
Each imported layer can carry separate coastline, height, visual, and climate
trust plus one of five statuses: canonical-safe, provisional, anomalous but
useful, rejected, or archived.

FINALIZATION STYLES
- Clean / Canonical keeps the accepted coastline conservative and prioritizes
  mechanically safe output.
- Hybrid / Balanced removes remote noise while recovering supported coastline
  character, nearby companion islands, and interior terrain detail.
- Feature-Preserving retains more expressive coastline bends, protrusions,
  islands, ridges, valleys, and local relief.

The cleanest output is not automatically considered the best worldbuilding
result. Every style creates new child layers for comparison and optional
promotion. Original and canonical parents remain intact.

EVIDENCE OPERATIONS
- Global-land masks are automatically excluded from coastline voting.
- Trusted masks may recover details only within a tunable distance from the
  canonical coast or as supported nearby connected islands.
- Orogen heightmaps are clipped and normalized inside an accepted mask before
  their ridges and local relief can influence the canonical baseline.
- Land-only visual synthesis preserves the original ocean while compositing a
  satellite or terrain interpretation onto land.
- Climate and classified rasters expose land-scoped color coverage and latitude
  bands. Provisional environmental-zone layers may be generated, but World
  Portal does not invent biome or climate names without a supplied legend.

The primary action Build refined next-pass pair creates a feature-aware mask, a
support-matched heightmap, and a reversible refinement-pass record. The result
remains provisional until the user reviews or promotes it. Eve plans may invoke
the same allow-listed evidence operations.

See docs/OROGEN-EVIDENCE-ASSIMILATION.txt for the complete ownership, safety,
and interpretation contract. The World Portal parent commit records a pinned
Orogen gitlink; an initialized submodule fetches pristine upstream source under
its own GPLv3 license, and World Portal does not modify it.

WORLD PORTAL v0.19.0 — EVE MISSION ORCHESTRATION
================================================
- Eve plans can create or recover a persistent Refinement Mission before any manual mission setup.
- Mission records are world-agnostic and support optional planet, continent, island, region, and custom-map scopes.
- Semantic selectors resolve canonical, generated, Orogen-session, mission-pass, and trust-ranked layers during validation.
- Ambiguous selectors stop for review instead of guessing.
- Eve can inspect and propose repairs for missing or incorrect canonical visual, mask, heightmap, dimensions, and baseline references.
- High-level refinement intent is translated into deterministic Clean, Hybrid, Feature-Preserving, or custom parameters.
- Eve plans can generate all review candidates, compare them, pause for visual judgment, and resume after selection.
- Paused plan state, completed command results, resume position, and pending decisions persist with the world.
- Candidate selection does not automatically promote canonical layers.
- A high-level mission.prepareNextOrogenInput command orchestrates the existing Forge, Refinement Lab, Evidence Assimilation, and Orogen Finalizer engines.
- Eve context bundles now include mission-control status, missing prerequisites, semantic selectors, generated candidates, pending decisions, capabilities, and parameter ranges even before a mission exists.
- The collapsed World Portal brand panel now sizes to its content instead of clipping its bottom edge.

WORLD PORTAL v0.19.1 — SELECTED EXPORT INTEGRITY AND LAB INTELLIGENCE
====================================================================
This focused update fixes the final mission-export path and makes the complete
Refinement Lab evidence state readable in one operation.

SELECTED-CANDIDATE EXPORT INTEGRITY
Build Selected Orogen Input now resolves sources in this order:
1. explicit mask and heightmap IDs supplied by the current Eve command;
2. the active Refinement Mission's selected candidate pair;
3. the active mission pass's accepted output pair;
4. canonical mask and heightmap only when no mission selection exists.

A selected candidate may no longer silently fall back to unrelated canonical
layers. The confirmation screen and manifest identify the mission, pass,
candidate, source mask, source heightmap, source land count, source component
count, requested coast floor, applied coast floor, and final land count.
Every export attempt creates a world-owned audit record, including blocked or
cancelled attempts, requested and resolved sources, validation, and exact final
PNG checksums.

LAB INTELLIGENCE OVERVIEW
The Orogen Refinement Lab can now analyze and summarize all world-owned layers
at once. The overview exposes role, resolution, status, evidence trust,
anomalies, key land/elevation statistics, candidate membership, and analysis
cache state. Users can select several compatible layers and generate a mask,
heightmap, or visual comparison matrix.

Mass-copy actions provide structured JSON for the complete layer registry, the
current Orogen session, selected layers, mission state, all candidates,
comparison matrices, the latest export audit, or the complete Eve briefing.
Copy format may be formatted JSON, compact JSON, or a Markdown JSON block.
Large clipboard payloads are never silently truncated; World Portal reports the
size and directs the user to the downloadable ZIP instead.

EVE-READY PACKAGING
Every Eve context ZIP and Complete Lab Intelligence ZIP now contains a root
`eve-briefing.json`. It describes what is canonical, what evidence exists,
which candidates were generated, which candidate is selected, what was actually
exported, the current pending decision, safe next actions, file relationships,
and package validation. The plain-language brief is generated only from stored
facts and does not invent lore or unknown climate meanings.

The complete intelligence ZIP includes overview JSON, per-layer JSON and text
reports, sessions, passes, candidates, comparison matrices, export audits,
compact previews, an asset index, package validation, and optionally recommended
full-resolution evidence. Raster analysis is reused when its checksum and
analysis version are unchanged.
