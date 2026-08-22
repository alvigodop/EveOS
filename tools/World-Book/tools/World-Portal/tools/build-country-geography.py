#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any, Iterable

from mpl_toolkits.basemap import Basemap
from pyproj import Geod
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

PROJECT = Path(__file__).resolve().parents[1]
COUNTRY_DIR = PROJECT / "assets/js/geo/countries"
OUTPUT_DIR = PROJECT / "assets/data/country-geography"
COUNTRYINFO_DIR = Path("/opt/pyvenv/lib/python3.13/site-packages/countryinfo/data")
GEOD = Geod(ellps="WGS84")


def read_app_countries() -> list[dict[str, Any]]:
    countries: list[dict[str, Any]] = []
    for path in sorted(COUNTRY_DIR.glob("*.js")):
        if path.name == "index.js":
            continue
        text = path.read_text(encoding="utf-8")
        payload = text[text.index("[") : text.rindex("]") + 1]
        payload = re.sub(r",\s*\]", "]", payload)
        countries.extend(json.loads(payload))
    return sorted(countries, key=lambda item: item["name"])


def countryinfo_by_code() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in COUNTRYINFO_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            code = (data.get("ISO") or {}).get("alpha2")
            if code:
                result[code] = data
        except (OSError, json.JSONDecodeError):
            continue
    return result


def special_countryinfo(code: str) -> dict[str, Any] | None:
    if code == "PS":
        features = []
        area = 0.0
        for filename in ("west_bank.json", "gaza_strip.json"):
            path = COUNTRYINFO_DIR / filename
            if not path.exists():
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            features.extend((data.get("geoJSON") or {}).get("features", []))
            area += float(data.get("area") or 0)
        return {"area": area or 6020, "geoJSON": {"type": "FeatureCollection", "features": features}}
    if code == "VA":
        path = COUNTRYINFO_DIR / "holy_see_vatican_city.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


def geometry_from_info(data: dict[str, Any] | None) -> BaseGeometry | None:
    if not data:
        return None
    features = (data.get("geoJSON") or {}).get("features", [])
    geometries = []
    for feature in features:
        geometry = feature.get("geometry")
        if geometry:
            candidate = make_valid(shape(geometry))
            if not candidate.is_empty:
                geometries.append(candidate)
    if not geometries:
        return None
    merged = make_valid(unary_union(geometries))
    if merged.geom_type == "GeometryCollection":
        polygons = [part for part in merged.geoms if part.geom_type in {"Polygon", "MultiPolygon"}]
        return unary_union(polygons) if polygons else None
    return merged


def fallback_geometry(country: dict[str, Any], area_km2: float | None) -> BaseGeometry:
    area = max(float(area_km2 or 500), 0.2)
    radius_km = math.sqrt(area / math.pi)
    latitude = float(country["latitude"])
    longitude = float(country["longitude"])
    lat_radius = max(radius_km / 111.0, 0.015)
    lon_scale = max(math.cos(math.radians(latitude)), 0.15)
    lon_radius = lat_radius / lon_scale
    return affinity.scale(Point(longitude, latitude).buffer(1.0, resolution=48), xfact=lon_radius, yfact=lat_radius, origin=(longitude, latitude))


def load_river_segments() -> list[LineString]:
    basemap = Basemap(
        projection="cyl", llcrnrlon=-180, urcrnrlon=180,
        llcrnrlat=-90, urcrnrlat=90, resolution="l",
    )
    segments, _ = basemap._readboundarydata("rivers", as_polygons=False)
    return [
        LineString([(float(x), float(y)) for x, y in segment])
        for segment in segments if len(segment) > 1
    ]


def load_water_and_coast() -> tuple[list[Polygon], list[LineString]]:
    basemap = Basemap(
        projection="cyl", llcrnrlon=-180, urcrnrlon=180,
        llcrnrlat=-90, urcrnrlat=90, resolution="l", area_thresh=0,
    )
    segments, types = basemap._readboundarydata("gshhs", as_polygons=True)
    lakes: list[Polygon] = []
    coastlines: list[LineString] = []
    for segment, kind in zip(segments, types):
        if len(segment) < 4:
            continue
        points = [(float(x), float(y)) for x, y in segment]
        if kind == 1:
            coastlines.append(LineString(points))
        elif kind == 2:
            polygon = make_valid(Polygon(points))
            if polygon.geom_type == "Polygon" and not polygon.is_empty:
                lakes.append(polygon)
            elif polygon.geom_type == "MultiPolygon":
                lakes.extend([part for part in polygon.geoms if not part.is_empty])
    return lakes, coastlines


def geodesic_area_km2(geometry: BaseGeometry) -> float:
    area, _ = GEOD.geometry_area_perimeter(geometry)
    return abs(area) / 1_000_000.0


def geodesic_length_km(geometry: BaseGeometry) -> float:
    if geometry.is_empty:
        return 0.0
    return abs(GEOD.geometry_length(geometry)) / 1000.0


def polygon_parts(geometry: BaseGeometry) -> list[Polygon]:
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return list(geometry.geoms)
    return [part for part in getattr(geometry, "geoms", []) if part.geom_type == "Polygon"]


def compact_longitude(value: float, center: float) -> float:
    while value - center > 180:
        value -= 360
    while value - center < -180:
        value += 360
    return value


def coordinate_sequence(coords: Iterable[tuple[float, float]], center: float) -> list[list[float]]:
    return [[round(compact_longitude(float(x), center), 5), round(float(y), 5)] for x, y in coords]


def polygon_coordinates(polygon: Polygon, center: float) -> list[list[list[float]]]:
    rings = [coordinate_sequence(polygon.exterior.coords, center)]
    rings.extend(coordinate_sequence(interior.coords, center) for interior in polygon.interiors)
    return rings


def serialize_polygons(geometry: BaseGeometry, center: float, tolerance: float) -> list[list[list[list[float]]]]:
    simplified = make_valid(geometry.simplify(tolerance, preserve_topology=True))
    return [polygon_coordinates(part, center) for part in polygon_parts(simplified)]


def serialize_lines(geometry: BaseGeometry, center: float, tolerance: float) -> list[list[list[float]]]:
    simplified = geometry.simplify(tolerance, preserve_topology=False)
    if simplified.geom_type == "LineString":
        return [coordinate_sequence(simplified.coords, center)]
    if simplified.geom_type == "MultiLineString":
        return [coordinate_sequence(line.coords, center) for line in simplified.geoms if len(line.coords) > 1]
    return []


def extent_spans(bounds: tuple[float, float, float, float], center_lon: float, center_lat: float) -> tuple[float, float]:
    min_x, min_y, max_x, max_y = bounds
    _, _, width = GEOD.inv(min_x, center_lat, max_x, center_lat)
    _, _, height = GEOD.inv(center_lon, min_y, center_lon, max_y)
    return abs(width) / 1000.0, abs(height) / 1000.0


def build_dataset() -> None:
    countries = read_app_countries()
    info_by_code = countryinfo_by_code()

    geometries: dict[str, BaseGeometry] = {}
    source_areas: dict[str, float] = {}
    for country in countries:
        code = country["code"]
        data = info_by_code.get(code) or special_countryinfo(code)
        geometry = geometry_from_info(data)
        source_area = float((data or {}).get("area") or 0)
        if geometry is None:
            geometry = fallback_geometry(country, source_area)
        geometries[code] = make_valid(geometry)
        source_areas[code] = source_area

    rivers = load_river_segments()
    lakes, coastlines = load_water_and_coast()
    river_tree = STRtree(rivers)
    lake_tree = STRtree(lakes)
    coastline_tree = STRtree(coastlines)

    raw_records: list[dict[str, Any]] = []
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for country in countries:
        code = country["code"]
        geometry = geometries[code]
        center_lon = float(country["longitude"])
        center_lat = float(country["latitude"])
        min_x, min_y, max_x, max_y = geometry.bounds
        tolerance = max(max_x - min_x, max_y - min_y) / 1200.0
        tolerance = min(max(tolerance, 0.002), 0.055)

        mapped_area_km2 = geodesic_area_km2(geometry)
        area_km2 = source_areas[code] or mapped_area_km2
        if area_km2 < 0.05:
            area_km2 = mapped_area_km2
        _, perimeter_m = GEOD.geometry_area_perimeter(geometry)
        perimeter_km = abs(perimeter_m) / 1000.0
        coastline_parts = []
        coastline_search = geometry.buffer(max(tolerance * 2.0, 0.015))
        for index in coastline_tree.query(coastline_search):
            clipped = coastlines[int(index)].intersection(coastline_search)
            if not clipped.is_empty:
                coastline_parts.append(clipped)
        coastline_km = sum(geodesic_length_km(part) for part in coastline_parts)
        width_km, height_km = extent_spans(geometry.bounds, center_lon, center_lat)

        clipped_rivers: list[tuple[float, BaseGeometry]] = []
        for index in river_tree.query(geometry):
            clipped = rivers[int(index)].intersection(geometry)
            if not clipped.is_empty and clipped.length > 0.003:
                clipped_rivers.append((clipped.length, clipped))
        clipped_rivers.sort(key=lambda item: item[0], reverse=True)

        clipped_lakes: list[tuple[float, BaseGeometry]] = []
        for index in lake_tree.query(geometry):
            clipped = lakes[int(index)].intersection(geometry)
            if not clipped.is_empty and clipped.area > 0.000001:
                clipped_lakes.append((clipped.area, clipped))
        clipped_lakes.sort(key=lambda item: item[0], reverse=True)

        parts = polygon_parts(geometry)
        part_areas = sorted((geodesic_area_km2(part) for part in parts), reverse=True)
        largest_share = (part_areas[0] / area_km2 * 100.0) if part_areas and area_km2 else 100.0
        river_length_km = sum(geodesic_length_km(geom) for _, geom in clipped_rivers[:240])
        lake_area_km2 = sum(geodesic_area_km2(geom) for _, geom in clipped_lakes[:100])

        map_payload = {
            "code": code,
            "name": country["name"],
            "center": [round(center_lon, 5), round(center_lat, 5)],
            "bounds": [round(min_x, 5), round(min_y, 5), round(max_x, 5), round(max_y, 5)],
            "polygons": serialize_polygons(geometry, center_lon, tolerance),
            "rivers": [line for _, geom in clipped_rivers[:240] for line in serialize_lines(geom, center_lon, tolerance * 0.75)],
            "lakes": [poly for _, geom in clipped_lakes[:100] for poly in serialize_polygons(geom, center_lon, tolerance)],
            "stats": {
                "landAreaKm2": round(area_km2),
                "mappedGeometryAreaKm2": round(mapped_area_km2),
                "areaRank": 0,
                "worldLandSharePercent": 0.0,
                "boundaryPerimeterKm": round(perimeter_km),
                "coastlineEstimateKm": round(coastline_km),
                "eastWestSpanKm": round(width_km),
                "northSouthSpanKm": round(height_km),
                "mappedLandPieces": len(parts),
                "largestLandPiecePercent": round(largest_share, 1),
                "mappedRiverSegments": len(clipped_rivers),
                "mappedRiverLengthKm": round(river_length_km),
                "mappedLakePolygons": len(clipped_lakes),
                "mappedLakeAreaKm2": round(lake_area_km2),
            },
            "source": {
                "boundary": "Natural Earth-derived CountryInfo geometry",
                "hydrology": "Basemap intermediate-resolution rivers and GSHHS lake polygons",
                "measurement": "WGS84 geodesic estimates",
            },
        }
        raw_records.append(map_payload)

    total_land = sum(item["stats"]["landAreaKm2"] for item in raw_records)
    ranked = sorted(raw_records, key=lambda item: item["stats"]["landAreaKm2"], reverse=True)
    rank_by_code = {item["code"]: index + 1 for index, item in enumerate(ranked)}
    index_payload = {}
    for item in raw_records:
        stats = item["stats"]
        stats["areaRank"] = rank_by_code[item["code"]]
        stats["worldLandSharePercent"] = round(stats["landAreaKm2"] / total_land * 100.0, 3) if total_land else 0.0
        path = OUTPUT_DIR / f"{item['code']}.json"
        path.write_text(json.dumps(item, separators=(",", ":")), encoding="utf-8")
        index_payload[item["code"]] = {"name": item["name"], "stats": stats}

    (OUTPUT_DIR / "index.json").write_text(json.dumps(index_payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(raw_records)} country geography files to {OUTPUT_DIR}")


if __name__ == "__main__":
    build_dataset()
