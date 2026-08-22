# Glossary

**Canonical layer** — currently accepted hard-truth layer for a domain such as visual, mask, or heightmap.

**Evidence layer** — imported or derived layer used to inform refinement without automatically becoming canonical.

**Evidence trust** — independent role-specific trust values for coastline, elevation, visual, and climate uses.

**Anomalous but useful** — evidence with a known defect that remains useful for a restricted purpose.

**Candidate** — persistent mask/heightmap pair generated for review, such as Clean, Hybrid, or Feature-Preserving.

**Mission** — persistent refinement workflow state for a world or scoped region.

**Mission pass** — one iteration of baseline → Orogen → evidence → candidate → accepted output.

**Semantic selector** — stable query for a layer role such as current canonical mask or highest elevation-trust heightmap.

**Result reference** — reference from one plan command to an output of an earlier command.

**Orogen finalizer** — deterministic World Portal boundary that produces strict support-matched PNG input files for Orogen.

**Export audit** — record of requested source, resolved source, final output, validation, and checksums for an export attempt.

**Creative/refinement intent** — world- or mission-specific preference such as high coastline character or low remote-noise tolerance. Intent is data supplied by the world, not a global skill rule.
