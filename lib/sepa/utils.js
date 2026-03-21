/**
 * SEPA Integration – Shared Utilities
 *
 * Provides helpers used across all SEPA data modules:
 *   - Bounding-box construction for spatial queries
 *   - ArcGIS REST query builder with timeout + caching
 *   - Nearest-feature finder
 *   - Status-to-colour mapper for UI badges
 *
 * Attaches to window.SEPA.utils
 */
(function () {
    "use strict";

    // ── Simple in-memory cache ──────────────────────────────────────────
    var _cache = {};

    function cacheGet(key) {
        var entry = _cache[key];
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            delete _cache[key];
            return null;
        }
        return entry.value;
    }

    function cacheSet(key, value, ttlMs) {
        _cache[key] = { value: value, expires: Date.now() + ttlMs };
    }

    // ── Bounding box ────────────────────────────────────────────────────
    /**
     * Build a WGS84 bounding box around a point.
     * @param {number} lat  – latitude  (WGS84)
     * @param {number} lon  – longitude (WGS84)
     * @param {number} radiusKm – half-side length in km
     * @returns {{xmin:number, ymin:number, xmax:number, ymax:number}}
     */
    function buildBoundingBox(lat, lon, radiusKm) {
        var latDelta = radiusKm / 111.32;
        var lonDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
        return {
            xmin: lon - lonDelta,
            ymin: lat - latDelta,
            xmax: lon + lonDelta,
            ymax: lat + latDelta
        };
    }

    // ── ArcGIS REST query builder ───────────────────────────────────────
    var SEPA_TIMEOUT = 5000; // 5 seconds

    /**
     * Perform an ArcGIS REST "query" call and return the parsed features.
     *
     * @param {string}   serviceUrl – base MapServer URL (no trailing /)
     * @param {number}   layerId    – layer index
     * @param {object}   geometry   – {xmin,ymin,xmax,ymax} envelope (WGS84)
     * @param {string}   outFields  – comma-separated field names (or "*")
     * @param {object}   [opts]     – optional overrides
     * @param {number}   [opts.cacheTtl] – cache TTL in ms (0 = no cache)
     * @param {string}   [opts.geometryType] – default "esriGeometryEnvelope"
     * @param {string}   [opts.spatialRel]   – default "esriSpatialRelIntersects"
     * @returns {Promise<Array>} – array of feature objects
     */
    function buildArcGISQuery(serviceUrl, layerId, geometry, outFields, opts) {
        opts = opts || {};
        var geomType = opts.geometryType || "esriGeometryEnvelope";
        var spatialRel = opts.spatialRel || "esriSpatialRelIntersects";
        var cacheTtl = opts.cacheTtl != null ? opts.cacheTtl : 0;

        var geomStr = JSON.stringify(geometry);
        var url = serviceUrl + "/" + layerId + "/query"
            + "?geometry=" + encodeURIComponent(geomStr)
            + "&geometryType=" + geomType
            + "&spatialRel=" + spatialRel
            + "&outFields=" + encodeURIComponent(outFields)
            + "&returnGeometry=true"
            + "&inSR=4326"
            + "&outSR=4326"
            + "&f=json";

        // Check cache
        if (cacheTtl > 0) {
            var cached = cacheGet(url);
            if (cached) return Promise.resolve(cached);
        }

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, SEPA_TIMEOUT);

        return fetch(url, { signal: controller.signal })
            .then(function (r) {
                clearTimeout(timer);
                if (!r.ok) throw new Error("SEPA HTTP " + r.status);
                return r.json();
            })
            .then(function (json) {
                if (json.error) throw new Error(json.error.message || "ArcGIS error");
                var features = json.features || [];
                if (cacheTtl > 0) cacheSet(url, features, cacheTtl);
                return features;
            })
            .catch(function (err) {
                clearTimeout(timer);
                throw err;
            });
    }

    // ── Nearest feature ─────────────────────────────────────────────────
    /**
     * From an ArcGIS feature set, find the closest one to (lat, lon).
     * Uses centroid of the geometry ring or the geometry point.
     */
    function nearestFeature(features, lat, lon) {
        if (!features || features.length === 0) return null;
        var best = null;
        var bestDist = Infinity;
        features.forEach(function (f) {
            var c = featureCentroid(f);
            if (!c) return;
            var d = haversineDist(lat, lon, c.lat, c.lon);
            if (d < bestDist) { bestDist = d; best = f; }
        });
        if (best) best._distKm = bestDist;
        return best;
    }

    function featureCentroid(f) {
        var g = f.geometry;
        if (!g) return null;
        // Point geometry
        if (g.x != null && g.y != null) return { lat: g.y, lon: g.x };
        // Polygon – average of first ring
        if (g.rings && g.rings.length > 0) {
            var ring = g.rings[0];
            var sx = 0, sy = 0;
            ring.forEach(function (p) { sx += p[0]; sy += p[1]; });
            return { lat: sy / ring.length, lon: sx / ring.length };
        }
        // Polyline – midpoint of first path
        if (g.paths && g.paths.length > 0) {
            var path = g.paths[0];
            var mid = path[Math.floor(path.length / 2)];
            return { lat: mid[1], lon: mid[0] };
        }
        return null;
    }

    function haversineDist(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // ── Status → colour mapping ─────────────────────────────────────────
    var STATUS_COLOURS = {
        // Flood risk
        "high":       { bg: "#FEE2E2", text: "#991B1B", label: "High" },
        "medium":     { bg: "#FEF3C7", text: "#92400E", label: "Medium" },
        "low":        { bg: "#D1FAE5", text: "#065F46", label: "Low" },
        "little or no risk": { bg: "#F0FFF4", text: "#065F46", label: "Little / No Risk" },
        // WFD status (future use)
        "high (wfd)": { bg: "#DBEAFE", text: "#1E40AF", label: "High" },
        "good":       { bg: "#D1FAE5", text: "#065F46", label: "Good" },
        "moderate":   { bg: "#FEF3C7", text: "#92400E", label: "Moderate" },
        "poor":       { bg: "#FEE2E2", text: "#991B1B", label: "Poor" },
        "bad":        { bg: "#FEE2E2", text: "#7F1D1D", label: "Bad" },
        // Bathing water (future use)
        "excellent":  { bg: "#DBEAFE", text: "#1E40AF", label: "Excellent" },
        "sufficient": { bg: "#FEF3C7", text: "#92400E", label: "Sufficient" }
    };

    function sepaStatusColour(status) {
        if (!status) return { bg: "#F3F4F6", text: "#6B7280", label: "Unknown" };
        var key = status.toLowerCase().trim();
        return STATUS_COLOURS[key] || { bg: "#F3F4F6", text: "#6B7280", label: status };
    }

    // ── Export ───────────────────────────────────────────────────────────
    window.SEPA = window.SEPA || {};
    window.SEPA.utils = {
        buildBoundingBox: buildBoundingBox,
        buildArcGISQuery: buildArcGISQuery,
        nearestFeature: nearestFeature,
        sepaStatusColour: sepaStatusColour,
        haversineDist: haversineDist,
        featureCentroid: featureCentroid
    };
})();
