/**
 * SEPA Integration – Orchestrator
 *
 * Provides a single entry point to fetch all SEPA environmental data
 * for a given postcode coordinate. Currently Phase 2a (flood risk only).
 *
 * Future phases will add: waterQuality, riverLevels, bathingWater.
 *
 * Attaches to window.SEPA.fetchAll
 */
(function () {
    "use strict";

    /**
     * Fetch all available SEPA data for a coordinate.
     *
     * Returns an object with a key per dataset. Each value is either
     * the resolved data or an error placeholder, so the UI can render
     * partial results gracefully.
     *
     * @param {number} lat – WGS84 latitude
     * @param {number} lon – WGS84 longitude
     * @returns {Promise<object>}
     */
    function fetchAll(lat, lon) {
        var flood = window.SEPA.flood;

        // Run all queries in parallel — each handles its own errors
        return Promise.all([
            flood
                ? flood.queryFloodRisk(lat, lon).catch(function (err) {
                    return { available: false, error: err.message };
                })
                : Promise.resolve({ available: false, error: "Module not loaded" })

            // Future phases:
            // waterQuality.queryWaterQuality(lat, lon).catch(…),
            // riverLevels.queryRiverLevels(lat, lon).catch(…),
            // bathingWater.queryBathingWater(lat, lon).catch(…),
        ]).then(function (results) {
            return {
                flood: results[0]
                // waterQuality: results[1],
                // riverLevels: results[2],
                // bathingWater: results[3],
            };
        });
    }

    // ── Export ───────────────────────────────────────────────────────────
    window.SEPA = window.SEPA || {};
    window.SEPA.fetchAll = fetchAll;
})();
