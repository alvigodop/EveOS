# Evidence Rules

World Portal evidence is role-specific. Do not reduce an entire Orogen run to one quality label.

## Trust dimensions

Evaluate independently:

- coastline trust — whether the layer can inform accepted land/water boundaries;
- elevation trust — whether the layer can inform relief inside accepted land;
- visual trust — whether satellite/terrain appearance can improve land rendering;
- climate trust — whether climate/classification structure is useful as unlabeled evidence.

## Anomalous but useful evidence

An anomalous layer can be invalid for one purpose and highly useful for another.

Example: a global-land Orogen result may have zero coastline authority because ocean pixels were
interpreted as land, while still containing useful interior elevation or visual structure. Clip
such elevation to a trusted mask before assimilation.

## Likely noise

- isolated distant ocean specks;
- unsupported tiny fragments;
- global-land contamination;
- severe peak clipping;
- elevation outside accepted land;
- duplicate or stale outputs that add no distinct evidence.

## Potential geographic character

- nearby companion islands supported by evidence;
- distinctive coastline bends;
- unusual but supported protrusions;
- narrow peninsulas;
- concave/convex coastline structure;
- ridge networks;
- valleys;
- meaningful terrain irregularity.

Cleanest does not necessarily mean best.

## Output objectives

### Clean

Prioritize mechanical safety, simple support, conservative coastline, and minimal evidence-driven
expansion.

### Hybrid

Remove obvious errors while preserving supported coastline character, nearby islands, and useful
terrain detail.

### Feature-Preserving

Retain more supported irregularity, coastline complexity, companion islands, ridges, and valleys
while still enforcing Orogen safety constraints.

## Climate and biome evidence

Do not assign biome or climate names from colors unless a known legend is supplied. Palette and
zone statistics may be retained as physical/evidence metadata without semantic labels.
