# World Portal World Model

World Portal is world-owned and hierarchical. A world is the root domain record that owns its
surface map, geography hierarchy, derived raster layers, sessions, missions, celestial objects,
view state, and export history.

## World ownership

A world may own:

- visual surface maps;
- continents and regions;
- countries/territories and focused geography records;
- boundaries, rivers, lakes, measurements, and subdivision extension data;
- Heightmap Forge outputs;
- Orogen evidence layers;
- refinement candidates and passes;
- canonical visual, mask, and heightmap references;
- missions, checkpoints, and export audits.

Deleting a custom world removes its owned data as one lifecycle unit.

## Layer categories

### Hard mechanical truth

Usually:

- canonical visual;
- canonical coastline mask;
- canonical heightmap;
- explicitly accepted mission output.

These define the current trusted world state.

### Soft evidence

May include:

- Orogen masks;
- Orogen heightmaps;
- satellite renders;
- climate renders;
- terrain renders;
- classified rasters;
- previous candidates;
- anomalous or rejected historical runs retained for evidence.

Soft evidence may improve hard truth but must not automatically replace it.

## Layer lineage

Derived layers should retain parent IDs, source tool, session, pass, evidence profile, analysis,
settings, and timestamps. Candidate pairs should remain addressable after reload. Final exports
must record both requested and resolved source IDs.

## Mission scope

A refinement mission has an explicit scope. Current worlds may use planet scope, while future
worlds can target a continent, island, region, or custom map scope. Optional scope masks restrict
processing while preserving the remainder of the world.

The skill must never assume that one world equals one continent.
