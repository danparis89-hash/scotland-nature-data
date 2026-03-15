"""
Scotland Nature Dashboard — Data Processing Script
This script reads the raw geographic data files downloaded from NatureScot
and produces clean JSON files that the dashboard can read.
Prerequisites:
  pip install geopandas pandas
Usage:
  python process_data.py
"""
import geopandas as gpd
import pandas as pd
import json
import datetime
from pathlib import Path

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
RAW_DATA_DIR = Path("raw-data")
OUTPUT_DIR = Path("dashboard-data")

SITE_FILES = {
    "SSSI":   "SSSI_SCOTLAND.geojson",
    "SAC":    "SAC_SCOTLAND.geojson",
    "SPA":    "SPA_SCOTLAND.geojson",
    "NNR":    "NNR_SCOTLAND.geojson",
    "Ramsar": "RAMSAR_SCOTLAND.geojson",
}
LA_BOUNDARIES_FILE = "local_authority_boundaries.geojson"

# ─── SETUP ────────────────────────────────────────────────────────────────────
OUTPUT_DIR.mkdir(exist_ok=True)


def load_geojson(filename):
    filepath = RAW_DATA_DIR / filename
    if not filepath.exists():
        print(f"  WARNING: {filepath} not found, skipping")
        return None
    print(f"  Loading {filepath}...")
    gdf = gpd.read_file(filepath)
    print(f"    → {len(gdf)} features loaded")
    return gdf


def find_col(gdf, candidates):
    for c in candidates:
        if c in gdf.columns:
            return c
    return None


# ─── STEP 1: Load all protected site boundaries ──────────────────────────────
print("\n=== STEP 1: Loading protected site boundaries ===")
all_sites = []
site_counts = {}

for designation_type, filename in SITE_FILES.items():
    gdf = load_geojson(filename)
    if gdf is not None:
        gdf["designation_type"] = designation_type
        all_sites.append(gdf)
        site_counts[designation_type] = len(gdf)
        print(f"    {designation_type}: {len(gdf)} sites")

if not all_sites:
    print("ERROR: No site data loaded. Check your raw-data folder and filenames.")
    exit(1)

# Build a unified GeoDataFrame, keeping the polygon geometry
sites_rows = []
sites_for_join = []

for gdf in all_sites:
    name_col = find_col(gdf, ["PA_NAME", "NAME", "SITE_NAME", "name"])
    area_col = find_col(gdf, ["SITE_HA", "GIS_AREA_HA", "AREA_HA", "Shape__Area"])
    code_col = find_col(gdf, ["PA_CODE", "SITE_CODE", "CODE"])

    for _, row in gdf.iterrows():
        area = round(float(row[area_col]), 2) if area_col and pd.notna(row[area_col]) else None
        sites_rows.append({
            "name":         row[name_col] if name_col else "Unknown",
            "code":         row[code_col] if code_col else None,
            "type":         row["designation_type"],
            "area_ha":      area,
            "centroid_lat": round(row.geometry.centroid.y, 6) if row.geometry else None,
            "centroid_lon": round(row.geometry.centroid.x, 6) if row.geometry else None,
        })

    subset = gdf[["geometry", "designation_type"]].copy()
    subset["site_name"] = gdf[name_col] if name_col else "Unknown"
    subset["area_ha"]   = gdf[area_col].round(2) if area_col else None
    sites_for_join.append(subset)

print(f"\n  Total sites loaded: {len(sites_rows)} features (before deduplication)")

# Deduplicate multi-polygon sites: large sites like Firth of Forth SSSI are
# stored as multiple separate features in the GeoJSON (one per management unit).
# Merge them into one entry, summing areas and keeping the first centroid.
seen_keys = {}
deduped_rows = []
for s in sites_rows:
    key = (s["name"], s["type"])
    if key not in seen_keys:
        seen_keys[key] = len(deduped_rows)
        deduped_rows.append(dict(s))
    else:
        idx = seen_keys[key]
        if s["area_ha"] is not None and deduped_rows[idx]["area_ha"] is not None:
            deduped_rows[idx]["area_ha"] = round(deduped_rows[idx]["area_ha"] + s["area_ha"], 2)
        elif s["area_ha"] is not None:
            deduped_rows[idx]["area_ha"] = s["area_ha"]
sites_rows = deduped_rows
print(f"  After deduplication: {len(sites_rows)} unique sites")

# ─── STEP 2: Assign sites to local authorities via polygon intersection ────────
print("\n=== STEP 2: Assigning sites to local authorities ===")
la_gdf = load_geojson(LA_BOUNDARIES_FILE)
la_site_counts = None

if la_gdf is not None:
    la_name_col = find_col(la_gdf, ["local_auth", "NAME", "name", "LA_NAME", "local_authority"])
    if la_name_col is None:
        print(f"  WARNING: Could not find LA name column. Available: {list(la_gdf.columns)}")
        la_name_col = la_gdf.columns[0]
        print(f"  Falling back to: {la_name_col}")

    # Combine all site polygons into one GeoDataFrame — keep geometry intact
    all_polys = pd.concat(sites_for_join, ignore_index=True)
    all_polys = gpd.GeoDataFrame(all_polys, geometry="geometry", crs="EPSG:4326")
    la_gdf = la_gdf.to_crs("EPSG:4326")

    # Intersects: a site that straddles two LAs appears in both — no radius heuristic needed
    joined = gpd.sjoin(
        all_polys,
        la_gdf[[la_name_col, "geometry"]],
        how="left",
        predicate="intersects",
    )

    # Drop duplicates from touching edges (same site / same LA matched twice)
    joined = joined.drop_duplicates(subset=["site_name", "designation_type", la_name_col])

    la_site_counts = (
        joined
        .groupby([la_name_col, "designation_type", "site_name", "area_ha"])
        .size()
        .reset_index(name="_n")
    )

    print(f"  Assigned {len(joined)} site-LA pairs")
    print(f"  Unique local authorities found: {joined[la_name_col].nunique()}")

# ─── STEP 3: Build output JSON files ─────────────────────────────────────────
print("\n=== STEP 3: Building output files ===")

# --- national.json ---
national = {
    "designation_counts": site_counts,
    "total_sites": sum(site_counts.values()),
    "data_sources": {
        "protected_sites": {
            "provider":    "NatureScot",
            "licence":     "Open Government Licence v3.0",
            "url":         "https://gis-downloads.nature.scot/",
            "attribution": "Contains NatureScot information licensed under the Open Government Licence v3.0",
        }
    },
    "last_processed": pd.Timestamp.now().isoformat(),
}
p = OUTPUT_DIR / "national.json"
p.write_text(json.dumps(national, indent=2))
print(f"  Written: {p}")

# --- regional.json ---
if la_site_counts is not None:
    by_la = {}
    for _, row in la_site_counts.iterrows():
        la = row[la_name_col]
        if la not in by_la:
            by_la[la] = {
                "local_authority": la,
                "total_sites":     0,
                "total_area_ha":   0.0,
                "by_type":         {},
                "largest_sites":   [],
            }
        entry = by_la[la]
        entry["total_sites"] += 1
        area = row["area_ha"] if pd.notna(row["area_ha"]) else 0
        entry["total_area_ha"] = round(entry["total_area_ha"] + area, 2)
        t = row["designation_type"]
        entry["by_type"][t] = entry["by_type"].get(t, 0) + 1
        entry["largest_sites"].append({"name": row["site_name"], "type": t, "area_ha": row["area_ha"]})

    for r in by_la.values():
        r["largest_sites"] = sorted(
            r["largest_sites"], key=lambda s: s.get("area_ha") or 0, reverse=True
        )[:10]

    regions = sorted(by_la.values(), key=lambda x: x["total_sites"], reverse=True)
    regional_out = {
        "generated":     datetime.datetime.utcnow().isoformat(),
        "method":        "polygon intersection with local authority boundaries (sites attributed to every LA their boundary overlaps)",
        "total_regions": len(regions),
        "regions":       regions,
    }
    p = OUTPUT_DIR / "regional.json"
    p.write_text(json.dumps(regional_out, indent=2))
    print(f"  Written: {p}")

# --- sites.json ---
p = OUTPUT_DIR / "sites.json"
p.write_text(json.dumps(sites_rows, indent=2))
print(f"  Written: {p}")

# --- column_inspection.json ---
inspection = {}
for designation_type, filename in SITE_FILES.items():
    gdf = load_geojson(filename)
    if gdf is not None:
        inspection[designation_type] = {
            "columns":      list(gdf.columns),
            "row_count":    len(gdf),
            "sample_values": {
                col: str(gdf[col].iloc[0]) if len(gdf) > 0 else None
                for col in gdf.columns if col != "geometry"
            },
        }
p = OUTPUT_DIR / "column_inspection.json"
p.write_text(json.dumps(inspection, indent=2))
print(f"  Written: {p}")

# ─── DONE ─────────────────────────────────────────────────────────────────────
print("\n=== DONE ===")
print(f"Output files are in '{OUTPUT_DIR}/'")
print("\nNext steps:")
print("  1. Check column_inspection.json if column names look wrong")
print("  2. Run: python process_data.py  (re-run any time you refresh the raw data)")
