import { useState, useEffect } from 'react'
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import StatsRow from '../components/StatsRow'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11 }}>
      <div style={{ fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>{p.name}: {parseFloat(p.value).toFixed(2)}</div>
      ))}
    </div>
  )
}

export default function NervousSystem() {
  const [trend, setTrend] = useState([])
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/api/mood/trend?days=${days}`).then(r => {
      const raw = (r.data.trend || []).map(t => ({
        date: t.entry_date,
        mood: parseFloat(t.mood_score || 0),
        severity: parseFloat(t.severity || 0),
      }))
      const data = raw.map((t, i) => ({
        ...t,
        delta: i > 0 ? t.mood - raw[i - 1].mood : 0,
      }))
      setTrend(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [days])

  const avg = trend.length ? (trend.reduce((s, t) => s + t.mood, 0) / trend.length).toFixed(2) : 0
  const avgSev = trend.length ? (trend.reduce((s, t) => s + t.severity, 0) / trend.length).toFixed(2) : 0
  const volatility = trend.length > 1
    ? Math.sqrt(trend.reduce((s, t) => s + Math.pow(t.delta, 2), 0) / (trend.length - 1)).toFixed(2)
    : 0
  const stability = Math.max(0, (10 - parseFloat(volatility) * 2)).toFixed(1)

  return (
    <div>
      <PageHeader title="Nervous System" subtitle="Mood & severity over time"
        actions={
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, padding: '5px 10px', outline: 'none' }}>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        }
      />
      <StatsRow stats={[
        { label: 'Avg Mood', value: avg, color: '#10b981' },
        { label: 'Avg Severity', value: avgSev, color: 'var(--severity-color)' },
        { label: 'Volatility', value: volatility, color: '#8b5cf6', sub: 'mood std dev' },
        { label: 'Stability', value: `${stability}/10`, color: 'var(--accent)', sub: 'higher = better' },
      ]} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>loading...</div>
      ) : (
        <>
          {/* Mood over time */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Mood score</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={5} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="mood" name="mood" stroke="#10b981" strokeWidth={2} fill="url(#moodFill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Severity over time */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Severity score</div>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="sevFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--severity-color)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--severity-color)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="severity" name="severity" stroke="var(--severity-color)" strokeWidth={2} fill="url(#sevFill)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Overlay */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px' }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Mood vs severity overlay</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={trend}>
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={28} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
                <Line type="monotone" dataKey="mood" stroke="#10b981" strokeWidth={1.5} dot={false} name="mood" />
                <Line type="monotone" dataKey="severity" stroke="var(--severity-color)" strokeWidth={1.5} dot={false} name="severity" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
