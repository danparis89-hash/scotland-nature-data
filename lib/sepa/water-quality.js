/**
 * SEPA Integration – Water Quality (WFD Classification)
 *
 * Queries the SEPA Open Hydrography ArcGIS REST service to find nearby
 * river and loch water bodies and their WFD classification status.
 *
 * Endpoint: https://map.sepa.org.uk/server/rest/services/Open/Hydrography/MapServer
 *   Layer 3: Loch  (polygon)
 *   Layer 4: River (polyline)
 *
 * Key fields: WATER_BODY_NAME, OVERALL_CLASSIFICATION, CLASSIFICATION_YEAR
 *
 * Cache TTL: 24 hours (classifications update annually)
 *
 * Attaches to window.SEPA.waterQuality
 */
(function () {
    "use strict";

    var SERVICE_URL = "https://map.sepa.org.uk/server/rest/services/Open/Hydrography/MapServer";
    var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    var LAYERS = [
        { id: 3, type: "loch", label: "Loch" },
        { id: 4, type: "river", label: "River" }
    ];

    var OUT_FIELDS = "WATER_BODY_NAME,OVERALL_CLASSIFICATION,CLASSIFICATION_YEAR,WATER_BODY_ID";

    // Maximum number of water bodies to return per type
    var MAX_RESULTS = 3;

    // Search radius in km
    var SEARCH_RADIUS_KM = 2;

    /**
     * Query nearby water body WFD classification.
     *
     * @param {number} lat – WGS84 latitude
     * @param {number} lon – WGS84 longitude
     * @returns {Promise<object>}
     */
    function queryWaterQuality(lat, lon) {
        var utils = window.SEPA && window.SEPA.utils;
        if (!utils) return Promise.reject(new Error("SEPA utils not loaded"));

        var bbox = utils.buildBoundingBox(lat, lon, SEARCH_RADIUS_KM);

        var promises = LAYERS.map(function (layer) {
            return utils.buildArcGISQuery(
                SERVICE_URL,
                layer.id,
                bbox,
                OUT_FIELDS,
                { cacheTtl: CACHE_TTL }
            ).then(function (features) {
                return { type: layer.type, label: layer.label, features: features };
            }).catch(function () {
                return { type: layer.type, label: layer.label, features: [], error: true };
            });
        });

        return Promise.all(promises).then(function (results) {
            var waterBodies = [];
            var anyError = false;

            results.forEach(function (r) {
                if (r.error) anyError = true;

                // Sort by distance and take closest MAX_RESULTS per type
                var sorted = r.features.slice();
                sorted.forEach(function (f) {
                    var c = utils.featureCentroid(f);
                    f._distKm = c ? utils.haversineDist(lat, lon, c.lat, c.lon) : Infinity;
                });
                sorted.sort(function (a, b) { return a._distKm - b._distKm; });

                var seen = {};
                sorted.forEach(function (f) {
                    var attrs = f.attributes || {};
                    var name = attrs.WATER_BODY_NAME || attrs.water_body_name;
                    var id = attrs.WATER_BODY_ID || attrs.water_body_id;
                    var key = id || name;
                    if (!key || seen[key]) return;
                    if (Object.keys(seen).length >= MAX_RESULTS) return;
                    seen[key] = true;

                    var status = attrs.OVERALL_CLASSIFICATION || attrs.overall_classification || null;
                    var year = attrs.CLASSIFICATION_YEAR || attrs.classification_year || null;

                    waterBodies.push({
                        type: r.type,
                        typeLabel: r.label,
                        name: name || "Unnamed water body",
                        status: status,
                        year: year,
                        distanceKm: Math.round(f._distKm * 10) / 10
                    });
                });
            });

            // Sort all results by distance
            waterBodies.sort(function (a, b) { return a.distanceKm - b.distanceKm; });

            return {
                available: true,
                waterBodies: waterBodies,
                noData: waterBodies.length === 0 && !anyError,
                error: anyError && waterBodies.length === 0 && results.every(function (r) { return r.error; })
            };
        });
    }

    // ── Export ───────────────────────────────────────────────────────────
    window.SEPA = window.SEPA || {};
    window.SEPA.waterQuality = {
        queryWaterQuality: queryWaterQuality
    };
})();
