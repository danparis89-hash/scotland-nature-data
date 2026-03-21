/**
 * SEPA Integration – Flood Risk
 *
 * Queries the SEPA Open Flood Maps ArcGIS REST service to determine flood
 * risk zones (river, coastal, surface water) for a given coordinate.
 *
 * Endpoint: https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer
 *
 * Risk level is determined by which LAYER a point intersects — each layer
 * represents a likelihood level (high/medium/low) for a flood type.
 *
 * Cache TTL: 24 hours (flood zones are static designations)
 *
 * Attaches to window.SEPA.flood
 */
(function () {
    "use strict";

    var SERVICE_URL = "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer";
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    // Layers in the Open/Flood_Maps MapServer.
    // Each layer is a flood-type + likelihood combination.
    // The risk level comes from which layer intersects, not from attributes.
    //
    // River flooding:
    //   0 = High Likelihood   (10% annual chance, 10-yr return)
    //   1 = Medium Likelihood (0.5% annual chance, 200-yr return)
    //   2 = Low Likelihood    (0.1% annual chance, 1000-yr return)
    // Surface water & small watercourses:
    //   3 = High Likelihood
    //   4 = Medium Likelihood
    //   5 = Low Likelihood
    // Coastal flooding:
    //   6 = High Likelihood
    //   7 = Medium Likelihood
    //   8 = Low Likelihood
    //
    // We query the high-likelihood layer for each type first. If a point
    // is in a high-likelihood zone it's also in medium/low, so we only
    // need the most severe match per type.
    var FLOOD_TYPES = [
        {
            type: "river",
            label: "River Flooding",
            layers: [
                { id: 0, risk: "high" },
                { id: 1, risk: "medium" },
                { id: 2, risk: "low" }
            ]
        },
        {
            type: "surface_water",
            label: "Surface Water",
            layers: [
                { id: 3, risk: "high" },
                { id: 4, risk: "medium" },
                { id: 5, risk: "low" }
            ]
        },
        {
            type: "coastal",
            label: "Coastal Flooding",
            layers: [
                { id: 6, risk: "high" },
                { id: 7, risk: "medium" },
                { id: 8, risk: "low" }
            ]
        }
    ];

    /**
     * Query flood risk for a location.
     *
     * For each flood type we query the high-likelihood layer first.
     * If the point intersects, we know the risk is at least "high".
     * Otherwise we check medium, then low. This minimises API calls.
     *
     * @param {number} lat – WGS84 latitude
     * @param {number} lon – WGS84 longitude
     * @returns {Promise<object>}
     */
    function queryFloodRisk(lat, lon) {
        var utils = window.SEPA && window.SEPA.utils;
        if (!utils) return Promise.reject(new Error("SEPA utils not loaded"));

        // Small bounding box (~200m) around the point for intersection
        var bbox = utils.buildBoundingBox(lat, lon, 0.2);

        // Query each flood type independently and in parallel
        var promises = FLOOD_TYPES.map(function (ft) {
            return queryFloodType(utils, bbox, ft);
        });

        return Promise.all(promises).then(function (results) {
            var zones = [];
            var anyError = false;

            results.forEach(function (r) {
                if (r.error) anyError = true;
                if (r.risk) {
                    zones.push({
                        type: r.type,
                        label: r.label,
                        risk: r.risk
                    });
                }
            });

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
     * For a single flood type, query layers from most severe to least.
     * Stop at the first match (highest risk wins).
     */
    function queryFloodType(utils, bbox, ft) {
        // Query all three likelihood layers in parallel for speed,
        // then take the highest risk that returned features.
        var layerPromises = ft.layers.map(function (layer) {
            return utils.buildArcGISQuery(
                SERVICE_URL,
                layer.id,
                bbox,
                "OBJECTID",    // minimal fields — we only need to know if features exist
                { cacheTtl: CACHE_TTL }
            ).then(function (features) {
                return { risk: layer.risk, hit: features.length > 0 };
            }).catch(function () {
                return { risk: layer.risk, hit: false, error: true };
            });
        });

        return Promise.all(layerPromises).then(function (layerResults) {
            var anyLayerError = layerResults.some(function (r) { return r.error; });
            // Priority order: high > medium > low
            var riskPriority = ["high", "medium", "low"];
            var bestRisk = null;
            for (var i = 0; i < riskPriority.length; i++) {
                var match = layerResults.find(function (r) {
                    return r.risk === riskPriority[i] && r.hit;
                });
                if (match) { bestRisk = match.risk; break; }
            }
            return {
                type: ft.type,
                label: ft.label,
                risk: bestRisk,
                error: anyLayerError && !bestRisk
            };
        });
    }

    function deriveOverallRisk(zones) {
        if (zones.length === 0) return null;
        var priority = { "high": 3, "medium": 2, "low": 1 };
        var max = -1;
        var result = null;
        zones.forEach(function (z) {
            var p = priority[z.risk] != null ? priority[z.risk] : 0;
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
