import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const SEGMENT_COLORS = [
  '#6366f1', '#8b5cf6', '#f59e0b', '#22c55e',
  '#ec4899', '#06b6d4', '#f97316', '#a3e635',
]

const TIP_PROMPTS = [
  'Give me one surprising, specific tip about reducing a common household expense that most people overlook. Under 2 sentences. Be concrete, not generic.',
  'What is one counterintuitive money insight that most personal finance advice gets completely wrong? Under 2 sentences. Be specific and bold.',
  'What is one small financial habit that compounds dramatically over 5 years? Name the exact habit and a rough dollar figure. Under 2 sentences.',
  'What is one specific action someone can take this week to meaningfully reduce their monthly spending without feeling deprived? Under 2 sentences.',
]

function getRating(leftover) {
  if (leftover <= 100) return { label: 'Survival',   color: '#ef4444' }
  if (leftover <= 200) return { label: 'Very Tight', color: '#f59e0b' }
  if (leftover <= 300) return { label: 'Tight',      color: '#f59e0b' }
  if (leftover <= 500) return { label: 'Good',       color: 'var(--accent)' }
  return                      { label: 'Very Good',  color: '#22c55e' }
}

// ─── Shared style tokens ──────────────────────────────────────────────────────

const inp = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
}

const lbl = {
  fontSize: 11,
  fontFamily: 'IBM Plex Mono, monospace',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  display: 'block',
  marginBottom: 6,
}

const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 24,
}

// ─── Donut Chart (pure SVG) ───────────────────────────────────────────────────

function DonutChart({ segments }) {
  const size   = 180
  const cx     = size / 2
  const cy     = size / 2
  const r      = 70
  const stroke = 28
  const circum = 2 * Math.PI * r
  const total  = segments.reduce((s, x) => s + x.value, 0) || 1

  let offset = 0
  const arcs = segments.map((seg) => {
    const pct  = seg.value / total
    const dash = pct * circum
    const gap  = circum - dash
    const arc  = { ...seg, dash, gap, offset: offset * circum }
    offset += pct
    return arc
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth={stroke} />
      {arcs.map((arc, i) => (
        <circle
          key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={arc.color} strokeWidth={stroke}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset + circum / 4}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-primary)" fontSize="18" fontFamily="IBM Plex Mono, monospace" fontWeight="700">
        ${total.toLocaleString()}
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--text-muted)" fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="0.08em">
        TOTAL/MO
      </text>
    </svg>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ onDone, initialData }) {
  const [income,    setIncome]    = useState(initialData?.income?.toString()    || '')
  const [rent,      setRent]      = useState(initialData?.rent?.toString()      || '')
  const [utilities, setUtilities] = useState(initialData?.utilities?.toString() || '')
  const [expenses,  setExpenses]  = useState(
    initialData?.expenses?.length
      ? initialData.expenses.map(e => ({ name: e.name, amount: e.amount.toString() }))
      : [{ name: '', amount: '' }]
  )
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const addRow    = () => setExpenses(e => [...e, { name: '', amount: '' }])
  const removeRow = i  => setExpenses(e => e.length === 1 ? e : e.filter((_, idx) => idx !== i))
  const updateRow = (i, field, val) =>
    setExpenses(e => e.map((r, idx) => idx === i ? { ...r, [field]: val } : r))

  const handleCSV = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = ev.target.result
        .split('\n').map(l => l.trim()).filter(Boolean)
        .map(l => {
          const parts  = l.split(',')
          const name   = (parts[0] || '').trim()
          const amount = (parts[1] || '').trim().replace(/[^0-9.]/g, '')
          return { name, amount }
        }).filter(r => r.name)
      setExpenses(e => [...e, ...rows])
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const runningTotal = expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  const handleBuild = async () => {
    const plan = {
      income:    parseFloat(income)    || 0,
      rent:      parseFloat(rent)      || 0,
      utilities: parseFloat(utilities) || 0,
      expenses:  expenses
        .filter(x => x.name.trim())
        .map(x => ({ name: x.name.trim(), amount: parseFloat(x.amount) || 0 })),
    }
    setSaving(true)
    try {
      await api.post('/api/budget/plan', plan)
    } catch (err) {
      console.error('Failed to save budget plan:', err)
    } finally {
      setSaving(false)
    }
    onDone(plan)
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', marginBottom: 6 }}>
          ◫ Budget Planner
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Enter your income and expenses to build your personal budget dashboard.
        </div>
      </div>

      {/* Income */}
      <div style={{ ...card, marginBottom: 16 }}>
        <label style={lbl}>Monthly Take-Home Income</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 14 }}>$</span>
          <input
            type="number" value={income} onChange={e => setIncome(e.target.value)} placeholder="0.00"
            style={{ ...inp, paddingLeft: 28, fontSize: 22, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700 }}
          />
        </div>
      </div>

      {/* Housing */}
      <div style={{ ...card, marginBottom: 16 }}>
        <label style={{ ...lbl, marginBottom: 14 }}>Housing</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Rent / Mortgage</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
              <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="0.00" style={{ ...inp, paddingLeft: 24 }} />
            </div>
          </div>
          <div>
            <label style={lbl}>Utilities</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
              <input type="number" value={utilities} onChange={e => setUtilities(e.target.value)} placeholder="0.00" style={{ ...inp, paddingLeft: 24 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Expenses */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Monthly Expenses</label>
          <button onClick={() => fileRef.current?.click()} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            ↑ Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleCSV} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {expenses.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 120px 28px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textAlign: 'right' }}>{i + 1}</span>
              <input type="text" value={row.name} onChange={e => updateRow(i, 'name', e.target.value)} placeholder="Expense name" style={inp} />
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                <input type="number" value={row.amount} onChange={e => updateRow(i, 'amount', e.target.value)} placeholder="0.00" style={{ ...inp, paddingLeft: 22 }} />
              </div>
              <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 2, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>

        <button onClick={addRow} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add expense
        </button>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Running Total</span>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            ${runningTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <button
        onClick={handleBuild}
        disabled={saving}
        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 20px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', width: '100%', opacity: saving ? 0.7 : 1 }}
      >
        {saving ? 'Saving…' : 'Build My Dashboard →'}
      </button>
    </div>
  )
}

// ─── AI Tip Banner ────────────────────────────────────────────────────────────

function AiTipBanner() {
  const [tip,     setTip]     = useState('')
  const [loading, setLoading] = useState(true)
  const [tipIdx,  setTipIdx]  = useState(0)

  const fetchTip = useCallback(async (idx) => {
    setLoading(true)
    setTip('')
    try {
      const res = await api.post('/api/budget/ai', {
        prompt: TIP_PROMPTS[idx % TIP_PROMPTS.length],
        max_tokens: 120,
      })
      setTip(res.data.text || '')
    } catch (err) {
      console.error('Tip error:', err?.response?.data || err)
      setTip('Could not load tip — check API key in Settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTip(0) }, [fetchTip])

  const nextTip = () => {
    const next = (tipIdx + 1) % TIP_PROMPTS.length
    setTipIdx(next)
    fetchTip(next)
  }

  return (
    <div style={{ ...card, marginBottom: 20, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>✦ AI Money Tip</div>
          {loading
            ? <div style={{ height: 16, background: 'rgba(99,102,241,0.1)', borderRadius: 4, width: '70%', animation: 'pulse 1.5s ease infinite' }} />
            : <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{tip}</div>
          }
        </div>
        <button onClick={nextTip} disabled={loading} style={{ flexShrink: 0, fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '5px 10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          ↺ New tip
        </button>
      </div>
    </div>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, badge }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '20px 16px' }}>
      <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)', marginBottom: 4 }}>
        ${Math.round(value).toLocaleString()}
      </div>
      {badge && (
        <div style={{ display: 'inline-block', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 99, padding: '2px 8px', marginTop: 4 }}>
          {badge.label}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────

function DashboardScreen({ budget, onEdit }) {
  const { income, rent, utilities, expenses } = budget

  const housing      = rent + utilities
  const baseExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalSpend   = housing + baseExpenses
  const leftover     = income - totalSpend
  const rating       = getRating(leftover)

  const [simValues, setSimValues] = useState(() =>
    Object.fromEntries(expenses.map((e, i) => [i, e.amount]))
  )

  // Reset sliders if budget changes (e.g. after edit)
  useEffect(() => {
    setSimValues(Object.fromEntries(expenses.map((e, i) => [i, e.amount])))
  }, [budget])

  const simTotal    = Object.values(simValues).reduce((s, v) => s + v, 0)
  const simLeftover = income - housing - simTotal
  const simRating   = getRating(simLeftover)
  const simDelta    = simLeftover - leftover

  // AI analysis — re-runs whenever budget changes
  const [analysis,  setAnalysis]  = useState('')
  const [aiLoading, setAiLoading] = useState(true)
  const [aiError,   setAiError]   = useState('')

  const buildPrompt = useCallback(() => {
    const expList = expenses.map(e => `  - ${e.name}: $${e.amount}/mo`).join('\n')
    return `You are a compassionate financial advisor. Here is someone's monthly budget:

Monthly take-home income: $${income}
Housing (rent + utilities): $${housing}
Other expenses:
${expList || '  (none listed)'}

Total spending: $${totalSpend}
Money left over: $${leftover}

Give a structured 4-part response with these exact section headers:

1. ONE THING TO CUT
Identify the single most impactful expense to reduce, name it specifically, and state the exact monthly savings if reduced by a realistic amount.

2. ONE SACRIFICE WORTH MAKING
Name one meaningful short-term sacrifice (something they might resist) that pays off significantly within 6 months.

3. ONE THING THEY'RE DOING RIGHT
Name something genuinely positive in this budget, even if small.

4. ONE 6-MONTH GOAL
Based on these exact numbers, give one concrete, achievable financial goal for the next 6 months with a target dollar amount.

Be specific and direct. Use the actual numbers from their budget. Do not give generic advice.`
  }, [income, housing, expenses, totalSpend, leftover])

  const fetchAnalysis = useCallback(async () => {
    setAiLoading(true)
    setAiError('')
    setAnalysis('')
    try {
      const res = await api.post('/api/budget/ai', {
        prompt: buildPrompt(),
        max_tokens: 700,
      })
      setAnalysis(res.data.text || '')
    } catch (err) {
      console.error('Analysis error:', err?.response?.data || err)
      setAiError('Could not generate analysis — check API key in Settings.')
    } finally {
      setAiLoading(false)
    }
  }, [buildPrompt])

  useEffect(() => { fetchAnalysis() }, [fetchAnalysis])

  // Donut segments
  const segments = []
  if (housing > 0)      segments.push({ label: 'Housing',    value: housing,    color: SEGMENT_COLORS[0] })
  expenses.forEach((e, i) => {
    if (e.amount > 0) segments.push({ label: e.name, value: e.amount, color: SEGMENT_COLORS[(i + 1) % SEGMENT_COLORS.length] })
  })

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)' }}>
        <span>◫ Tools</span>
        <span style={{ opacity: 0.4 }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Budget Planner</span>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={onEdit} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
            ← Edit Budget
          </button>
        </div>
      </div>

      {/* AI Tip */}
      <AiTipBanner />

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Take-Home"     value={income}      />
        <MetricCard label="Base Expenses" value={baseExpenses} />
        <MetricCard label="Housing"       value={housing}     />
        <MetricCard label="Left Over"     value={leftover}    badge={rating} />
      </div>

      {/* Donut + Itemized */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Spending Breakdown</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <DonutChart segments={segments} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 100 }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.label}</span>
                  <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', flexShrink: 0 }}>${seg.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Itemized Expenses</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rent > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Rent / Mortgage</span>
                <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)' }}>${rent.toLocaleString()}</span>
              </div>
            )}
            {utilities > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Utilities</span>
                <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)' }}>${utilities.toLocaleString()}</span>
              </div>
            )}
            {expenses.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.name}</span>
                <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)' }}>${e.amount.toLocaleString()}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
              <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</span>
              <span style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: 'var(--text-primary)' }}>${totalSpend.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* What-If Simulator */}
      {expenses.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
            What-If Simulator
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {expenses.map((e, i) => {
              const orig  = e.amount
              const curr  = simValues[i] ?? orig
              const saves = orig - curr
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {saves > 0.5 && (
                        <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 99, padding: '1px 7px' }}>
                          saves ${Math.round(saves)}/mo
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)', minWidth: 52, textAlign: 'right' }}>
                        ${Math.round(curr).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={Math.max(orig * 2, 1)} step={5} value={curr}
                    onChange={ev => setSimValues(s => ({ ...s, [i]: parseFloat(ev.target.value) }))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>$0</span>
                    <span>${Math.round(Math.max(orig * 2, 1)).toLocaleString()}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 24, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Simulated Leftover</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>
                ${Math.round(simLeftover).toLocaleString()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: simDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                {simDelta >= 0 ? '+' : ''}{Math.round(simDelta).toLocaleString()} vs current
              </div>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: simRating.color, border: `1px solid ${simRating.color}`, borderRadius: 99, padding: '3px 10px' }}>
                {simRating.label}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Financial Analysis */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Financial Analysis</div>
          <button onClick={fetchAnalysis} disabled={aiLoading} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', cursor: aiLoading ? 'not-allowed' : 'pointer', opacity: aiLoading ? 0.6 : 1 }}>
            {aiLoading ? '…analyzing' : '↺ Regenerate'}
          </button>
        </div>
        {aiLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
            {[80, 65, 90, 55].map((w, i) => (
              <div key={i} style={{ height: 13, background: 'rgba(99,102,241,0.08)', borderRadius: 4, width: `${w}%`, animation: 'pulse 1.5s ease infinite' }} />
            ))}
          </div>
        )}
        {!aiLoading && aiError && <div style={{ fontSize: 13, color: '#ef4444' }}>{aiError}</div>}
        {!aiLoading && analysis && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{analysis}</div>
        )}
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function BudgetPlanner() {
  const [budget,  setBudget]  = useState(null)   // null = loading, false = setup, object = dashboard
  const [screen,  setScreen]  = useState('loading')

  // On mount: try to load saved plan
  useEffect(() => {
    api.get('/api/budget/plan')
      .then(res => {
        if (res.data.exists) {
          setBudget(res.data.plan)
          setScreen('dashboard')
        } else {
          setScreen('setup')
        }
      })
      .catch(() => setScreen('setup'))
  }, [])

  const handleDone = (plan) => {
    setBudget(plan)
    setScreen('dashboard')
  }

  const handleEdit = () => {
    setScreen('setup')
  }

  if (screen === 'loading') {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    )
  }

  if (screen === 'setup') {
    return <SetupScreen onDone={handleDone} initialData={budget} />
  }

  return <DashboardScreen budget={budget} onEdit={handleEdit} />
}
