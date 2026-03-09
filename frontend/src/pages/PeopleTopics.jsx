import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import api from "../services/api";

const PERSON_TYPES = new Set(["person", "human", "individual"]);

function normaliseType(raw) {
  return PERSON_TYPES.has((raw || "").toLowerCase()) ? "person" : "topic";
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8, padding: "8px 12px", fontSize: 13,
    }}>
      <p style={{ color: "#fff", margin: "0 0 2px", fontWeight: 500 }}>{d.name}</p>
      <p style={{ color: "#64748b", margin: 0 }}>{d.count} mention{d.count !== 1 ? "s" : ""}</p>
    </div>
  );
}

function HorizBars({ data, color }) {
  if (!data.length) return (
    <p style={{ textAlign: "center", padding: 48, color: "#475569", margin: 0 }}>No data found.</p>
  );
  const max = data[0]?.count || 1;
  return (
    <div>
      {data.map((item, i) => {
        const pct = (item.count / max) * 100;
        const opacity = 0.45 + 0.55 * (1 - i / Math.max(data.length - 1, 1));
        return (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{
              fontSize: 12, color: "#cbd5e1", width: 140, flexShrink: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={item.name}>
              {item.name}
            </span>
            <div style={{ flex: 1, height: 20, background: "#1e293b", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 99,
                background: color, opacity,
                transition: "width 0.4s ease",
              }} />
            </div>
            <span style={{ fontSize: 11, color: "#64748b", width: 28, textAlign: "right", flexShrink: 0 }}>
              {item.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChartView({ data, color }) {
  if (!data.length) return null;
  const top = data.slice(0, 15);
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={top} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={130}
          tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {top.map((_, i) => (
            <Cell key={i} fill={color}
              fillOpacity={0.45 + 0.55 * (1 - i / Math.max(top.length - 1, 1))} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function PeopleTopics() {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("people");
  const [view, setView]         = useState("bars");

  useEffect(() => {
    api.get("/api/entities")
      .then(res => {
        const raw = res.data.entities || [];
        setEntities(raw.map(e => ({ ...e, type: normaliseType(e.type || e.entity_type || "") })));
      })
      .catch(() => setError("Failed to load entity data."))
      .finally(() => setLoading(false));
  }, []);

  const people  = entities.filter(e => e.type === "person");
  const topics  = entities.filter(e => e.type !== "person");
  const data    = tab === "people" ? people : topics;
  const accent  = "var(--accent, #6366f1)";
  const accent2 = "#a855f7";
  const color   = tab === "people" ? accent : accent2;

  const tabBtn = (id, label, count) => (
    <button key={id} onClick={() => setTab(id)} style={{
      padding: "6px 16px", fontSize: 13, borderRadius: 6,
      background: tab === id ? "#6366f1" : "transparent",
      color: tab === id ? "#fff" : "#64748b",
      border: "none", cursor: "pointer",
    }}>
      {label} <span style={{ opacity: 0.6, fontSize: 11 }}>({count})</span>
    </button>
  );

  const viewBtn = (id, label) => (
    <button key={id} onClick={() => setView(id)} style={{
      padding: "4px 12px", fontSize: 11, borderRadius: 5,
      background: view === id ? "#1e293b" : "transparent",
      color: view === id ? "#fff" : "#475569",
      border: "none", cursor: "pointer",
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Entities", value: entities.length },
          { label: "People",         value: people.length },
          { label: "Topics",         value: topics.length },
        ].map(s => (
          <div key={s.label} style={{
            background: "#10101e",
            border: "1px solid rgba(255,255,255,0.05)",
            borderTop: `2px solid ${accent}`,
            borderRadius: 12, padding: "14px 16px",
          }}>
            <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 4px" }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600, color: "#fff", margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{
          display: "flex", gap: 4,
          background: "#0c0c18", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 8, padding: 4,
        }}>
          {tabBtn("people", "People", people.length)}
          {tabBtn("topics", "Topics", topics.length)}
        </div>
        <div style={{
          display: "flex", gap: 2,
          background: "#0c0c18", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 6, padding: 3,
        }}>
          {viewBtn("bars",  "Bars")}
          {viewBtn("chart", "Chart")}
        </div>
      </div>

      {/* Main panel */}
      <div style={{
        background: "#10101e", border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 12, padding: 24,
      }}>
        {loading ? (
          <p style={{ textAlign: "center", padding: 48, color: "#475569", margin: 0 }}>Loading entities…</p>
        ) : error ? (
          <p style={{ textAlign: "center", padding: 48, color: "#f87171", margin: 0 }}>{error}</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "#475569", margin: "0 0 20px" }}>
              {data.length} unique {tab === "people" ? "people" : "topics"} mentioned
            </p>
            {view === "bars" ? <HorizBars data={data} color={color} /> : <ChartView data={data} color={color} />}
          </>
        )}
      </div>

      {/* Top callout chips */}
      {!loading && !error && data.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
          {data.slice(0, 6).map(item => (
            <div key={item.name} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: "#10101e", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 10, padding: "10px 14px",
            }}>
              <span style={{ fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                {item.name}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, flexShrink: 0,
                padding: "2px 8px", borderRadius: 99,
                color: color,
                background: `${color === accent ? "rgba(99,102,241" : "rgba(168,85,247"},0.1)`,
                border: `1px solid ${color === accent ? "rgba(99,102,241" : "rgba(168,85,247"},0.25)`,
              }}>
                ×{item.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
