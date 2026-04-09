import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const SEGMENT_COLORS = [
  '#6366f1', '#8b5cf6', '#f59e0b', '#22c55e',
  '#ec4899', '#06b6d4', '#f97316', '#a3e635',
]

const QUICK_ADD_TEMPLATES = [
  { category: 'Streaming', items: [
    { name: 'Netflix',          amount: '17'  },
    { name: 'Spotify',          amount: '11'  },
    { name: 'Hulu',             amount: '18'  },
    { name: 'Disney+',          amount: '14'  },
    { name: 'HBO Max',          amount: '16'  },
    { name: 'Apple TV+',        amount: '10'  },
    { name: 'YouTube Premium',  amount: '14'  },
    { name: 'Amazon Prime',     amount: '15'  },
  ]},
  { category: 'Food', items: [
    { name: 'Groceries',          amount: '400' },
    { name: 'Dining Out',         amount: '200' },
    { name: 'Coffee',             amount: '60'  },
    { name: 'Takeout / Delivery', amount: '100' },
  ]},
  { category: 'Transport', items: [
    { name: 'Gas',            amount: '150' },
    { name: 'Car Insurance',  amount: '120' },
    { name: 'Car Payment',    amount: '400' },
    { name: 'Public Transit', amount: '80'  },
    { name: 'Uber / Lyft',   amount: '60'  },
    { name: 'Parking',        amount: '50'  },
  ]},
  { category: 'Health', items: [
    { name: 'Gym Membership',   amount: '40'  },
    { name: 'Health Insurance', amount: '200' },
    { name: 'Prescriptions',    amount: '50'  },
    { name: 'Therapy',          amount: '150' },
  ]},
  { category: 'Tech', items: [
    { name: 'Phone Bill',          amount: '70' },
    { name: 'Internet',            amount: '60' },
    { name: 'iCloud / Google One', amount: '3'  },
    { name: 'Adobe CC',            amount: '55' },
  ]},
  { category: 'Personal', items: [
    { name: 'Haircut',       amount: '30'  },
    { name: 'Clothing',      amount: '100' },
    { name: 'Personal Care', amount: '50'  },
  ]},
  { category: 'Savings & Debt', items: [
    { name: 'Credit Card Payment', amount: '200' },
    { name: 'Student Loans',       amount: '300' },
    { name: 'Emergency Fund',      amount: '100' },
    { name: 'Retirement (401k)',   amount: '200' },
  ]},
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

// ─── Mini Markdown Renderer ───────────────────────────────────────────────────

function MiniMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div>
      {lines.map((line, i) => {
        // ## Heading
        if (line.startsWith('## ')) {
          const content = line.slice(3)
          return (
            <div key={i} style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginTop: i === 0 ? 0 : 20, marginBottom: 6 }}>
              {renderInline(content)}
            </div>
          )
        }
        // blank line → spacer
        if (line.trim() === '') return <div key={i} style={{ height: 6 }} />
        // normal paragraph line
        return (
          <div key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
            {renderInline(line)}
          </div>
        )
      })}
    </div>
  )
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      : p
  )
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
  const [hovered, setHovered] = useState(null)

  const size   = 240
  const cx     = size / 2
  const cy     = size / 2
  const r      = 88
  const stroke = 32
  const circum = 2 * Math.PI * r
  const total  = segments.reduce((s, x) => s + x.value, 0) || 1

  let offset = 0
  const arcs = segments.map((seg) => {
    const pct  = seg.value / total
    const dash = pct * circum
    const gap  = circum - dash
    const arc  = { ...seg, dash, gap, offset: offset * circum, pct }
    offset += pct
    return arc
  })

  const h = hovered !== null ? arcs[hovered] : null
  const shortLabel = h ? (h.label.length > 13 ? h.label.slice(0, 12) + '\u2026' : h.label) : ''

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size} height={size}
      style={{ display: 'block', cursor: 'default' }}
      onMouseLeave={() => setHovered(null)}
    >
      {/* Track ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth={stroke} />

      {/* Segments */}
      {arcs.map((arc, i) => (
        <circle
          key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={arc.color}
          strokeWidth={hovered === i ? stroke + 7 : stroke}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset + circum / 4}
          strokeLinecap="butt"
          style={{
            transition: 'stroke-width 0.12s ease, opacity 0.12s ease',
            cursor: 'pointer',
            opacity: hovered !== null && hovered !== i ? 0.35 : 1,
          }}
          onMouseEnter={() => setHovered(i)}
        />
      ))}

      {/* Center text — switches to hovered segment info */}
      {h ? (
        <>
          <text x={cx} y={cy - 16} textAnchor="middle"
            fill={h.color} fontSize="11"
            fontFamily="IBM Plex Mono, monospace" fontWeight="600"
            style={{ pointerEvents: 'none' }}>
            {shortLabel}
          </text>
          <text x={cx} y={cy + 6} textAnchor="middle"
            fill="var(--text-primary)" fontSize="21"
            fontFamily="IBM Plex Mono, monospace" fontWeight="700"
            style={{ pointerEvents: 'none' }}>
            ${h.value.toLocaleString()}
          </text>
          <text x={cx} y={cy + 23} textAnchor="middle"
            fill="var(--text-muted)" fontSize="10"
            fontFamily="IBM Plex Mono, monospace"
            style={{ pointerEvents: 'none' }}>
            {Math.round(h.pct * 100)}% of total
          </text>
        </>
      ) : (
        <>
          <text x={cx} y={cy - 6} textAnchor="middle"
            fill="var(--text-primary)" fontSize="22"
            fontFamily="IBM Plex Mono, monospace" fontWeight="700"
            style={{ pointerEvents: 'none' }}>
            ${total.toLocaleString()}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle"
            fill="var(--text-muted)" fontSize="10"
            fontFamily="IBM Plex Mono, monospace" letterSpacing="0.08em"
            style={{ pointerEvents: 'none' }}>
            TOTAL/MO
          </text>
        </>
      )}
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

  const [showTemplates, setShowTemplates] = useState(false)
  const [templateCat,   setTemplateCat]   = useState(QUICK_ADD_TEMPLATES[0].category)

  const addTemplate = (item) => {
    const alreadyAdded = expenses.some(e => e.name.trim().toLowerCase() === item.name.toLowerCase())
    if (alreadyAdded) return
    setExpenses(prev => {
      const blankIdx = prev.findIndex(r => !r.name.trim())
      if (blankIdx !== -1) {
        return prev.map((r, i) => i === blankIdx ? { name: item.name, amount: item.amount } : r)
      }
      return [...prev, { name: item.name, amount: item.amount }]
    })
  }

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

        {/* Quick-add templates */}
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => setShowTemplates(s => !s)}
            style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', marginBottom: showTemplates ? 12 : 0 }}
          >
            {showTemplates ? '▾ Hide quick-add' : '▸ Quick-add common expenses'}
          </button>

          {showTemplates && (
            <div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {QUICK_ADD_TEMPLATES.map(({ category }) => (
                  <button
                    key={category}
                    onClick={() => setTemplateCat(category)}
                    style={{
                      fontSize: 10, fontFamily: 'IBM Plex Mono, monospace',
                      color: templateCat === category ? '#fff' : 'var(--text-muted)',
                      background: templateCat === category ? 'var(--accent)' : 'transparent',
                      border: '1px solid ' + (templateCat === category ? 'var(--accent)' : 'var(--border)'),
                      borderRadius: 99, padding: '3px 10px', cursor: 'pointer',
                    }}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(QUICK_ADD_TEMPLATES.find(t => t.category === templateCat)?.items || []).map(item => {
                  const added = expenses.some(e => e.name.trim().toLowerCase() === item.name.toLowerCase())
                  return (
                    <button
                      key={item.name}
                      onClick={() => addTemplate(item)}
                      disabled={added}
                      title={added ? 'Already added' : 'Add ' + item.name + ' — $' + item.amount + '/mo'}
                      style={{
                        fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
                        color: added ? 'var(--text-muted)' : 'var(--text-secondary)',
                        background: 'var(--bg-base)',
                        border: '1px solid var(--border)',
                        borderRadius: 8, padding: '5px 10px',
                        cursor: added ? 'default' : 'pointer',
                        opacity: added ? 0.4 : 1,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span>{item.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>${item.amount}</span>
                      {added && <span style={{ fontSize: 9 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
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

function DashboardScreen({ budget, onEdit, onReset, onUpdate, onCompare }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(null)
  const [saving,  setSaving]  = useState(false)

  // Use draft values while editing so widgets update live
  const active = (editing && draft) ? draft : budget
  const { income, rent, utilities, expenses } = active

  const housing      = rent + utilities
  const baseExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalSpend   = housing + baseExpenses
  const leftover     = income - totalSpend
  const rating       = getRating(leftover)

  // ── Edit mode handlers ────────────────────────────────────────────────────
  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(budget)))
    setEditing(true)
  }
  const cancelEdit = () => { setEditing(false); setDraft(null) }
  const saveEdit   = async () => {
    setSaving(true)
    try {
      await api.post('/api/budget/plan', draft)
      onUpdate(draft)
      setEditing(false)
      setDraft(null)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // Draft mutation helpers
  const draftSet       = (field, val) =>
    setDraft(d => ({ ...d, [field]: parseFloat(val) || 0 }))
  const draftUpdateExp = (i, field, val) =>
    setDraft(d => ({ ...d, expenses: d.expenses.map((e, idx) =>
      idx === i ? { ...e, [field]: field === 'amount' ? (parseFloat(val) || 0) : val } : e
    )}))
  const draftAddExp    = () =>
    setDraft(d => ({ ...d, expenses: [...d.expenses, { name: '', amount: 0 }] }))
  const draftRemoveExp = (i) =>
    setDraft(d => ({ ...d, expenses: d.expenses.filter((_, idx) => idx !== i) }))

  const [showDashTemplates, setShowDashTemplates] = useState(false)
  const [dashTemplateCat,   setDashTemplateCat]   = useState(QUICK_ADD_TEMPLATES[0].category)

  const addDraftTemplate = (item) => {
    setDraft(d => {
      if (!d) return d
      const alreadyAdded = d.expenses.some(e => e.name.trim().toLowerCase() === item.name.toLowerCase())
      if (alreadyAdded) return d
      const blankIdx = d.expenses.findIndex(e => !e.name.trim())
      if (blankIdx !== -1) {
        return { ...d, expenses: d.expenses.map((e, i) => i === blankIdx ? { name: item.name, amount: parseFloat(item.amount) || 0 } : e) }
      }
      return { ...d, expenses: [...d.expenses, { name: item.name, amount: parseFloat(item.amount) || 0 }] }
    })
  }

  // ── What-if simulator ─────────────────────────────────────────────────────
  const [simValues, setSimValues] = useState(() =>
    Object.fromEntries(expenses.map((e, i) => [i, e.amount]))
  )
  useEffect(() => {
    setSimValues(Object.fromEntries(expenses.map((e, i) => [i, e.amount])))
  }, [budget])

  const simTotal    = Object.values(simValues).reduce((s, v) => s + v, 0)
  const simLeftover = income - housing - simTotal
  const simRating   = getRating(simLeftover)
  const simDelta    = simLeftover - leftover

  // ── AI analysis ───────────────────────────────────────────────────────────
  const [analysis,  setAnalysis]  = useState('')
  const [aiLoading, setAiLoading] = useState(false)
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
    setAiLoading(true); setAiError(''); setAnalysis('')
    try {
      const res = await api.post('/api/budget/ai', { prompt: buildPrompt(), max_tokens: 700 })
      setAnalysis(res.data.text || '')
    } catch (err) {
      console.error('Analysis error:', err?.response?.data || err)
      setAiError('Could not generate analysis — check API key in Settings.')
    } finally { setAiLoading(false) }
  }, [buildPrompt])

  // ── Donut segments (live from active budget) ───────────────────────────────
  const segments = []
  if (housing > 0) segments.push({ label: 'Housing', value: housing, color: SEGMENT_COLORS[0] })
  expenses.forEach((e, i) => {
    if (e.amount > 0) segments.push({ label: e.name, value: e.amount, color: SEGMENT_COLORS[(i + 1) % SEGMENT_COLORS.length] })
  })

  // ── Shared edit-panel input style ──────────────────────────────────────────
  const editInp = {
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12,
    fontFamily: 'IBM Plex Mono, monospace', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)' }}>
        <span>◫ Tools</span>
        <span style={{ opacity: 0.4 }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Budget Planner</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={cancelEdit} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '4px 14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : '✓ Save Changes'}
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                ✎ Edit Budget
              </button>

              <button onClick={onReset} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#ef4444', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                ✕ Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Inline Edit Panel ─────────────────────────────────────────────── */}
      {editing && draft && (
        <div style={{ ...card, marginBottom: 20, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.04)' }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            ✎ Editing Budget
          </div>

          {/* Income + Housing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
            {[
              { label: 'Monthly Income',  field: 'income'    },
              { label: 'Rent / Mortgage', field: 'rent'      },
              { label: 'Utilities',       field: 'utilities' },
            ].map(({ label, field }) => (
              <div key={field}>
                <div style={lbl}>{label}</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>$</span>
                  <input
                    type="number"
                    value={draft[field]}
                    onChange={e => draftSet(field, e.target.value)}
                    style={{ ...editInp, paddingLeft: 20 }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Expenses rows */}
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Other Expenses
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {draft.expenses.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 24px', gap: 8, alignItems: 'center' }}>
                <input
                  type="text" value={e.name} placeholder="Expense name"
                  onChange={ev => draftUpdateExp(i, 'name', ev.target.value)}
                  style={editInp}
                />
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace' }}>$</span>
                  <input
                    type="number" value={e.amount} placeholder="0"
                    onChange={ev => draftUpdateExp(i, 'amount', ev.target.value)}
                    style={{ ...editInp, paddingLeft: 20 }}
                  />
                </div>
                <button onClick={() => draftRemoveExp(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, textAlign: 'center' }}>✕</button>
              </div>
            ))}
          </div>
          <button onClick={draftAddExp} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add expense
          </button>

          {/* Quick-add templates in edit panel */}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => setShowDashTemplates(s => !s)}
              style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', marginBottom: showDashTemplates ? 10 : 0 }}
            >
              {showDashTemplates ? '▾ Hide quick-add' : '▸ Quick-add common expenses'}
            </button>
            {showDashTemplates && (
              <div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                  {QUICK_ADD_TEMPLATES.map(({ category }) => (
                    <button
                      key={category}
                      onClick={() => setDashTemplateCat(category)}
                      style={{
                        fontSize: 10, fontFamily: 'IBM Plex Mono, monospace',
                        color: dashTemplateCat === category ? '#fff' : 'var(--text-muted)',
                        background: dashTemplateCat === category ? 'var(--accent)' : 'transparent',
                        border: '1px solid ' + (dashTemplateCat === category ? 'var(--accent)' : 'var(--border)'),
                        borderRadius: 99, padding: '2px 8px', cursor: 'pointer',
                      }}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(QUICK_ADD_TEMPLATES.find(t => t.category === dashTemplateCat)?.items || []).map(item => {
                    const added = draft.expenses.some(e => e.name.trim().toLowerCase() === item.name.toLowerCase())
                    return (
                      <button
                        key={item.name}
                        onClick={() => addDraftTemplate(item)}
                        disabled={added}
                        title={added ? 'Already added' : 'Add ' + item.name + ' — $' + item.amount + '/mo'}
                        style={{
                          fontSize: 11, fontFamily: 'IBM Plex Mono, monospace',
                          color: added ? 'var(--text-muted)' : 'var(--text-secondary)',
                          background: 'var(--bg-base)',
                          border: '1px solid var(--border)',
                          borderRadius: 8, padding: '4px 9px',
                          cursor: added ? 'default' : 'pointer',
                          opacity: added ? 0.4 : 1,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <span>{item.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>${item.amount}</span>
                        {added && <span style={{ fontSize: 9 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI Tip ───────────────────────────────────────────────────────────── */}
      <AiTipBanner />

      {/* ── Metric Cards (update live from active budget) ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Take-Home"     value={income}       />
        <MetricCard label="Base Expenses" value={baseExpenses}  />
        <MetricCard label="Housing"       value={housing}      />
        <MetricCard label="Left Over"     value={leftover}     badge={rating} />
      </div>

      {/* ── Donut + Itemized ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Spending Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <DonutChart segments={segments} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', width: '100%' }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
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

      {/* ── What-If Simulator ─────────────────────────────────────────────── */}
      {expenses.length > 0 && (
        <div style={{ ...card, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>
            What-If Simulator
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {expenses.map((e, i) => {
              const orig      = e.amount
              const curr      = simValues[i] ?? orig
              const saves     = orig - curr
              const sliderMax = Math.max(orig * 3, 500)
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
                      {/* Editable number input — type any value beyond slider range */}
                      <input
                        type="number"
                        value={Math.round(curr)}
                        min={0}
                        onChange={ev => setSimValues(s => ({ ...s, [i]: parseFloat(ev.target.value) || 0 }))}
                        style={{ width: 76, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 8px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', outline: 'none', textAlign: 'right' }}
                      />
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={sliderMax} step={5} value={Math.min(curr, sliderMax)}
                    onChange={ev => setSimValues(s => ({ ...s, [i]: parseFloat(ev.target.value) }))}
                    style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>$0</span>
                    <span>${Math.round(sliderMax).toLocaleString()} (slide) — or type any value above ↑</span>
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

      {/* ── AI Financial Analysis ─────────────────────────────────────────── */}
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
        {!aiLoading && !analysis && !aiError && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontFamily: 'IBM Plex Mono, monospace' }}>
            Click <strong style={{ color: 'var(--accent)' }}>↺ Regenerate</strong> to generate your AI financial analysis.
          </div>
        )}
        {!aiLoading && analysis && <MiniMarkdown text={analysis} />}
      </div>

      {/* ── Scenario Comparison Entry ── */}
      <div
        onClick={onCompare}
        style={{
          marginTop: 20,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(245,158,11,0.07) 100%)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 16,
          padding: '22px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'}
      >
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⇄</span>
            Scenario Comparison
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 440 }}>
            Build two financial scenarios side-by-side, adjust every variable independently, and see exactly how the numbers compare. Save snapshots and export to PDF.
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 600, letterSpacing: '0.04em' }}>
            Launch →
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Scenario Panel (controlled) ─────────────────────────────────────────────────────────────────

function ScenarioPanel({
  budget, label, onLabelChange,
  income, onIncomeChange, rent, onRentChange, utilities, onUtilitiesChange,
  expVals, onExpValsChange, accentColor,
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [tempLabel,    setTempLabel]    = useState(label)

  const commitLabel = () => {
    onLabelChange(tempLabel || 'Untitled Scenario')
    setEditingLabel(false)
  }

  const housing    = (parseFloat(rent) || 0) + (parseFloat(utilities) || 0)
  const simTotal   = Object.values(expVals).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const totalSpend = housing + simTotal
  const inc        = parseFloat(income) || 0
  const leftover   = inc - totalSpend
  const rating     = getRating(leftover)

  const segments = []
  if (housing > 0) segments.push({ label: 'Housing', value: housing, color: SEGMENT_COLORS[0] })
  budget.expenses.forEach((e, i) => {
    const v = parseFloat(expVals[i]) || 0
    if (v > 0) segments.push({ label: e.name, value: v, color: SEGMENT_COLORS[(i + 1) % SEGMENT_COLORS.length] })
  })

  const numInp = {
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6,
    padding: '5px 8px', color: 'var(--text-primary)', fontSize: 12,
    fontFamily: 'IBM Plex Mono, monospace', outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Click-to-edit label ── */}
      {editingLabel ? (
        <input
          autoFocus
          value={tempLabel}
          onChange={e => setTempLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={e => { if (e.key === 'Enter') commitLabel() }}
          placeholder="Name this scenario…"
          style={{
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${accentColor}`,
            color: 'var(--text-primary)', fontSize: 17,
            fontFamily: 'Syne, sans-serif', fontWeight: 800,
            padding: '4px 0', outline: 'none', width: '100%',
          }}
        />
      ) : (
        <div
          onClick={() => { setTempLabel(label); setEditingLabel(true) }}
          title="Click to rename"
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'text', borderBottom: `2px solid ${accentColor}`, paddingBottom: 6 }}
        >
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 17, color: 'var(--text-primary)', flex: 1 }}>
            {label || <span style={{ color: 'var(--text-muted)' }}>Click to name this scenario</span>}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>✎ rename</span>
        </div>
      )}

      {/* ── Donut ── */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DonutChart segments={segments} />
      </div>

      {/* ── Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { lbl: 'Income',    val: inc,        accent: null        },
          { lbl: 'Spend',     val: totalSpend,  accent: null        },
          { lbl: 'Housing',   val: housing,     accent: null        },
          { lbl: 'Left Over', val: leftover,    accent: rating.color, badge: rating.label },
        ].map(({ lbl, val, accent, badge }) => (
          <div key={lbl} style={{ background: 'var(--bg-base)', border: `1px solid ${badge ? accent + '55' : 'var(--border)'}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{lbl}</div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 15, color: accent || 'var(--text-primary)' }}>
              {val < 0 ? '-' : ''}${Math.abs(Math.round(val)).toLocaleString()}
            </div>
            {badge && (
              <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: accent, border: `1px solid ${accent}`, borderRadius: 99, padding: '1px 7px', display: 'inline-block', marginTop: 3 }}>
                {badge}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Income & Housing inputs ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Income & Housing</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { lbl: 'Income',    val: income,    set: onIncomeChange    },
            { lbl: 'Rent',      val: rent,      set: onRentChange      },
            { lbl: 'Utilities', val: utilities, set: onUtilitiesChange },
          ].map(({ lbl, val, set }) => (
            <div key={lbl}>
              <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{lbl}</div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' }}>$</span>
                <input type="number" value={val} onChange={e => set(e.target.value)} style={{ ...numInp, paddingLeft: 18 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Expense sliders ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Expenses</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {budget.expenses.map((e, i) => {
            const orig      = e.amount
            const curr      = parseFloat(expVals[i]) || 0
            const delta     = curr - orig
            const sliderMax = Math.max(orig * 3, 500)
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 6 }}>{e.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {Math.abs(delta) > 0.5 && (
                      <span style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: delta < 0 ? '#22c55e' : '#ef4444', background: delta < 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${delta < 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, borderRadius: 99, padding: '1px 6px' }}>
                        {delta > 0 ? '+' : ''}{Math.round(delta)}
                      </span>
                    )}
                    <input
                      type="number" value={Math.round(curr)} min={0}
                      onChange={ev => onExpValsChange(s => ({ ...s, [i]: parseFloat(ev.target.value) || 0 }))}
                      style={{ width: 62, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 6px', color: 'var(--text-primary)', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', outline: 'none', textAlign: 'right' }}
                    />
                  </div>
                </div>
                <input
                  type="range" min={0} max={sliderMax} step={5}
                  value={Math.min(curr, sliderMax)}
                  onChange={ev => onExpValsChange(s => ({ ...s, [i]: parseFloat(ev.target.value) }))}
                  style={{ width: '100%', accentColor, cursor: 'pointer' }}
                />
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

// ─── Comparison Screen ─────────────────────────────────────────────────────────────────────────

function ComparisonScreen({ budget, onBack }) {
  const [tab, setTab] = useState('compare')

  // ── Lifted scenario A state ──
  const [labelA,     setLabelA]     = useState('Scenario A')
  const [incomeA,    setIncomeA]    = useState(budget.income)
  const [rentA,      setRentA]      = useState(budget.rent)
  const [utilitiesA, setUtilitiesA] = useState(budget.utilities)
  const [expValsA,   setExpValsA]   = useState(() =>
    Object.fromEntries(budget.expenses.map((e, i) => [i, e.amount]))
  )

  // ── Lifted scenario B state ──
  const [labelB,     setLabelB]     = useState('Scenario B')
  const [incomeB,    setIncomeB]    = useState(budget.income)
  const [rentB,      setRentB]      = useState(budget.rent)
  const [utilitiesB, setUtilitiesB] = useState(budget.utilities)
  const [expValsB,   setExpValsB]   = useState(() =>
    Object.fromEntries(budget.expenses.map((e, i) => [i, e.amount]))
  )

  // ── Save / export state ──
  const [saveName,    setSaveName]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveMsg,     setSaveMsg]     = useState('')
  const [pdfLoading,  setPdfLoading]  = useState(false)

  // ── History state ──
  const [history,     setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(true)

  const buildPayload = () => ({
    name:       saveName.trim() || `Comparison — ${new Date().toLocaleDateString()}`,
    label_a:    labelA,
    label_b:    labelB,
    scenario_a: {
      income:    parseFloat(incomeA)    || 0,
      rent:      parseFloat(rentA)      || 0,
      utilities: parseFloat(utilitiesA) || 0,
      expenses:  budget.expenses.map((e, i) => ({ name: e.name, amount: parseFloat(expValsA[i]) || 0 })),
    },
    scenario_b: {
      income:    parseFloat(incomeB)    || 0,
      rent:      parseFloat(rentB)      || 0,
      utilities: parseFloat(utilitiesB) || 0,
      expenses:  budget.expenses.map((e, i) => ({ name: e.name, amount: parseFloat(expValsB[i]) || 0 })),
    },
  })

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    try {
      const res = await api.get('/api/budget/comparisons')
      setHistory(res.data.comparisons || [])
    } catch (err) {
      console.error('History load failed:', err)
    } finally {
      setHistLoading(false)
    }
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  const saveComparison = async () => {
    setSaving(true); setSaveMsg('')
    try {
      await api.post('/api/budget/comparisons', buildPayload())
      setSaveMsg('Saved!')
      setSaveName('')
      loadHistory()
      setTimeout(() => setSaveMsg(''), 2500)
    } catch (err) {
      console.error('Save failed:', err)
      setSaveMsg('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const exportPDF = async (payload) => {
    setPdfLoading(true)
    try {
      const res = await api.post('/api/budget/comparisons/pdf', payload, { responseType: 'blob' })
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${(payload.name || 'comparison').replace(/\s+/g, '_').toLowerCase()}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF failed:', err)
    } finally {
      setPdfLoading(false)
    }
  }

  const loadComparison = (comp) => {
    setLabelA(comp.label_a); setLabelB(comp.label_b)
    setIncomeA(comp.scenario_a.income);    setIncomeB(comp.scenario_b.income)
    setRentA(comp.scenario_a.rent);        setRentB(comp.scenario_b.rent)
    setUtilitiesA(comp.scenario_a.utilities); setUtilitiesB(comp.scenario_b.utilities)
    setExpValsA(Object.fromEntries((comp.scenario_a.expenses || []).map((e, i) => [i, e.amount])))
    setExpValsB(Object.fromEntries((comp.scenario_b.expenses || []).map((e, i) => [i, e.amount])))
    setTab('compare')
  }

  const deleteComparison = async (id) => {
    if (!window.confirm('Delete this comparison?')) return
    try {
      await api.delete(`/api/budget/comparisons/${id}`)
      setHistory(h => h.filter(c => c.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // ── Computed values for delta summary ──
  const housingA   = (parseFloat(rentA) || 0) + (parseFloat(utilitiesA) || 0)
  const expTotalA  = Object.values(expValsA).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const spendA     = housingA + expTotalA
  const leftoverA  = (parseFloat(incomeA) || 0) - spendA

  const housingB   = (parseFloat(rentB) || 0) + (parseFloat(utilitiesB) || 0)
  const expTotalB  = Object.values(expValsB).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const spendB     = housingB + expTotalB
  const leftoverB  = (parseFloat(incomeB) || 0) - spendB

  const monthlyDelta = leftoverB - leftoverA
  const annualDelta  = monthlyDelta * 12
  const fiveYrDelta  = monthlyDelta * 60
  const winner       = Math.abs(monthlyDelta) < 1 ? null : monthlyDelta > 0 ? labelB : labelA
  const winnerColor  = monthlyDelta > 0 ? '#f59e0b' : '#6366f1'

  const tabBtn = (key, label) => (
    <button
      key={key} onClick={() => setTab(key)}
      style={{
        fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.08em', padding: '9px 22px', border: 'none', background: 'transparent',
        color: tab === key ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
        borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'color 0.15s',
      }}>
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 8px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          ← Dashboard
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)' }}>
            Scenario Comparison
          </div>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', marginTop: 3 }}>
            Adjust each side independently — click any label to rename it
          </div>
        </div>
        {/* Save row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Name this comparison…"
            style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', outline: 'none', width: 200 }}
          />
          <button onClick={saveComparison} disabled={saving} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, whiteSpace: 'nowrap' }}>
            {saving ? 'Saving…' : saveMsg || '✓ Save'}
          </button>
          <button onClick={() => exportPDF(buildPayload())} disabled={pdfLoading} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', cursor: pdfLoading ? 'not-allowed' : 'pointer', opacity: pdfLoading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {pdfLoading ? 'Generating…' : '↓ PDF'}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {tabBtn('compare', '⇄ Compare')}
        {tabBtn('history', '⧖ History' + (history.length > 0 ? ' (' + history.length + ')' : ''))}
      </div>

      {/* ── Compare tab ── */}
      {tab === 'compare' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Panels */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 0, alignItems: 'start' }}>
            <div style={{ paddingRight: 28 }}>
              <ScenarioPanel
                budget={budget}
                label={labelA}           onLabelChange={setLabelA}
                income={incomeA}         onIncomeChange={setIncomeA}
                rent={rentA}             onRentChange={setRentA}
                utilities={utilitiesA}   onUtilitiesChange={setUtilitiesA}
                expVals={expValsA}       onExpValsChange={setExpValsA}
                accentColor="#6366f1"
              />
            </div>
            <div style={{ background: 'var(--border)', alignSelf: 'stretch', minHeight: 200 }} />
            <div style={{ paddingLeft: 28 }}>
              <ScenarioPanel
                budget={budget}
                label={labelB}           onLabelChange={setLabelB}
                income={incomeB}         onIncomeChange={setIncomeB}
                rent={rentB}             onRentChange={setRentB}
                utilities={utilitiesB}   onUtilitiesChange={setUtilitiesB}
                expVals={expValsB}       onExpValsChange={setExpValsB}
                accentColor="#f59e0b"
              />
            </div>
          </div>

          {/* ── Delta Summary ── */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>

            {/* Verdict banner */}
            <div style={{ background: winner ? `${winnerColor}14` : 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                  Scenario Breakdown
                </div>
                {winner ? (
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)' }}>
                    <span style={{ color: winnerColor }}>{winner}</span> leaves you{' '}
                    <span style={{ color: winnerColor }}>${Math.abs(Math.round(monthlyDelta)).toLocaleString()}/mo more</span>
                  </div>
                ) : (
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 20, color: 'var(--text-muted)' }}>
                    Both scenarios are financially identical
                  </div>
                )}
              </div>
              {winner && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Monthly',   value: monthlyDelta },
                    { label: 'Annually',  value: annualDelta  },
                    { label: '5-Year',    value: fiveYrDelta  },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: 'center', background: 'var(--bg-base)', border: `1px solid ${winnerColor}33`, borderRadius: 10, padding: '10px 16px' }}>
                      <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: 16, color: winnerColor }}>
                        {value >= 0 ? '+' : '-'}${Math.abs(Math.round(value)).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Line-by-line comparison table */}
            <div style={{ padding: '0 28px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px', gap: 0 }}>

                {/* Table header */}
                {['', labelA, labelB, 'Difference'].map((h, i) => (
                  <div key={i} style={{ fontSize: 9, fontFamily: 'IBM Plex Mono, monospace', color: i === 1 ? '#6366f1' : i === 2 ? '#f59e0b' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 8px 8px', textAlign: i > 0 ? 'right' : 'left', borderBottom: '1px solid var(--border)' }}>
                    {h}
                  </div>
                ))}

                {/* Rows */}
                {[
                  { label: 'Income',        a: parseFloat(incomeA) || 0,    b: parseFloat(incomeB) || 0    },
                  { label: 'Rent',          a: parseFloat(rentA) || 0,      b: parseFloat(rentB) || 0,     expense: true },
                  { label: 'Utilities',     a: parseFloat(utilitiesA) || 0, b: parseFloat(utilitiesB) || 0, expense: true },
                  ...budget.expenses.map((e, i) => ({
                    label: e.name,
                    a: parseFloat(expValsA[i]) || 0,
                    b: parseFloat(expValsB[i]) || 0,
                    expense: true,
                  })),
                  { label: 'Total Spend',   a: spendA,    b: spendB,    bold: true, expense: true },
                  { label: 'Left Over',     a: leftoverA, b: leftoverB, bold: true },
                ].map(({ label, a, b, bold, expense }, idx) => {
                  const diff     = b - a
                  // For expenses, positive diff is bad (spending more); for income/leftover, positive is good
                  const goodDiff = expense ? diff < -0.5 : diff > 0.5
                  const badDiff  = expense ? diff > 0.5  : diff < -0.5
                  const diffColor = goodDiff ? '#22c55e' : badDiff ? '#ef4444' : 'var(--text-muted)'
                  const rowBg    = idx % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.03)'
                  return [
                    <div key={`l${idx}`} style={{ fontSize: 11, color: bold ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: bold ? 700 : 400, fontFamily: bold ? 'IBM Plex Mono, monospace' : 'inherit', padding: '9px 8px', background: rowBg, borderBottom: '1px solid var(--border)' }}>{label}</div>,
                    <div key={`a${idx}`} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)', textAlign: 'right', padding: '9px 8px', background: rowBg, borderBottom: '1px solid var(--border)' }}>${Math.round(a).toLocaleString()}</div>,
                    <div key={`b${idx}`} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-primary)', textAlign: 'right', padding: '9px 8px', background: rowBg, borderBottom: '1px solid var(--border)' }}>${Math.round(b).toLocaleString()}</div>,
                    <div key={`d${idx}`} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: Math.abs(diff) < 0.5 ? 'var(--text-muted)' : diffColor, textAlign: 'right', padding: '9px 8px', background: rowBg, borderBottom: '1px solid var(--border)', fontWeight: bold ? 700 : 400 }}>
                      {Math.abs(diff) < 0.5 ? '—' : `${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString()}`}
                    </div>,
                  ]
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div>
          {histLoading && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}>
              Loading history…
            </div>
          )}
          {!histLoading && history.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>⧖</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>No saved comparisons yet.</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                Head to the <strong style={{ color: 'var(--accent)' }}>⇄ Compare</strong> tab, set up your scenarios, and save one.
              </div>
            </div>
          )}
          {!histLoading && history.map(comp => (
            <div key={comp.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 5 }}>
                  {comp.name}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)' }}>
                  <span style={{ color: '#6366f1', fontWeight: 600 }}>{comp.label_a}</span>
                  <span style={{ margin: '0 8px', opacity: 0.4 }}>vs</span>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>{comp.label_b}</span>
                  <span style={{ marginLeft: 16, opacity: 0.5 }}>
                    {new Date(comp.created_at + (comp.created_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => loadComparison(comp)} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                  ⮡ Load
                </button>
                <button onClick={() => exportPDF(comp)} disabled={pdfLoading} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                  ↓ PDF
                </button>
                <button onClick={() => deleteComparison(comp.id)} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono, monospace', color: '#ef4444', background: 'transparent', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

  const handleCompare = () => {
    setScreen('compare')
  }

  const handleUpdate = (plan) => {
    setBudget(plan)
  }

  const handleReset = async () => {
    if (!window.confirm('Reset your budget? This will clear all your data so you can start fresh.')) return
    try {
      await api.delete('/api/budget/plan')
    } catch (err) {
      console.error('Reset failed:', err)
    }
    setBudget(null)
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

  if (screen === 'compare') {
    return <ComparisonScreen budget={budget} onBack={() => setScreen('dashboard')} />
  }

  return <DashboardScreen budget={budget} onEdit={handleEdit} onReset={handleReset} onUpdate={handleUpdate} onCompare={handleCompare} />
}
