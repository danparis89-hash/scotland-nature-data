/**
 * SEPA Integration – Flood Risk
 *
 * Queries the SEPA Flood Map ArcGIS REST service to determine flood risk
 * zones (river, coastal, surface water) for a given coordinate.
 *
 * Endpoint: SEPA SEFS Flooding MapServer
 * Cache TTL: 24 hours (flood zones are static designations)
 *
 * Attaches to window.SEPA.flood
 */
(function () {
    "use strict";

    var SERVICE_URL = "https://map.sepa.org.uk/arcgishosted/rest/services/SEFS/SEFS_FLOODING/MapServer";
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    // Layer IDs in the SEFS Flooding MapServer.
    // These are typical SEPA layer indices – we query multiple layers
    // to cover river, coastal, and surface-water flood risk.
    // Layer 0: Flood extent (river & coastal)
    // Layer 1: Surface water
    // We try both and merge results.
    var LAYERS = [
        { id: 0, type: "river_coastal", label: "River & Coastal" },
        { id: 1, type: "surface_water", label: "Surface Water" }
    ];

    /**
     * Query flood risk for a location.
     *
     * @param {number} lat – WGS84 latitude
     * @param {number} lon – WGS84 longitude
     * @returns {Promise<object>} – { available: true, zones: [...], overallRisk: "high"|"medium"|"low"|null }
     */
    function queryFloodRisk(lat, lon) {
        var utils = window.SEPA && window.SEPA.utils;
        if (!utils) return Promise.reject(new Error("SEPA utils not loaded"));

        // Small bounding box (~200m) around the point for intersection
        var bbox = utils.buildBoundingBox(lat, lon, 0.2);

        var promises = LAYERS.map(function (layer) {
            return utils.buildArcGISQuery(
                SERVICE_URL,
                layer.id,
                bbox,
                "*",
                { cacheTtl: CACHE_TTL }
            ).then(function (features) {
                return { type: layer.type, label: layer.label, features: features };
            }).catch(function () {
                // Individual layer failure shouldn't block everything
                return { type: layer.type, label: layer.label, features: [], error: true };
            });
        });

        return Promise.all(promises).then(function (results) {
            var zones = [];
            var anyError = false;

            results.forEach(function (r) {
                if (r.error) anyError = true;
                if (r.features.length > 0) {
                    // Extract risk level from feature attributes
                    r.features.forEach(function (f) {
                        var attrs = f.attributes || {};
                        var risk = extractRiskLevel(attrs);
                        zones.push({
                            type: r.type,
                            label: r.label,
                            risk: risk,
                            attributes: attrs
                        });
                    });
                }
            });

            // Determine overall risk (highest of all zones)
            var overallRisk = deriveOverallRisk(zones);

            return {
                available: true,
                zones: zones,
                overallRisk: overallRisk,
                noData: zones.length === 0 && !anyError,
                partialError: anyError && zones.length > 0,
                fullError: anyError && zones.length === 0 && results.every(function (r) { return r.error; })
            };
        });
    }

    /**
     * Extract a normalised risk level from ArcGIS feature attributes.
     * SEPA uses various field names across layers; we check common ones.
     */
    function extractRiskLevel(attrs) {
        // Common SEPA attribute field names for flood likelihood
        var fields = [
            "FLOOD_RISK", "Flood_Risk", "flood_risk",
            "LIKELIHOOD", "Likelihood", "likelihood",
            "RISK", "Risk", "risk",
            "CATEGORY", "Category", "category",
            "CLASS", "Class",
            "Descriptor", "DESCRIPTOR"
        ];
        for (var i = 0; i < fields.length; i++) {
            if (attrs[fields[i]] != null) {
                return normaliseRisk(String(attrs[fields[i]]));
            }
        }
        // If we found a feature but can't determine level, it's in a flood zone
        return "medium";
    }

    function normaliseRisk(raw) {
        var lower = raw.toLowerCase().trim();
        if (lower.indexOf("high") >= 0) return "high";
        if (lower.indexOf("medium") >= 0 || lower.indexOf("moderate") >= 0) return "medium";
        if (lower.indexOf("low") >= 0) return "low";
        if (lower.indexOf("little") >= 0 || lower.indexOf("no ") >= 0 || lower.indexOf("none") >= 0) return "little or no risk";
        return "medium"; // default if in a flood zone feature
    }

    function deriveOverallRisk(zones) {
        if (zones.length === 0) return null;
        var priority = { "high": 3, "medium": 2, "low": 1, "little or no risk": 0 };
        var max = -1;
        var result = null;
        zones.forEach(function (z) {
            var p = priority[z.risk] != null ? priority[z.risk] : 1;
            if (p > max) { max = p; result = z.risk; }
        });
        return result;
    }

    // ── Export ───────────────────────────────────────────────────────────
    window.SEPA = window.SEPA || {};
    window.SEPA.flood = {
        queryFloodRisk: queryFloodRisk
    };
})();
