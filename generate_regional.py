#!/usr/bin/env python3
"""Generate regional.json using nearest-centroid assignment to Scottish council areas."""

import json, math, datetime

SITES_FILE = "dashboard-data/sites.json"
OUT_FILE = "dashboard-data/regional.json"

# Approximate centroids for Scotland's 32 council areas (lat, lon)
COUNCIL_CENTROIDS = {
    "Aberdeen City":          (57.149, -2.097),
    "Aberdeenshire":          (57.284, -2.653),
    "Angus":                  (56.726, -2.933),
    "Argyll and Bute":        (56.246, -5.433),
    "Clackmannanshire":       (56.115, -3.752),
    "Dumfries and Galloway":  (55.070, -3.618),
    "Dundee City":            (56.462, -2.970),
    "East Ayrshire":          (55.457, -4.270),
    "East Dunbartonshire":    (55.974, -4.203),
    "East Lothian":           (55.951, -2.770),
    "East Renfrewshire":      (55.771, -4.336),
    "City of Edinburgh":      (55.953, -3.188),
    "Na h-Eileanan Siar":     (57.772, -7.019),
    "Falkirk":                (56.002, -3.784),
    "Fife":                   (56.217, -3.158),
    "Glasgow City":           (55.864, -4.252),
    "Highland":               (57.480, -4.224),
    "Inverclyde":             (55.927, -4.680),
    "Midlothian":             (55.827, -3.097),
    "Moray":                  (57.554, -3.424),
    "North Ayrshire":         (55.693, -4.733),
    "North Lanarkshire":      (55.867, -3.961),
    "Orkney Islands":         (58.986, -3.113),
    "Perth and Kinross":      (56.543, -3.621),
    "Renfrewshire":           (55.836, -4.534),
    "Scottish Borders":       (55.548, -2.783),
    "Shetland Islands":       (60.530, -1.270),
    "South Ayrshire":         (55.459, -4.629),
    "South Lanarkshire":      (55.598, -3.771),
    "Stirling":               (56.273, -4.026),
    "West Dunbartonshire":    (55.957, -4.573),
    "West Lothian":           (55.893, -3.527),
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def nearest_council(lat, lon):
    return min(COUNCIL_CENTROIDS, key=lambda c: haversine(lat, lon, *COUNCIL_CENTROIDS[c]))

with open(SITES_FILE) as f:
    sites = json.load(f)

print(f"Assigning {len(sites)} sites to council areas...")

by_la = {}
for site in sites:
    lat, lon = site.get("centroid_lat"), site.get("centroid_lon")
    if lat is None or lon is None:
        la = "Unknown"
    else:
        la = nearest_council(lat, lon)

    if la not in by_la:
        by_la[la] = {
            "local_authority": la,
            "total_sites": 0,
            "total_area_ha": 0.0,
            "by_type": {},
            "largest_sites": [],
        }
    entry = by_la[la]
    entry["total_sites"] += 1
    entry["total_area_ha"] = round(entry["total_area_ha"] + (site.get("area_ha") or 0), 2)
    t = site.get("type", "Unknown")
    entry["by_type"][t] = entry["by_type"].get(t, 0) + 1
    entry["largest_sites"].append({
        "name": site["name"],
        "type": t,
        "area_ha": site.get("area_ha"),
    })

# Keep top 10 largest sites per LA
for r in by_la.values():
    r["largest_sites"] = sorted(r["largest_sites"], key=lambda s: s.get("area_ha") or 0, reverse=True)[:10]

regions = sorted(by_la.values(), key=lambda x: x["total_sites"], reverse=True)

out = {
    "generated": datetime.datetime.utcnow().isoformat(),
    "method": "nearest-centroid assignment to 32 Scottish council areas",
    "total_regions": len(regions),
    "regions": regions,
}
with open(OUT_FILE, "w") as f:
    json.dump(out, f, indent=2)

print(f"Done! {len(regions)} council areas → {OUT_FILE}")
for r in regions[:10]:
    print(f"  {r['local_authority']:30s} {r['total_sites']:4d} sites  {r['total_area_ha']:>12,.0f} ha")
