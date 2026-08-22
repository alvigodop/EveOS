COUNTRY GEOGRAPHY DATA

Coverage
- 233 country and territory entries owned by World Portal under Earth.
- Each country file is loaded only when that country is selected.

Contents
- Generalized country outline polygons.
- Mapped river segments and lake polygons.
- Geodesic size, span, perimeter, coastline, river, lake, and land-piece estimates.

Method and limitations
- Boundaries are Natural Earth-derived generalized geometries bundled through
  CountryInfo, with marker-based fallback geometry for rare missing entries.
- Hydrology uses Basemap's bundled intermediate/low-resolution river geometry
  and GSHHS lake polygons.
- Measurements are WGS84 geodesic estimates produced with pyproj.
- River and lake counts are counts of mapped features, not complete real-world
  censuses. Coastline lengths vary strongly with map resolution and method.
- No population, demographic, or other people-related metrics are included.
