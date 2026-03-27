import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const CATEGORIES = [
  { key: 'childcare',       label: 'Childcare',      icon: '◎' },
  { key: 'chores',          label: 'Chores',          icon: '⬡' },
  { key: 'emotional_labor', label: 'Emotional Labor', icon: '〜' },
  { key: 'finances',        label: 'Finances',        icon: '◈' },
  { key: 'logistics',       label: 'Logistics',       icon: '▷' },
]
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))

function whoLabel(who, myName, partnerName, member3Name) {
  if (who === 'me')      return myName
  if (who === 'partner') return partnerName
  if (who === 'member3') return member3Name || 'Member 3'
  return who
}

function whoColor(who) {
  if (who === 'me')      return 'var(--accent)'
  if (who === 'partner') return 'var(--text-muted)'
  if (who === 'member3') return '#8b5cf6'
  return 'var(--text-muted)'
}

// ── Setup screen ──────────────────────────────────────────────────────────────
const RELATIONSHIP_OPTIONS = ['Partner', 'Co-parent', 'Spouse', 'Child', 'Roommate', 'Sibling', 'Other']

function SetupScreen({ onSaved }) {
  const [myName, setMyName] = useState('Me')
  const [others, setOthers] = useState([])  // [{name, relationship}]
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const MAX_OTHERS = 2

  function addPerson() {
    if (others.length >= MAX_OTHERS) return
    setOthers(o => [...o, { name: '', relationship: '' }])
  }

  function removePerson(i) {
    setOthers(o => o.filter((_, idx) => idx !== i))
  }

  function updatePerson(i, field, val) {
    setOthers(o => o.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
    setErr('')
  }

  async function handleSave() {
    if (!others[0]?.name.trim()) { setErr('Add at least one other person'); return }
    setSaving(true)
    try {
      await api.post('/api/fairness/config', {
        my_name:              myName.trim() || 'Me',
        partner_name:         others[0]?.name.trim() || '',
        partner_relationship: others[0]?.relationship || null,
        member3_name:         others[1]?.name.trim() || null,
        member3_relationship: others[1]?.relationship || null,
      })
      onSaved()
    } catch {
      setErr('Failed to save. Try again.')
    } finally { setSaving(false) }
  }

  const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14, outline: 'none' }
  const lbl = { fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }

  return (
    <div style={{ maxWidth: 460, margin: '80px auto', padding: '0 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚖</div>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', marginBottom: 8 }}>Fairness Ledger</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>Track who does what. Let the data speak.</div>
      </div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* You */}
        <div>
          <label style={lbl}>Your name</label>
          <input value={myName} onChange={e => setMyName(e.target.value)} placeholder="Me" style={inp} />
        </div>

        {/* Dynamic others */}
        {others.map((person, i) => (
          <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Person {i + 2}
              </span>
              <button onClick={() => removePerson(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 2 }}>✕</button>
            </div>
            <input
              value={person.name}
              onChange={e => updatePerson(i, 'name', e.target.value)}
              placeholder="Their name"
              style={inp}
              autoFocus
            />
            <div>
              <div style={{ ...lbl, marginBottom: 8 }}>Their relationship to you</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {RELATIONSHIP_OPTIONS.map(rel => (
                  <button
                    key={rel}
                    onClick={() => updatePerson(i, 'relationship', rel)}
                    style={{ fontSize: 11, padding: '5px 12px', borderRadius: 99, border: `1px solid ${person.relationship === rel ? 'var(--accent)' : 'var(--border)'}`, background: person.relationship === rel ? 'var(--accent)' : 'transparent', color: person.relationship === rel ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                  >{rel}</button>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Add person */}
        {others.length < MAX_OTHERS && (
          <button onClick={addPerson} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
            <span>Add {others.length === 0 ? 'someone to track' : 'another person'}</span>
          </button>
        )}

        {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}

        <button onClick={handleSave} disabled={saving || others.length === 0} style={{ background: others.length > 0 ? 'var(--accent)' : 'var(--border)', color: others.length > 0 ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 8, padding: '12px 20px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, cursor: saving || others.length === 0 ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Setting up…' : 'Set Up Ledger'}
        </button>
      </div>
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ myName, partnerName, member3Name, score }) {
  const meT  = score?.me?.total      || 0
  const parT = score?.partner?.total || 0
  const m3T  = score?.member3?.total || 0
  const grand = meT + parT + m3T || 1
  const mePct  = Math.round((meT  / grand) * 100)
  const parPct = Math.round((parT / grand) * 100)
  const m3Pct  = 100 - mePct - parPct
  const meCats  = score?.me?.by_category      || {}
  const parCats = score?.partner?.by_category  || {}
  const m3Cats  = score?.member3?.by_category  || {}

  const members = [
    { key: 'me',      name: myName,      total: meT,  pct: mePct,  color: 'var(--accent)' },
    { key: 'partner', name: partnerName, total: parT, pct: parPct, color: 'var(--text-muted)' },
    ...(member3Name ? [{ key: 'member3', name: member3Name, total: m3T, pct: m3Pct, color: '#8b5cf6' }] : []),
  ]

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '24px 24px 20px' }}>
      <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Overall Load Split</div>
      <div style={{ height: 14, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 10 }}>
        <div style={{ width: `${mePct}%`, background: 'var(--accent)', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${parPct}%`, background: 'var(--border)' }} />
        {member3Name && <div style={{ width: `${m3Pct}%`, background: '#8b5cf6', opacity: 0.7 }} />}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {members.map(m => (
          <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: m.color, fontWeight: 600 }}>{m.name}</span>
            <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>{m.pct}% · {m.total}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CATEGORIES.map(cat => {
          const me  = meCats[cat.key]  || 0
          const par = parCats[cat.key] || 0
          const m3  = m3Cats[cat.key]  || 0
          const tot = me + par + m3
          if (!tot) return null
          return (
            <div key={cat.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cat.icon} {cat.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
                  {myName}: {me} · {partnerName}: {par}{member3Name ? ` · ${member3Name}: ${m3}` : ''}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 99, overflow: 'hidden', display: 'flex', background: 'var(--bg-base)' }}>
                <div style={{ width: `${Math.round((me  / tot) * 100)}%`, background: 'var(--accent)', opacity: 0.8 }} />
                <div style={{ width: `${Math.round((par / tot) * 100)}%`, background: 'var(--border)' }} />
                {member3Name && <div style={{ width: `${Math.round((m3 / tot) * 100)}%`, background: '#8b5cf6', opacity: 0.7 }} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Who picker ────────────────────────────────────────────────────────────────
function WhoPicker({ who, setWho, myName, partnerName, member3Name }) {
  const options = [['me', myName], ['partner', partnerName], ...(member3Name ? [['member3', member3Name]] : [])]
  return (
    <div>
      <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Who?</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map(([val, label]) => (
          <button key={val} onClick={() => setWho(val)} style={{ flex: 1, minWidth: 80, padding: '10px 8px', borderRadius: 8, border: `1px solid ${who === val ? whoColor(val) : 'var(--border)'}`, background: who === val ? whoColor(val) : 'var(--bg-base)', color: who === val ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Log task modal ────────────────────────────────────────────────────────────
function LogTaskModal({ myName, partnerName, member3Name, tasks, onClose, onLogged }) {
  const [selectedTask, setSelectedTask] = useState(null)
  const [who, setWho]     = useState('me')
  const [note, setNote]   = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.category === filter)

  async function handleLog() {
    if (!selectedTask) return
    setSaving(true)
    try {
      await api.post('/api/fairness/log', { task_id: selectedTask.id, performed_by: who, note: note || undefined })
      onLogged(); onClose()
    } catch { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Log a Task</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: '16px 24px 0' }}>
          <WhoPicker who={who} setWho={setWho} myName={myName} partnerName={partnerName} member3Name={member3Name} />
        </div>
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, border: `1px solid ${filter === 'all' ? 'var(--accent)' : 'var(--border)'}`, background: filter === 'all' ? 'var(--accent)' : 'transparent', color: filter === 'all' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}>All</button>
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => setFilter(cat.key)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, border: `1px solid ${filter === cat.key ? 'var(--accent)' : 'var(--border)'}`, background: filter === cat.key ? 'var(--accent)' : 'transparent', color: filter === cat.key ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.filter(t => t.is_active).map(task => (
              <button key={task.id} onClick={() => setSelectedTask(task)} style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, border: `1px solid ${selectedTask?.id === task.id ? 'var(--accent)' : 'var(--border)'}`, background: selectedTask?.id === task.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-base)', color: selectedTask?.id === task.id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginRight: 8 }}>{CAT_MAP[task.category]?.icon}</span>
                {task.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 24px 20px', borderTop: '1px solid var(--border)' }}>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 10 }} />
          <button onClick={handleLog} disabled={!selectedTask || saving} style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: selectedTask ? 'var(--accent)' : 'var(--border)', color: selectedTask ? '#fff' : 'var(--text-muted)', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, cursor: selectedTask && !saving ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Logging…' : selectedTask ? `Log: ${selectedTask.name}` : 'Select a task first'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Contribution modal ────────────────────────────────────────────────────────
function ContributionModal({ myName, partnerName, member3Name, onClose, onSaved }) {
  const [who, setWho]           = useState('me')
  const [category, setCategory] = useState('childcare')
  const [description, setDesc]  = useState('')
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  async function handleSave() {
    if (!description.trim()) { setErr('Add a description'); return }
    setSaving(true)
    try {
      await api.post('/api/fairness/contributions', { performed_by: who, category, description: description.trim(), contribution_date: date })
      onSaved(); onClose()
    } catch { setErr('Failed to save.'); setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>Add Contribution</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WhoPicker who={who} setWho={setWho} myName={myName} partnerName={partnerName} member3Name={member3Name} />
          <div>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Category</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => setCategory(cat.key)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 99, border: `1px solid ${category === cat.key ? 'var(--accent)' : 'var(--border)'}`, background: category === cat.key ? 'var(--accent)' : 'transparent', color: category === cat.key ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>What happened?</div>
            <textarea value={description} onChange={e => { setDesc(e.target.value); setErr('') }} placeholder="Describe what was done…" rows={3} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Date</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          </div>
          {err && <div style={{ fontSize: 12, color: '#ef4444' }}>{err}</div>}
          <button onClick={handleSave} disabled={saving} style={{ padding: '12px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Contribution'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Log feed ──────────────────────────────────────────────────────────────────
function LogFeed({ myName, partnerName, member3Name, logs, contributions, onDeleteLog, onDeleteContrib }) {
  const allItems = [
    ...logs.map(l => ({ ...l, _type: 'log',    _date: l.logged_at })),
    ...contributions.map(c => ({ ...c, _type: 'contrib', _date: c.contribution_date + 'T23:59:59' })),
  ].sort((a, b) => b._date.localeCompare(a._date)).slice(0, 50)

  if (!allItems.length) return <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)', fontSize: 13 }}>No entries yet.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {allItems.map(item => {
        const wLabel  = whoLabel(item.performed_by, myName, partnerName, member3Name)
        const wColor  = whoColor(item.performed_by)
        const catInfo = CAT_MAP[item.category]
        return (
          <div key={`${item._type}-${item.id}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'var(--bg-base)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, marginTop: 1 }}>{catInfo?.icon || '◌'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: wColor }}>{wLabel}</span>
                <span style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4 }}>
                  {item._type === 'log' ? item.task_name : catInfo?.label}
                </span>
                {item._type === 'contrib' && <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '1px 6px', borderRadius: 4 }}>freeform</span>}
              </div>
              {item._type === 'contrib' && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.5 }}>{item.description}</div>}
              {item.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>{item.note}</div>}
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginTop: 4 }}>
                {(item._type === 'log' ? item.logged_at : item.contribution_date)?.slice(0, 10)}
              </div>
            </div>
            <button onClick={() => item._type === 'log' ? onDeleteLog(item.id) : onDeleteContrib(item.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: 0.5, flexShrink: 0 }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

// ── Summary panel ─────────────────────────────────────────────────────────────
function SummaryPanel({ summary, onRegenerate, generating }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Assessment</div>
        <button onClick={onRegenerate} disabled={generating} style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 10px', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}>
          {generating ? '…generating' : summary?.exists ? '↻ Regenerate' : '✦ Generate'}
        </button>
      </div>
      {generating && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13 }}>Reading the full ledger…</div>}
      {!generating && !summary?.exists && <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>Log some tasks first, then generate your first assessment.</div>}
      {!generating && summary?.exists && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{summary.summary_text}</div>
          <div style={{ marginTop: 16, fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
            Based on {summary.log_count} entries · Last updated {summary.generated_at?.slice(0, 10)}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FairnessLedger() {
  const [config, setConfig]               = useState(null)
  const [tasks, setTasks]                 = useState([])
  const [logs, setLogs]                   = useState([])
  const [contributions, setContributions] = useState([])
  const [summary, setSummary]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [showLogModal, setShowLogModal]   = useState(false)
  const [showContribModal, setShowContribModal] = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [activeTab, setActiveTab]         = useState('overview')

  const loadAll = useCallback(async () => {
    try {
      // Config fetch is isolated — failure here means not configured
      const cfgRes = await api.get('/api/fairness/config')
      setConfig(cfgRes.data)
      if (!cfgRes.data?.configured) { setLoading(false); return }

      // Rest of the data — failures are non-fatal
      const [tasksRes, logsRes, contribRes, sumRes] = await Promise.all([
        api.get('/api/fairness/tasks').catch(() => ({ data: { tasks: [] } })),
        api.get('/api/fairness/logs?limit=60').catch(() => ({ data: { logs: [] } })),
        api.get('/api/fairness/contributions?limit=60').catch(() => ({ data: { contributions: [] } })),
        api.get('/api/fairness/summary').catch(() => ({ data: { exists: false } })),
      ])
      setTasks(tasksRes.data.tasks || [])
      setLogs(logsRes.data.logs || [])
      setContributions(contribRes.data.contributions || [])
      setSummary(sumRes.data)
    } catch { setConfig({ configured: false }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await api.post('/api/fairness/summary/generate')
      setSummary({ exists: true, ...res.data })
    } catch (e) { alert(e?.response?.data?.detail || 'Generation failed') }
    finally { setGenerating(false) }
  }

  async function handleDeleteLog(id) {
    await api.delete(`/api/fairness/log/${id}`)
    setLogs(l => l.filter(x => x.id !== id))
  }

  async function handleDeleteContrib(id) {
    await api.delete(`/api/fairness/contributions/${id}`)
    setContributions(c => c.filter(x => x.id !== id))
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
  if (!config?.configured) return <SetupScreen onSaved={() => { setLoading(true); loadAll() }} />

  const { my_name: myName, partner_name: partnerName, member3_name: member3Name } = config
  const score = summary?.score || null
  const TABS = ['overview', 'history', 'assessment']

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', marginBottom: 4 }}>⚖ Fairness Ledger</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {myName} · {partnerName}{member3Name ? ` · ${member3Name}` : ''} — who does what, who does more.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={() => setShowLogModal(true)} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Log Task</button>
        <button onClick={() => setShowContribModal(true)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Add Contribution</button>
      </div>

      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`, color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer', marginBottom: -1 }}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ScoreBar myName={myName} partnerName={partnerName} member3Name={member3Name} score={score} />
          <div style={{ display: 'grid', gridTemplateColumns: member3Name ? '1fr 1fr 1fr' : '1fr 1fr', gap: 12 }}>
            {[
              ['me',      myName,      score?.me?.total      || 0, 'var(--accent)'],
              ['partner', partnerName, score?.partner?.total || 0, 'var(--text-muted)'],
              ...(member3Name ? [['member3', member3Name, score?.member3?.total || 0, '#8b5cf6']] : []),
            ].map(([key, name, total, color]) => (
              <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontFamily: 'IBM Plex Mono', color, fontWeight: 700 }}>{total}</div>
                <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', marginTop: 4, textTransform: 'uppercase' }}>{name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <LogFeed myName={myName} partnerName={partnerName} member3Name={member3Name} logs={logs} contributions={contributions} onDeleteLog={handleDeleteLog} onDeleteContrib={handleDeleteContrib} />
      )}

      {activeTab === 'assessment' && (
        <SummaryPanel summary={summary} onRegenerate={handleGenerate} generating={generating} />
      )}

      {showLogModal && <LogTaskModal myName={myName} partnerName={partnerName} member3Name={member3Name} tasks={tasks} onClose={() => setShowLogModal(false)} onLogged={loadAll} />}
      {showContribModal && <ContributionModal myName={myName} partnerName={partnerName} member3Name={member3Name} onClose={() => setShowContribModal(false)} onSaved={loadAll} />}
    </div>
  )
}
