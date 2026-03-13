import { useState, useCallback, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/*
 * SCOTLAND NATURE DASHBOARD
 * 
 * Data sources:
 * 1. GitHub Pages (danparis89-hash) — processed NatureScot open data (national.json, sites.json)
 * 2. Postcodes.io — postcode geocoding (live API)
 * 3. NBN Atlas — species occurrence records (live API)
 * 
 * All data is sourced from authoritative open data. No data is AI-generated.
 */

const GITHUB_DATA_BASE = "https://danparis89-hash.github.io/scotland-nature-data/dashboard-data";
const SCOTTISH_PREFIXES = ["AB","DD","DG","EH","FK","HS","IV","KA","KW","KY","ML","PA","PH","TD","ZE"];
const GROUP_ICONS = {
  Birds: "🐦", Mammals: "🦊", Plants: "🌿", Insects: "🦋", Fungi: "🍄",
  Amphibians: "🐸", Reptiles: "🦎", Fish: "🐟", "Flowering Plants": "🌸",
  Ferns: "🌾", Mosses: "🪨", Molluscs: "🐌", Crustaceans: "🦀", Spiders: "🕷️",
};
const DESIGNATION_COLORS = {
  SSSI: "#2D6A4F", SAC: "#40916C", SPA: "#52B788", NNR: "#74C69D", Ramsar: "#95D5B2",
};

// ─── DATA FETCHING ───────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function DesignationBadge({ type }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "11px",
      fontWeight: 700, letterSpacing: "0.5px", color: "#fff",
      backgroundColor: DESIGNATION_COLORS[type] || "#6B7280",
      fontFamily: "'JetBrains Mono', monospace",
    }}>{type}</span>
  );
}

function StatusBanner({ status }) {
  if (!status) return <div style={{ padding: "12px 16px", borderRadius: "10px", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: "13px", color: "#6B7280", textAlign: "center" }}>Checking data sources…</div>;
  const problems = [];
  if (!status.github) problems.push("GitHub Pages data");
  if (!status.postcodes) problems.push("Postcodes.io");
  if (!status.nbn) problems.push("NBN Atlas");
  if (problems.length === 0) return null;
  return (
    <div style={{ padding: "16px 20px", borderRadius: "12px", backgroundColor: problems.length === 3 ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${problems.length === 3 ? "#FECACA" : "#FDE68A"}`, fontSize: "13px", lineHeight: 1.6 }}>
      <div style={{ fontWeight: 700, color: problems.length === 3 ? "#991B1B" : "#92400E", marginBottom: "6px" }}>
        {problems.length === 3 ? "Data sources unreachable" : "Some data sources unreachable"}
      </div>
      <div style={{ color: problems.length === 3 ? "#B91C1C" : "#A16207" }}>
        {problems.length === 3
          ? "This dashboard requires internet access to fetch live data from GitHub Pages, Postcodes.io, and the NBN Atlas. To use it, open this page in a browser with internet access."
          : `Unreachable: ${problems.join(", ")}. Some features may be limited.`}
      </div>
      <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
        {[["GitHub data", status.github], ["Postcodes.io", status.postcodes], ["NBN Atlas", status.nbn]].map(([name, ok]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: ok ? "#22C55E" : "#EF4444", display: "inline-block" }} />
            <span style={{ color: "#374151" }}>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NationalPanel({ data }) {
  if (!data) return null;
  const counts = data.designation_counts || {};
  const types = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1B4332" }}>🏴󠁧󠁢󠁳󠁣󠁴󠁿 Protected Sites Across Scotland</h2>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#9CA3AF" }}>
          Source: NatureScot GeoJSON downloads · Processed {data.last_processed ? new Date(data.last_processed).toLocaleDateString() : "recently"}
        </p>
      </div>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
          {types.map(([type, count]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderRadius: "10px", backgroundColor: "#F0FFF4", border: "1px solid #D1FAE5" }}>
              <DesignationBadge type={type} />
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#1B4332", fontFamily: "'JetBrains Mono', monospace" }}>{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "#1B4332" }}>
          {data.total_sites?.toLocaleString()} total designated sites
        </div>
        {data.data_sources?.protected_sites && (
          <div style={{ marginTop: "8px", fontSize: "11px", color: "#9CA3AF" }}>
            {data.data_sources.protected_sites.attribution}
          </div>
        )}
      </div>
    </div>
  );
}

function NearbySitesPanel({ sites, lat, lon, radius, onRadiusChange }) {
  if (!sites) return null;
  const nearby = sites
    .filter(s => s.centroid_lat && s.centroid_lon)
    .map(s => ({ ...s, distance: haversineKm(lat, lon, s.centroid_lat, s.centroid_lon) }))
    .filter(s => s.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  const byType = {};
  nearby.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });

  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1B4332" }}>📍 Protected Sites Nearby</h2>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#9CA3AF" }}>
            {nearby.length} site{nearby.length !== 1 ? "s" : ""} within {radius}km · Source: NatureScot open data
          </p>
        </div>
        <select value={radius} onChange={(e) => onRadiusChange(Number(e.target.value))} style={{
          padding: "4px 8px", borderRadius: "6px", border: "1px solid #D1D5DB", fontSize: "12px", color: "#374151", cursor: "pointer",
        }}>
          <option value={2}>2 km</option>
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={20}>20 km</option>
        </select>
      </div>
      <div style={{ padding: "16px 20px" }}>
        {nearby.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#6B7280", fontStyle: "italic" }}>
            No designated sites found within {radius}km. Try expanding the search radius.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "16px", backgroundColor: "#F0FFF4", border: "1px solid #D1FAE5", fontSize: "12px" }}>
                  <DesignationBadge type={type} />
                  <span style={{ fontWeight: 600, color: "#1B4332" }}>{count}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {nearby.slice(0, 20).map((site, i) => (
                <div key={`${site.name}-${site.type}-${i}`} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 14px", borderRadius: "8px",
                  backgroundColor: i % 2 === 0 ? "#FAFDF7" : "#fff", border: "1px solid #E5E7EB",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                    <DesignationBadge type={site.type} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#1B4332", fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {site.name}
                      </div>
                      {site.area_ha && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{site.area_ha.toLocaleString()} ha</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#40916C", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>
                    {site.distance.toFixed(1)} km
                  </div>
                </div>
              ))}
              {nearby.length > 20 && (
                <div style={{ textAlign: "center", fontSize: "12px", color: "#9CA3AF", padding: "8px" }}>
                  …and {nearby.length - 20} more within {radius}km
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SpeciesPanel({ groups, onSelectGroup, selectedGroup, speciesList, loadingSpecies }) {
  const chartData = groups.slice(0, 12).map((g) => ({
    name: g.name.length > 14 ? g.name.slice(0, 13) + "…" : g.name,
    fullName: g.name, species: g.speciesCount || g.count, records: g.count,
  }));
  const totalSpecies = groups.reduce((s, g) => s + (g.speciesCount || 0), 0);
  const totalRecords = groups.reduce((s, g) => s + g.count, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Species recorded", value: totalSpecies.toLocaleString(), bg: "linear-gradient(135deg, #1B4332, #2D6A4F)" },
          { label: "Total records", value: totalRecords.toLocaleString(), bg: "linear-gradient(135deg, #40916C, #52B788)" },
          { label: "Taxonomic groups", value: groups.length, bg: "linear-gradient(135deg, #74C69D, #95D5B2)", dark: true },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 20px", borderRadius: "12px", background: s.bg, color: s.dark ? "#1B4332" : "#fff", flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: "28px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
            <div style={{ fontSize: "12px", opacity: s.dark ? 0.7 : 0.8, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ width: "100%", height: Math.max(280, chartData.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
            <XAxis type="number" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: "#374151" }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (<div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: "8px", padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "13px" }}>
                <div style={{ fontWeight: 700, color: "#1B4332" }}>{GROUP_ICONS[d.fullName] || "📋"} {d.fullName}</div>
                <div style={{ color: "#6B7280", marginTop: 4 }}>{d.species} species · {d.records.toLocaleString()} records</div>
              </div>);
            }} />
            <Bar dataKey="species" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d) => onSelectGroup(d.fullName)}>
              {chartData.map((d, i) => (<Cell key={i} fill={d.fullName === selectedGroup ? "#1B4332" : "#52B788"} style={{ transition: "fill 0.2s" }} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: "12px", color: "#9CA3AF", textAlign: "center", marginTop: 4 }}>Click a bar to view species list</div>
      {selectedGroup && (
        <div style={{ marginTop: "20px", border: "1px solid #D1FAE5", borderRadius: "12px", overflow: "hidden", backgroundColor: "#FAFDF7" }}>
          <div style={{ padding: "12px 16px", backgroundColor: "#D8F3DC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, color: "#1B4332", fontSize: "14px" }}>{GROUP_ICONS[selectedGroup] || "📋"} {selectedGroup}</span>
            <button onClick={() => onSelectGroup(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#6B7280" }}>✕</button>
          </div>
          {loadingSpecies ? (<div style={{ padding: "24px", textAlign: "center", color: "#6B7280" }}>Loading species…</div>
          ) : speciesList && speciesList.length > 0 ? (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {speciesList.map((sp, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: i < speciesList.length - 1 ? "1px solid #E5E7EB" : "none", backgroundColor: i % 2 === 0 ? "#fff" : "#FAFDF7" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1B4332", fontSize: "13px" }}>{sp.name}</div>
                    <div style={{ fontSize: "11px", color: "#9CA3AF", fontStyle: "italic" }}>{sp.scientificName}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", fontWeight: 600, color: "#40916C" }}>{sp.count}</div>
                </div>
              ))}
            </div>
          ) : (<div style={{ padding: "24px", textAlign: "center", color: "#6B7280" }}>No species data available.</div>)}
        </div>
      )}
    </div>
  );
}

function ComingSoonPanel({ title, icon, description, dataSource, actionUrl }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F3F4F6" }}>
        <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1B4332" }}>{icon} {title}</h2>
      </div>
      <div style={{ padding: "24px", textAlign: "center" }}>
        <p style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: 600, color: "#374151" }}>{description}</p>
        <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#9CA3AF", lineHeight: 1.5, maxWidth: 440, marginLeft: "auto", marginRight: "auto" }}>
          Requires: <strong>{dataSource}</strong>
        </p>
        {actionUrl && <a href={actionUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "6px 14px", borderRadius: "8px", backgroundColor: "#F0FDF4", border: "1px solid #D1FAE5", color: "#2D6A4F", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>View data source →</a>}
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function ScotlandNatureDashboard() {
  const [apiStatus, setApiStatus] = useState(null);
  const [nationalData, setNationalData] = useState(null);
  const [allSites, setAllSites] = useState(null);
  const [postcode, setPostcode] = useState("");
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [speciesGroups, setSpeciesGroups] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [speciesList, setSpeciesList] = useState(null);
  const [loadingSpecies, setLoadingSpecies] = useState(false);
  const [speciesLoading, setSpeciesLoading] = useState(false);
  const [speciesError, setSpeciesError] = useState(null);
  const [radius, setRadius] = useState(5);

  // Load data on mount
  useEffect(() => {
    (async () => {
      const status = { github: false, postcodes: false, nbn: false };
      try {
        const nat = await fetchJSON(`${GITHUB_DATA_BASE}/national.json`);
        setNationalData(nat);
        status.github = true;
      } catch { status.github = false; }
      try {
        const sites = await fetchJSON(`${GITHUB_DATA_BASE}/sites.json`);
        setAllSites(sites);
        if (!status.github) status.github = true;
      } catch {}
      try {
        const r = await fetch("https://api.postcodes.io/postcodes/EH11RE", { signal: AbortSignal.timeout(5000) });
        status.postcodes = r.ok;
      } catch { status.postcodes = false; }
      try {
        const r = await fetch("https://records-ws.nbnatlas.org/explore/groups?lat=55.95&lon=-3.19&radius=1", { signal: AbortSignal.timeout(5000) });
        status.nbn = r.ok;
      } catch { status.nbn = false; }
      setApiStatus(status);
    })();
  }, []);

  const handleSearch = useCallback(async () => {
    const clean = postcode.replace(/\s/g, "").toUpperCase();
    if (clean.length < 5) { setError("Please enter a full Scottish postcode (e.g. EH1 1RE)"); return; }
    if (!SCOTTISH_PREFIXES.includes(clean.slice(0, 2)) && !/^G\d/.test(clean)) {
      setError("This doesn't look like a Scottish postcode."); return;
    }
    setError(null); setLoading(true); setSpeciesGroups(null); setSelectedGroup(null); setSpeciesList(null); setSpeciesError(null);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
      if (!res.ok) throw new Error("Invalid postcode");
      const data = await res.json();
      if (data.result.country !== "Scotland") throw new Error("Not in Scotland");
      const loc = { lat: data.result.latitude, lon: data.result.longitude, admin: data.result.admin_district, ward: data.result.admin_ward, constituency: data.result.parliamentary_constituency, postcode: data.result.postcode };
      setLocation(loc); setLoading(false);
      setSpeciesLoading(true);
      try {
        const r = await fetch(`https://records-ws.nbnatlas.org/explore/groups?lat=${loc.lat}&lon=${loc.lon}&radius=${radius}&fq=country:Scotland`);
        if (!r.ok) throw new Error();
        const groups = (await r.json()).filter(g => g.count > 0).map(g => ({ name: g.name, count: g.count, speciesCount: g.speciesCount })).sort((a, b) => b.count - a.count);
        setSpeciesGroups(groups);
      } catch { setSpeciesError("Could not load species data from the NBN Atlas."); }
      finally { setSpeciesLoading(false); }
    } catch (e) {
      setLoading(false);
      setError(e.message === "Not in Scotland" ? "This postcode isn't in Scotland." : e.message === "Invalid postcode" ? "Postcode not recognised." : "Could not look up postcode. Check your internet connection.");
    }
  }, [postcode, radius]);

  const handleGroupSelect = useCallback(async (groupName) => {
    if (groupName === selectedGroup) { setSelectedGroup(null); setSpeciesList(null); return; }
    setSelectedGroup(groupName); setLoadingSpecies(true);
    try {
      const r = await fetch(`https://records-ws.nbnatlas.org/explore/group/${encodeURIComponent(groupName)}?lat=${location.lat}&lon=${location.lon}&radius=${radius}&pageSize=20&fq=country:Scotland`);
      if (!r.ok) throw new Error();
      setSpeciesList((await r.json()).map(s => ({ name: s.commonName || s.name, scientificName: s.name, count: s.count })));
    } catch { setSpeciesList([]); }
    setLoadingSpecies(false);
  }, [location, selectedGroup, radius]);

  const canSearch = apiStatus?.postcodes;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(170deg, #F0FFF4 0%, #ECFDF5 30%, #F9FAFB 100%)", fontFamily: "'Instrument Sans', 'Segoe UI', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease-out forwards; }
        input:focus { outline: none; border-color: #40916C !important; box-shadow: 0 0 0 3px rgba(64,145,108,0.15) !important; }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1B4332 0%, #2D6A4F 60%, #40916C 100%)", padding: "32px 24px 28px", color: "#fff" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 6px", fontSize: "26px", fontWeight: 700, letterSpacing: "-0.5px" }}>Scotland Nature Dashboard</h1>
          <p style={{ margin: 0, fontSize: "14px", opacity: 0.8 }}>Explore biodiversity and protected sites near any Scottish postcode</p>
          {canSearch && (
            <div style={{ display: "flex", gap: "10px", marginTop: "20px", maxWidth: 480 }}>
              <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()} placeholder="e.g. EH1 1RE"
                style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", border: "2px solid rgba(255,255,255,0.25)", backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", fontSize: "16px", fontWeight: 600, letterSpacing: "1px", fontFamily: "'JetBrains Mono', monospace" }} />
              <button onClick={handleSearch} disabled={loading}
                style={{ padding: "12px 24px", borderRadius: "10px", border: "none", backgroundColor: "#D8F3DC", color: "#1B4332", fontWeight: 700, fontSize: "14px", cursor: loading ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                {loading ? "Searching…" : "Explore"}
              </button>
            </div>
          )}
          {error && <div style={{ marginTop: "12px", padding: "8px 14px", borderRadius: "8px", backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5", fontSize: "13px", maxWidth: 480 }}>{error}</div>}
          {location && (
            <div className="fade-in" style={{ marginTop: "12px", fontSize: "13px", opacity: 0.85, display: "flex", alignItems: "center", gap: "6px" }}>
              <span>📍</span><span style={{ fontWeight: 600 }}>{location.postcode}</span><span>·</span><span>{location.admin}</span>
              {location.constituency && (<><span>·</span><span>{location.constituency}</span></>)}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <StatusBanner status={apiStatus} />

        {/* National summary — always shown if data loaded */}
        {nationalData && !location && <NationalPanel data={nationalData} />}

        {/* Postcode results */}
        {location && (
          <>
            {allSites && <NearbySitesPanel sites={allSites} lat={location.lat} lon={location.lon} radius={radius} onRadiusChange={setRadius} />}
            
            <ComingSoonPanel title="Habitat Types" icon="🌱"
              description="Land cover composition near this postcode"
              dataSource="NatureScot Habitat Map of Scotland (HabMoS)"
              actionUrl="https://www.nature.scot/landscapes-and-habitats/habitat-data-and-habitat-map-scotland" />

            <div className="fade-in" style={{ backgroundColor: "#fff", borderRadius: "16px", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F3F4F6" }}>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1B4332" }}>🦅 Species Recorded Nearby</h2>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#9CA3AF" }}>Live data from the NBN Atlas within {radius}km</p>
              </div>
              <div style={{ padding: "20px" }}>
                {speciesLoading ? <div style={{ padding: "40px", textAlign: "center", color: "#6B7280" }}>Loading species records from NBN Atlas…</div>
                : speciesError ? <div style={{ padding: "24px", textAlign: "center", color: "#DC2626", fontSize: "13px" }}>{speciesError}</div>
                : speciesGroups?.length > 0 ? <SpeciesPanel groups={speciesGroups} onSelectGroup={handleGroupSelect} selectedGroup={selectedGroup} speciesList={speciesList} loadingSpecies={loadingSpecies} />
                : speciesGroups?.length === 0 ? <div style={{ padding: "24px", textAlign: "center", color: "#6B7280" }}>No species records found nearby.</div>
                : null}
              </div>
            </div>
          </>
        )}

        {/* Landing state */}
        {!location && !loading && canSearch && !nationalData && (
          <div style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏴󠁧󠁢󠁳󠁣󠁴󠁿</div>
            <h2 style={{ margin: "0 0 8px", fontSize: "22px", fontWeight: 700, color: "#1B4332" }}>Explore Scotland's Nature</h2>
            <p style={{ margin: 0, fontSize: "15px", color: "#6B7280" }}>Enter a Scottish postcode above to get started.</p>
          </div>
        )}
        {!location && !loading && canSearch && (
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            {["EH1 1RE", "G1 1XQ", "AB10 1AF", "IV2 3BL", "DD1 4HN"].map((pc) => (
              <button key={pc} onClick={() => setPostcode(pc)} style={{
                padding: "8px 16px", borderRadius: "8px", border: "1px solid #D1FAE5", backgroundColor: "#F0FFF4",
                color: "#2D6A4F", fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
              }}>{pc}</button>
            ))}
          </div>
        )}

        {/* Attribution */}
        <div style={{ padding: "16px 20px", borderRadius: "12px", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB", fontSize: "11px", color: "#9CA3AF", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: "#6B7280", marginBottom: "4px" }}>Data sources & attribution</div>
          <div>
            Protected sites: <a href="https://gis-downloads.nature.scot/" style={{ color: "#40916C" }}>NatureScot GeoJSON downloads</a> — Contains NatureScot information licensed under the Open Government Licence v3.0.
            Species data: <a href="https://nbnatlas.org/" style={{ color: "#40916C" }}>NBN Atlas</a> (live API, CC-BY/CC-BY-NC).
            Postcodes: <a href="https://postcodes.io/" style={{ color: "#40916C" }}>Postcodes.io</a> — contains OS data © Crown copyright.
          </div>
        </div>
      </div>
    </div>
  );
}
