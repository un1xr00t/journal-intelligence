import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import StatsRow from '../components/StatsRow'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt1 = v => (v == null ? '—' : parseFloat(v).toFixed(1))
const fmt2 = v => (v == null ? '—' : parseFloat(v).toFixed(2))

function sevColor(sev) {
  if (sev == null) return 'var(--border)'
  if (sev >= 7.5) return '#dc2626'
  if (sev >= 6)   return '#f97316'
  if (sev >= 4)   return '#eab308'
  return '#22c55e'
}

function sevBg(sev) {
  if (sev == null) return 'var(--bg-card)'
  if (sev >= 7.5) return 'rgba(220,38,38,0.15)'
  if (sev >= 6)   return 'rgba(249,115,22,0.12)'
  if (sev >= 4)   return 'rgba(234,179,8,0.10)'
  return 'rgba(34,197,94,0.12)'
}

function deltaLabel(v, invert = false) {
  if (v == null) return null
  const good = invert ? v < 0 : v > 0
  const bad  = invert ? v > 0 : v < 0
  const color = good ? '#22c55e' : bad ? '#ef4444' : 'var(--text-muted)'
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '→'
  return <span style={{ color, fontSize: 12 }}>{arrow} {Math.abs(parseFloat(v)).toFixed(1)}</span>
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 11 }}>
      <div style={{ fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-secondary)' }}>{p.name}: {parseFloat(p.value).toFixed(1)}</div>
      ))}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', ...style }}>
      {children}
    </div>
  )
}

// ── Mood Calendar ─────────────────────────────────────────────────────────────

function MoodCalendar({ calendar }) {
  if (!calendar?.length) return null
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
        {calendar.map((day, i) => (
          <div
            key={i}
            title={day.date + (day.severity ? ` — sev ${day.severity}` : ' — no entry')}
            style={{
              width: 14, height: 14,
              borderRadius: 3,
              background: day.severity ? sevColor(day.severity) : 'var(--border)',
              opacity: day.severity ? 0.85 : 0.25,
              cursor: day.severity ? 'default' : 'default',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>12 weeks ago</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {[['#22c55e','calm'],['#eab308','mild'],['#f97316','elevated'],['#dc2626','high']].map(([c,l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />{l}
            </span>
          ))}
        </div>
        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>today</span>
      </div>
    </Card>
  )
}

// ── Trigger Map ───────────────────────────────────────────────────────────────

function TriggerMap({ stressors, protectors }) {
  const maxSev = 10
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Card>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Stressors</div>
        {!stressors?.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not enough data yet</div>}
        {stressors?.map((s, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.topic}</span>
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: sevColor(s.avg_severity) }}>{s.avg_severity}</span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(s.avg_severity / maxSev) * 100}%`, background: sevColor(s.avg_severity), borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Protective factors</div>
        {!protectors?.length && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not enough data yet</div>}
        {protectors?.map((p, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.topic}</span>
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: '#22c55e' }}>{p.avg_severity}</span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(1 - (p.avg_severity / 10)) * 100}%`, background: '#22c55e', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  )
}

// ── Keyword Shifts ────────────────────────────────────────────────────────────

function KeywordShifts({ shifts }) {
  if (!shifts?.length) return (
    <Card><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>More entries needed to detect language shifts.</div></Card>
  )
  return (
    <Card>
      <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginBottom: 12 }}>vs prior 30 days</div>
      {shifts.map((k, i) => {
        const pct = k.pct_change
        const barColor = pct > 0 ? (k.keyword.match(/exhausted|scared|hopeless|angry|anxious|frustrated|overwhelmed|numb|rage|alone|ashamed/) ? '#ef4444' : '#22c55e') : '#22c55e'
        return (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{k.keyword}</span>
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: pct > 0 ? barColor : '#22c55e' }}>
                {pct > 0 ? '+' : ''}{pct}%
              </span>
            </div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.abs(pct))}%`, background: barColor, borderRadius: 3, opacity: 0.8 }} />
            </div>
          </div>
        )
      })}
    </Card>
  )
}

// ── Day of Week ───────────────────────────────────────────────────────────────

function DayOfWeek({ data }) {
  if (!data?.length) return null
  const valid = data.filter(d => d.avg_severity != null)
  if (!valid.length) return null
  return (
    <Card>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
            <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={5} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
            <Bar dataKey="avg_severity" name="avg severity" radius={[3, 3, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.avg_severity ? sevColor(entry.avg_severity) : 'var(--border)'} opacity={entry.avg_severity ? 0.85 : 0.3} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

// ── People Impact ─────────────────────────────────────────────────────────────

function PeopleImpact({ people }) {
  if (!people?.length) return (
    <Card><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No people mentioned 2+ times this period.</div></Card>
  )
  return (
    <Card style={{ padding: 0 }}>
      {people.map((p, i) => {
        const initials = p.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
        const impact = p.avg_severity >= 6.5 ? { label: 'stressor', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
                     : p.avg_severity <= 4.5 ? { label: 'stabilizing', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' }
                     : { label: 'mixed', color: 'var(--text-muted)', bg: 'var(--border)' }
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: i < people.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: impact.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: impact.color, flexShrink: 0 }}>{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.mentions} mentions · avg sev {fmt1(p.avg_severity)} · {p.distress_entries} high-distress
              </div>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', padding: '3px 8px', borderRadius: 4, background: impact.bg, color: impact.color, flexShrink: 0 }}>{impact.label}</span>
          </div>
        )
      })}
    </Card>
  )
}

// ── AI Narrative ──────────────────────────────────────────────────────────────

function Narrative({ data, onRefresh, refreshing }) {
  if (!data) return null
  const quotes = Array.isArray(data.quotes)
    ? data.quotes.filter(q => typeof q === 'string' ? q : q?.text)
    : []

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          AI narrative · {data.cached ? 'this week' : 'just generated'}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', padding: '4px 10px', cursor: 'pointer', opacity: refreshing ? 0.5 : 1 }}
        >
          {refreshing ? 'generating...' : '⟳ refresh'}
        </button>
      </div>
      {data.narrative ? (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, fontFamily: 'Georgia, serif', whiteSpace: 'pre-wrap' }}>
          {data.narrative}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No narrative yet — add an API key in Settings to generate one.</div>
      )}
      {quotes.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>From your entries this month</div>
          {quotes.map((q, i) => (
            <div key={i} style={{ borderLeft: '3px solid #7c3aed', paddingLeft: 14, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
              "{typeof q === 'string' ? q : q?.text}"
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ── Month-over-month comparison ───────────────────────────────────────────────

function MonthComparison({ stats }) {
  const items = [
    { label: 'Wellbeing', delta: stats.mood_delta, invert: false, unit: '' },
    { label: 'Severity', delta: stats.sev_delta, invert: true, unit: '' },
    { label: 'High-distress days', delta: stats.high_distress_days != null && stats.prev_high_distress != null ? stats.high_distress_days - stats.prev_high_distress : null, invert: true, unit: ' days' },
    { label: 'Journaling consistency', delta: stats.days_journaled != null && stats.prev_days_journaled != null ? stats.days_journaled - stats.prev_days_journaled : null, invert: false, unit: ' days' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {items.map((item, i) => {
        const d = item.delta
        const good = item.invert ? (d < 0) : (d > 0)
        const color = d == null ? 'var(--text-muted)' : d === 0 ? 'var(--text-muted)' : good ? '#22c55e' : '#ef4444'
        return (
          <Card key={i} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>
              {d == null ? '—' : `${d > 0 ? '+' : ''}${parseFloat(d).toFixed(1)}${item.unit}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>vs prev 30d</div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MentalHealth() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refreshNarrative = false) => {
    try {
      const url = `/api/mental-health/dashboard${refreshNarrative ? '?refresh_narrative=true' : ''}`
      const r = await api.get(url)
      setData(r.data)
      setError(null)
    } catch (e) {
      setError('Failed to load dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRefreshNarrative = async () => {
    setRefreshing(true)
    try {
      const r = await api.post('/api/mental-health/narrative/refresh')
      setData(prev => prev ? { ...prev, narrative: r.data.narrative } : prev)
    } catch (e) {
      console.error(e)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
      computing your mental health dashboard...
    </div>
  )

  if (error) return (
    <div style={{ textAlign: 'center', padding: 60, color: '#ef4444', fontSize: 13 }}>{error}</div>
  )

  const { stats, narrative, computed_at } = data || {}

  if (!stats) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>
      No journal data yet. Add some entries to see your mental health dashboard.
    </div>
  )

  const computedLabel = computed_at
    ? `last computed ${new Date(computed_at + 'Z').toLocaleString()}`
    : ''

  return (
    <div>
      <PageHeader
        title="My Mental Health"
        subtitle="AI analysis of your journal — narrative refreshes weekly"
        actions={
          <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
            {computedLabel}
          </span>
        }
      />

      <StatsRow stats={[
        { label: 'Wellbeing', value: fmt1(stats.avg_mood), color: '#22c55e', sub: '30-day avg mood' },
        { label: 'Avg Severity', value: fmt1(stats.avg_severity), color: 'var(--severity-color)', sub: '30-day avg' },
        { label: 'Volatility', value: fmt2(stats.volatility), color: '#8b5cf6', sub: 'mood std dev' },
        { label: 'Recovery', value: stats.recovery_speed_days ? `${stats.recovery_speed_days}d` : '—', color: '#f97316', sub: 'avg to baseline' },
        { label: 'Journaled', value: `${stats.days_journaled}/30`, color: '#3b82f6', sub: 'days this period' },
        { label: 'High distress', value: stats.high_distress_days, color: '#ef4444', sub: 'severity 7+ days' },
        { label: 'Low distress', value: stats.low_distress_days, color: '#22c55e', sub: 'severity 4 or under' },
        { label: 'Streak', value: `${stats.streak}d`, color: '#eab308', sub: 'current run' },
      ]} />

      <Section title="Mood calendar — 12 weeks">
        <MoodCalendar calendar={stats.calendar} />
      </Section>

      <Section title="Month-over-month">
        <MonthComparison stats={stats} />
      </Section>

      <Section title="Trigger map — what raises and lowers your distress">
        <TriggerMap stressors={stats.stressors} protectors={stats.protectors} />
      </Section>

      <Section title="Day-of-week severity patterns">
        <DayOfWeek data={stats.day_of_week} />
      </Section>

      <Section title="Emotional language shifts — this 30 days vs prior 30 days">
        <KeywordShifts shifts={stats.keyword_shifts} />
      </Section>

      <Section title="People impact on your wellbeing — last 30 days">
        <PeopleImpact people={stats.people_impact} />
      </Section>

      <Section title="AI narrative">
        <Narrative data={narrative} onRefresh={handleRefreshNarrative} refreshing={refreshing} />
      </Section>
    </div>
  )
}
