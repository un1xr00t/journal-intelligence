/**
 * ExitPlan.jsx — pages/ExitPlan.jsx
 * Personalized, task-based exit plan engine.
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  critical: '#ef4444',
  high:     '#f59e0b',
  normal:   '#6366f1',
  low:      '#6b7280',
}

const STATUS_LABELS = {
  backlog: 'Backlog',
  next:    'Next',
  doing:   'In Progress',
  done:    'Done',
  skipped: 'Skipped',
}

const PLAN_TYPE_LABELS = {
  separation_planning:      'Separation Planning',
  safety_first:             'Safety-First Exit',
  coparenting_transition:   'Co-Parenting Transition',
  financial_stabilization:  'Financial Stabilization',
  housing_logistics:        'Housing Logistics',
}

// ── Inline resource library ────────────────────────────────────────────────────

const RESOURCE_LIBRARY = {
  crisis: {
    title: 'Crisis & Immediate Safety', icon: '🆘', color: '#ef4444',
    resources: [
      { name: 'National DV Hotline',    description: '1-800-799-7233 · text START to 88788 · 24/7', url: 'https://thehotline.org',          type: 'hotline' },
      { name: 'Crisis Text Line',       description: 'Text HOME to 741741 — free, 24/7',            type: 'hotline' },
      { name: '988 Lifeline',           description: 'Call or text 988 — 24/7 crisis support',      url: 'https://988lifeline.org',          type: 'hotline' },
    ]
  },
  relationship: {
    title: 'Relationship & DV Support', icon: '🤝', color: '#ec4899',
    resources: [
      { name: 'National DV Hotline',    description: '1-800-799-7233 · text START to 88788',       url: 'https://thehotline.org',           type: 'hotline' },
      { name: 'Love Is Respect',        description: 'Text LOVEIS to 22522 — relationship support', url: 'https://loveisrespect.org',        type: 'hotline' },
    ]
  },
  legal: {
    title: 'Legal Aid & Rights', icon: '⚖️', color: '#64748b',
    resources: [
      { name: 'LawHelp.org',            description: 'Free legal info by state',                    url: 'https://lawhelp.org',              type: 'resource' },
      { name: 'Legal Services Corp',    description: 'Find free civil legal aid near you',          url: 'https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help', type: 'directory' },
      { name: 'Law Help Interactive',   description: 'Generate free legal documents',               url: 'https://lawhelpinteractive.org',   type: 'tool' },
    ]
  },
  housing: {
    title: 'Housing & Practical Needs', icon: '🏠', color: '#0ea5e9',
    resources: [
      { name: '211 Helpline',           description: 'Dial 2-1-1 — local housing, food, financial', url: 'https://211.org',                  type: 'hotline' },
      { name: 'HUD Rental Assistance',  description: 'Federal housing assistance programs',         url: 'https://www.hud.gov/topics/rental_assistance', type: 'resource' },
      { name: 'NLIHC Finder',           description: 'Rental assistance by state',                  url: 'https://nlihc.org/find-assistance', type: 'directory' },
    ]
  },
  parenting: {
    title: 'Parenting & Co-Parenting', icon: '🌻', color: '#f59e0b',
    resources: [
      { name: 'Our Family Wizard',      description: 'Co-parenting communication tool',             url: 'https://ourfamilywizard.com',      type: 'tool' },
      { name: 'Childhelp Hotline',      description: '1-800-422-4453 — support for parents',       type: 'hotline' },
      { name: 'Zero to Three',          description: 'Parenting resources and developmental support', url: 'https://zerotothree.org',         type: 'resource' },
    ]
  },
  financial: {
    title: 'Financial Help', icon: '💰', color: '#10b981',
    resources: [
      { name: '211 Helpline',           description: 'Dial 2-1-1 — connects to local financial aid', url: 'https://211.org',                 type: 'hotline' },
      { name: 'LawHelp.org',            description: 'Legal help for financial and debt issues',    url: 'https://lawhelp.org',              type: 'resource' },
    ]
  },
  emotional_support: {
    title: 'Emotional Support', icon: '💬', color: '#8b5cf6',
    resources: [
      { name: 'BetterHelp',             description: 'Online therapy — text, video, or phone',      url: 'https://betterhelp.com',           type: 'service' },
      { name: '7 Cups',                 description: 'Free anonymous chat with trained listeners',  url: 'https://7cups.com',                type: 'service' },
      { name: 'Open Path Collective',   description: 'Affordable therapy, $30–$80/session',         url: 'https://openpathcollective.org',   type: 'service' },
    ]
  },
  safety_planning: {
    title: 'Safety Planning', icon: '🛡', color: '#f97316',
    resources: [
      { name: 'National DV Hotline',    description: '1-800-799-7233 — safety planning support',   url: 'https://thehotline.org',           type: 'hotline' },
      { name: 'Safety Plan Guide',      description: 'thehotline.org/plan-for-safety',              url: 'https://www.thehotline.org/plan-for-safety', type: 'resource' },
    ]
  },
}

const KEYWORD_RESOURCE_MAP = [
  { k: ['safety contact', 'safe space', 'escape', 'danger', 'abuse', 'violence', 'emergency', 'immediate safety'],      cats: ['crisis', 'safety_planning'] },
  { k: ['incident log', 'documentation log', 'document incident', 'record'],                                             cats: ['legal', 'safety_planning'] },
  { k: ['legal', 'court', 'rights', 'protection order', 'restraining', 'attorney', 'lawyer', 'divorce', 'separation'],  cats: ['legal'] },
  { k: ['housing', 'shelter', 'rent', 'apartment', 'lease', 'landlord', 'move out', 'new place', 'living situation'],   cats: ['housing', 'legal'] },
  { k: ['bank account', 'financial', 'money', 'credit', 'funds', 'income', 'savings', 'accounts separate', 'budget'],   cats: ['financial', 'legal'] },
  { k: ['children', 'child', 'custody', 'co-parent', 'coparent', 'school', 'daycare', 'kids', 'parenting plan'],        cats: ['parenting', 'legal'] },
  { k: ['pet', 'pets', 'animal', 'dog', 'cat'],                                                                          cats: ['emotional_support'] },
  { k: ['communicate', 'communication', 'private phone', 'code name', 'contact list', 'support network'],               cats: ['safety_planning', 'emotional_support'] },
  { k: ['therapist', 'counselor', 'mental health', 'emotional', 'healing', 'process', 'cope', 'wellbeing'],             cats: ['emotional_support'] },
]

function getTaskResources(task) {
  if (!task) return []
  const text = `${task.title || ''} ${task.description || ''} ${task.why_it_matters || ''}`.toLowerCase()
  const matched = new Set()
  for (const { k, cats } of KEYWORD_RESOURCE_MAP) {
    if (k.some(kw => text.includes(kw))) cats.forEach(c => matched.add(c))
  }
  if (matched.size === 0) matched.add('emotional_support')
  const result = []; const seen = new Set()
  for (const cat of matched) {
    const lib = RESOURCE_LIBRARY[cat]; if (!lib) continue
    for (const r of lib.resources.slice(0, 2)) {
      if (!seen.has(r.name)) { seen.add(r.name); result.push({ ...r, cat_title: lib.title, cat_icon: lib.icon, cat_color: lib.color }) }
    }
  }
  return result.slice(0, 5)
}

// ── Resource chip ──────────────────────────────────────────────────────────────

function ResourceChip({ resource }) {
  const style = {
    display:      'flex', alignItems: 'flex-start', gap: 10,
    padding:      '9px 12px', borderRadius: 7, marginBottom: 6,
    background:   resource.cat_color + '10',
    border:       `1px solid ${resource.cat_color}28`,
  }
  return (
    <div style={style}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{resource.cat_icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, fontWeight: 600, color: resource.cat_color, textDecoration: 'none' }}
            >{resource.name} ↗</a>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 600, color: resource.cat_color }}>{resource.name}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.5 }}>
          {resource.description}
        </div>
      </div>
    </div>
  )
}

// ── Tiny shared styles ────────────────────────────────────────────────────────

const card = {
  background: 'var(--bg-card)',
  border:     '1px solid var(--border)',
  borderRadius: 10,
  padding:    '18px 20px',
}

const pill = (color = 'var(--accent)') => ({
  display:      'inline-flex',
  alignItems:   'center',
  gap:          4,
  padding:      '2px 8px',
  borderRadius: 99,
  fontSize:     10,
  fontWeight:   600,
  background:   color + '22',
  color:        color,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
})

const btn = (variant = 'primary') => ({
  padding:      '7px 16px',
  borderRadius: 7,
  fontSize:     12,
  fontWeight:   600,
  cursor:       'pointer',
  border:       variant === 'ghost' ? '1px solid var(--border)' : 'none',
  background:   variant === 'primary' ? 'var(--accent)'
              : variant === 'danger'  ? '#ef4444'
              : 'transparent',
  color:        variant === 'ghost' ? 'var(--text-secondary)' : '#fff',
  fontFamily:   'DM Sans, sans-serif',
  transition:   'opacity 0.15s',
})

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value = 0, color = 'var(--accent)', height = 4, style = {} }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', height, ...style }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── Task card (Today view) ────────────────────────────────────────────────────

function TodayTaskCard({ task, onStatusChange, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false)
  const [loading,  setLoading]  = useState(false)

  const markDone = async () => {
    setLoading(true)
    try { await onStatusChange(task.id, 'done') } finally { setLoading(false) }
  }
  const markDoing = async () => {
    setLoading(true)
    try { await onStatusChange(task.id, 'doing') } finally { setLoading(false) }
  }

  return (
    <div style={{ ...card, marginBottom: 12, borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] || '#6366f1'}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</span>
            <span style={pill(PRIORITY_COLORS[task.priority])}>{task.priority}</span>
            {task.status === 'doing' && <span style={pill('#10b981')}>In Progress</span>}
          </div>
          {task.phase_title && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'IBM Plex Mono' }}>
              {task.phase_title}
            </div>
          )}
          {expanded && task.description && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>
              {task.description}
            </div>
          )}
          {expanded && task.why_it_matters && (
            <div style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(99,102,241,0.08)', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
              <strong>Why this matters:</strong> {task.why_it_matters}
            </div>
          )}
          {task.due_date && (
            <div style={{ fontSize: 10, color: '#f59e0b', fontFamily: 'IBM Plex Mono' }}>
              Due {new Date(task.due_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {task.status !== 'doing' && task.status !== 'done' && (
          <button style={btn('primary')} onClick={markDoing} disabled={loading}>Start</button>
        )}
        {task.status !== 'done' && (
          <button style={btn('primary')} onClick={markDone} disabled={loading}>
            {loading ? '…' : 'Mark Done'}
          </button>
        )}
        <button style={btn('ghost')} onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Less' : 'Details'}
        </button>
        <button style={btn('ghost')} onClick={() => onOpenDetail(task)}>Open</button>
      </div>
    </div>
  )
}

// ── Phase row (Full Plan view) ────────────────────────────────────────────────

function PhaseRow({ phase, onTaskClick }) {
  const [open, setOpen] = useState(phase.status === 'active')

  const statusIcon = { active: '→', locked: '🔒', completed: '✓' }
  const statusColor = { active: 'var(--accent)', locked: 'var(--text-muted)', completed: '#10b981' }

  return (
    <div style={{ ...card, marginBottom: 10 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontSize: 14, color: statusColor[phase.status] }}>{statusIcon[phase.status] || '○'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: phase.status === 'locked' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            Phase {phase.phase_order}: {phase.title}
          </div>
          {phase.description && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{phase.description}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            {Math.round((phase.progress || 0) * 100)}%
          </div>
          <ProgressBar value={phase.progress || 0} height={3} style={{ width: 80 }} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </div>

      {phase.status === 'locked' && !open && (
        <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
          🔒 Unlocks when Phase {phase.phase_order - 1} reaches {(() => { const t = parseFloat(phase.unlock_threshold) || 0.5; return Math.round((t > 1 ? t / 100 : t) * 100) })()} %
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {(phase.tasks || []).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tasks yet.</div>
          ) : (
            (phase.tasks || []).map(task => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: phase.status !== 'locked' ? 'pointer' : 'default',
                  opacity: task.status === 'skipped' ? 0.4 : 1,
                }}
                onClick={() => phase.status !== 'locked' && onTaskClick(task, phase)}
              >
                <span style={{ fontSize: 13, color: task.status === 'done' ? '#10b981' : PRIORITY_COLORS[task.priority] || 'var(--text-muted)' }}>
                  {task.status === 'done' ? '✓' : task.status === 'doing' ? '→' : task.status === 'skipped' ? '⊘' : '○'}
                </span>
                <span style={{
                  fontSize: 12, flex: 1,
                  color:    task.status === 'done' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  textDecoration: task.status === 'done' ? 'line-through' : 'none',
                }}>
                  {task.title}
                </span>
                {task.note_count > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📝 {task.note_count}</span>}
                {task.priority !== 'normal' && (
                  <span style={{ ...pill(PRIORITY_COLORS[task.priority]), fontSize: 9 }}>{task.priority}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Kanban view ───────────────────────────────────────────────────────────────

function KanbanView({ phases, onTaskClick, onStatusChange }) {
  const COLS = ['backlog', 'next', 'doing', 'done']
  const allTasks = phases.flatMap(p =>
    (p.tasks || []).map(t => ({ ...t, phase_title: p.title, phase_status: p.status }))
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, overflowX: 'auto' }}>
      {COLS.map(col => (
        <div key={col}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
            {STATUS_LABELS[col]} · {allTasks.filter(t => t.status === col).length}
          </div>
          {allTasks.filter(t => t.status === col).map(task => (
            <div
              key={task.id}
              onClick={() => onTaskClick(task)}
              style={{
                ...card, marginBottom: 8, cursor: 'pointer', padding: '10px 12px',
                borderLeft: `2px solid ${PRIORITY_COLORS[task.priority] || 'var(--border)'}`,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{task.title}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{task.phase_title}</div>
              {task.due_date && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                  {new Date(task.due_date).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Task detail drawer ────────────────────────────────────────────────────────

function TaskDetailDrawer({ task, phase, onClose, onStatusChange, onAddNote }) {
  const [notes,     setNotes]     = useState([])
  const [noteText,  setNoteText]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

  useEffect(() => {
    if (!task) return
    setLoadingNotes(true)
    api.get(`/api/exit-plan/notes?task_id=${task.id}`)
      .then(r => setNotes(r.data.notes || []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [task?.id])

  const submitNote = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      await api.post('/api/exit-plan/notes', { task_id: task.id, note_text: noteText.trim() })
      setNoteText('')
      const r = await api.get(`/api/exit-plan/notes?task_id=${task.id}`)
      setNotes(r.data.notes || [])
      if (onAddNote) onAddNote()
    } finally {
      setSaving(false)
    }
  }

  if (!task) return null

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
      background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
      zIndex: 200, overflowY: 'auto', padding: '24px 24px',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{task.title}</div>
          {phase?.title && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{phase.title}</div>}
        </div>
        <button onClick={onClose} style={{ ...btn('ghost'), padding: '4px 10px', fontSize: 14 }}>✕</button>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={pill(PRIORITY_COLORS[task.priority])}>Priority: {task.priority}</span>
        <span style={pill()}>{STATUS_LABELS[task.status] || task.status}</span>
        {task.due_date && <span style={pill('#f59e0b')}>Due {new Date(task.due_date).toLocaleDateString()}</span>}
      </div>

      {/* Description */}
      {task.description && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>What to do</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{task.description}</div>
        </div>
      )}

      {/* Why it matters */}
      {task.why_it_matters && (
        <div style={{ ...card, background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.2)', marginBottom: 16, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Why this matters</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{task.why_it_matters}</div>
        </div>
      )}

      {/* Resources */}
      {(() => {
        const resources = getTaskResources(task)
        if (resources.length === 0) return null
        return (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              Resources for this step
            </div>
            {resources.map((r, i) => <ResourceChip key={i} resource={r} />)}
          </div>
        )
      })()}

      {/* Status actions */}
      {task.status !== 'done' && task.status !== 'skipped' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {task.status !== 'doing' && (
            <button style={btn('ghost')} onClick={() => onStatusChange(task.id, 'doing')}>Mark In Progress</button>
          )}
          <button style={btn('primary')} onClick={() => onStatusChange(task.id, 'done')}>Mark Done</button>
          <button style={{ ...btn('ghost'), color: 'var(--text-muted)' }} onClick={() => onStatusChange(task.id, 'skipped')}>Skip</button>
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Notes</div>
        {loadingNotes ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</div>
        ) : (
          notes.map(n => (
            <div key={n.id} style={{ ...card, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{n.note_text}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'IBM Plex Mono' }}>
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12,
              resize: 'vertical', outline: 'none', fontFamily: 'DM Sans',
            }}
          />
          <button style={{ ...btn('primary'), alignSelf: 'flex-end', whiteSpace: 'nowrap' }} onClick={submitNote} disabled={saving || !noteText.trim()}>
            {saving ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Update review modal ───────────────────────────────────────────────────────

function UpdateModal({ updates, onApply, onDismiss }) {
  const [selected, setSelected] = useState(() => updates.proposed_changes.map((_, i) => i))

  const toggle = (i) => setSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
      <div style={{ ...card, maxWidth: 520, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Plan Update Available</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Your journal has new signals. Review suggested changes — you control what gets applied.
        </div>

        {updates.proposed_changes.map((change, i) => (
          <div
            key={i}
            style={{
              ...card, marginBottom: 10, padding: '12px 14px',
              borderColor: selected.includes(i) ? 'var(--accent)' : 'var(--border)',
              cursor: 'pointer',
            }}
            onClick={() => toggle(i)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{
                width: 16, height: 16, borderRadius: 4, border: '2px solid var(--accent)',
                background: selected.includes(i) ? 'var(--accent)' : 'transparent',
                flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {selected.includes(i) && <span style={{ fontSize: 10, color: '#fff' }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {change.change_type === 'add_task' ? '➕ Add task' : '↑ Reprioritize'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {change.change_type === 'add_task' ? change.task?.title : change.task_title}
                </div>
                {change.reason && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{change.reason}</div>
                )}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button style={btn('primary')} onClick={() => onApply(selected)} disabled={selected.length === 0}>
            Apply {selected.length} Change{selected.length !== 1 ? 's' : ''}
          </button>
          <button style={btn('ghost')} onClick={onDismiss}>Skip All</button>
        </div>
      </div>
    </div>
  )
}

// ── Create plan flow ──────────────────────────────────────────────────────────

function CreatePlanFlow({ detectData, onCreated, onDismiss }) {
  const [confirmed, setConfirmed] = useState([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  const BRANCH_LABELS = {
    children:  '👶 Children involved',
    financial: '💰 Financial dependence',
    housing:   '🏠 Housing concerns',
    pets:      '🐾 Pets',
    safety:    '🛡 Safety concern',
  }

  const toggleConfirm = (branch) => {
    setConfirmed(c => c.includes(branch) ? c.filter(x => x !== branch) : [...c, branch])
  }

  const handleBuild = async () => {
    setGenerating(true)
    setError(null)
    try {
      await api.post('/api/exit-plan/generate', { force: false, confirmed_branches: confirmed })
      onCreated()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Generation failed — try again')
      setGenerating(false)
    }
  }

  const detectedSignals = detectData?.detected_signals || []
  const confirmToggles  = detectData?.confirm_toggles  || []

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ ...card, padding: '28px 32px' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'Syne' }}>
          🗺 Your Exit Plan
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
          We'll build a step-by-step plan based on what your journal has shown us. Nothing gets shared. This lives only here, private to you.
        </div>

        {detectedSignals.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Detected signals</div>
            {detectedSignals.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: '#10b981', fontSize: 12 }}>✓</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}

        {confirmToggles.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Does any of this apply? (optional)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {confirmToggles.map(branch => (
                <button
                  key={branch}
                  onClick={() => toggleConfirm(branch)}
                  style={{
                    padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                    border: '1px solid var(--border)', fontFamily: 'DM Sans',
                    background: confirmed.includes(branch) ? 'var(--accent)' : 'transparent',
                    color:      confirmed.includes(branch) ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {BRANCH_LABELS[branch] || branch}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Your plan will include a phased task roadmap, resources at every step, a "Today" view, and private progress tracking.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn('primary')} onClick={handleBuild} disabled={generating}>
            {generating ? 'Building your plan…' : 'Build My Plan'}
          </button>
          <button style={btn('ghost')} onClick={onDismiss}>Back</button>
        </div>
      </div>
    </div>
  )
}

// ── Notes tab (plan-level scratchpad) ─────────────────────────────────────────

function NotesTab({ planId }) {
  const [notes,    setNotes]    = useState([])
  const [text,     setText]     = useState('')
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)

  const load = useCallback(() => {
    if (!planId) return
    api.get('/api/exit-plan/notes').then(r => setNotes(r.data.notes || [])).catch(() => {}).finally(() => setLoading(false))
  }, [planId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post('/api/exit-plan/notes', { note_text: text.trim() })
      setText('')
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        A private scratchpad. No AI reads this — it's purely for you.
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write something…"
          rows={3}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13,
            resize: 'vertical', outline: 'none', fontFamily: 'DM Sans',
          }}
        />
        <button style={{ ...btn('primary'), alignSelf: 'flex-end', whiteSpace: 'nowrap' }} onClick={submit} disabled={saving || !text.trim()}>
          {saving ? '…' : 'Save Note'}
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No notes yet.</div>
      ) : (
        notes.map(n => (
          <div key={n.id} style={{ ...card, marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{n.note_text}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontFamily: 'IBM Plex Mono' }}>
              {new Date(n.created_at).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExitPlan() {
  const [loading,       setLoading]       = useState(true)
  const [plan,          setPlan]          = useState(null)
  const [detectData,    setDetectData]    = useState(null)
  const [mode,          setMode]          = useState('loading') // loading | no_plan | create | plan
  const [activeTab,     setActiveTab]     = useState('today')
  const [planView,      setPlanView]      = useState('phases') // phases | kanban
  const [selectedTask,  setSelectedTask]  = useState(null)
  const [selectedPhase, setSelectedPhase] = useState(null)
  const [updateData,    setUpdateData]    = useState(null)
  const [showUpdate,    setShowUpdate]    = useState(false)
  const [checkingUp,    setCheckingUp]    = useState(false)

  const loadPlan = useCallback(async () => {
    try {
      const r = await api.get('/api/exit-plan')
      if (r.data.has_plan) {
        setPlan({ ...r.data.plan, update_available: r.data.update_available })
        setMode('plan')
      } else {
        setMode('no_plan')
      }
    } catch (e) {
      setMode('no_plan')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDetect = useCallback(async () => {
    try {
      const r = await api.get('/api/exit-plan/detect')
      setDetectData(r.data)
    } catch {}
  }, [])

  useEffect(() => {
    loadPlan()
    loadDetect()
  }, [loadPlan, loadDetect])

  const handleStatusChange = async (taskId, status) => {
    try {
      await api.patch(`/api/exit-plan/tasks/${taskId}`, { status })
      await loadPlan()
      if (selectedTask?.id === taskId) setSelectedTask(null)
    } catch (e) {
      console.error('Status update failed', e)
    }
  }

  const handleOpenDetail = (task, phase) => {
    setSelectedTask(task)
    setSelectedPhase(phase || null)
  }

  const handleCheckUpdates = async () => {
    setCheckingUp(true)
    try {
      const r = await api.post('/api/exit-plan/check-updates', { apply: false })
      if (r.data.update_available && r.data.proposed_changes?.length > 0) {
        setUpdateData(r.data)
        setShowUpdate(true)
      } else {
  alert('Your plan is up to date.')
  await loadPlan()
      }
    } catch {} finally {
      setCheckingUp(false)
    }
  }

  const handleApplyUpdates = async (selectedIndices) => {
    try {
      await api.post('/api/exit-plan/check-updates', { apply: true })
      setShowUpdate(false)
      setUpdateData(null)
      await loadPlan()
    } catch {}
  }

  const handleDeletePlan = async () => {
    if (!window.confirm('Delete your exit plan and all progress? This cannot be undone.')) return
    try {
      await api.delete('/api/exit-plan')
      setPlan(null)
      setMode('no_plan')
    } catch {}
  }

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>Loading…</div>
      </div>
    )
  }

  // ── Render: no plan / offer ─────────────────────────────────────────────────

  if (mode === 'no_plan') {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Syne', marginBottom: 4 }}>Exit Plan</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>A personalized, private roadmap for your transition.</div>
        </div>
        <div style={{ ...card, maxWidth: 520, padding: '28px 32px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, fontFamily: 'Syne' }}>
            🗺 You don't have a plan yet.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
            Build a personalized step-by-step plan tailored to your situation. It adapts to what your journal already knows about you — no long questionnaire.
          </div>
          <button style={btn('primary')} onClick={() => setMode('create')}>
            Create My Plan
          </button>
        </div>
      </div>
    )
  }

  // ── Render: create flow ─────────────────────────────────────────────────────

  if (mode === 'create') {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Syne' }}>Exit Plan</div>
        </div>
        <CreatePlanFlow
          detectData={detectData}
          onCreated={() => { setMode('loading'); setLoading(true); loadPlan() }}
          onDismiss={() => setMode('no_plan')}
        />
      </div>
    )
  }

  // ── Render: active plan ─────────────────────────────────────────────────────

  const todayTaskIds = plan?.today_tasks || []
  const todayTasks = (plan?.phases || []).flatMap(p =>
    (p.tasks || [])
      .filter(t => todayTaskIds.includes(t.id))
      .map(t => ({ ...t, phase_title: p.title }))
  )

  const TABS = [
    { id: 'today',     label: 'Today' },
    { id: 'plan',      label: 'Full Plan' },
    { id: 'notes',     label: 'Notes' },
  ]

  return (
    <div>
      {/* Full Workspace Banner */}
      <div
        onClick={() => window.open('/exitplan-full', '_blank')}
        style={{
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '10px 16px',
          marginBottom: 20,
          borderRadius: 9,
          background:   'rgba(99,102,241,0.07)',
          border:       '1px solid rgba(99,102,241,0.2)',
          cursor:       'pointer',
          transition:   'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.13)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.07)'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🖥</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
              Open Full Workspace
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              More room to work — full-screen layout with phases, kanban, and persistent task detail
            </div>
          </div>
        </div>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>Open ↗</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Syne', marginBottom: 4 }}>
            🗺 Exit Plan
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={pill()}>{PLAN_TYPE_LABELS[plan?.plan_type] || plan?.plan_type}</span>
            {(plan?.branches || []).map(b => (
              <span key={b} style={pill('var(--text-muted)')}>{b}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {plan?.update_available && (
            <button
              style={{ ...btn('ghost'), color: '#f59e0b', borderColor: '#f59e0b44' }}
              onClick={handleCheckUpdates}
              disabled={checkingUp}
            >
              {checkingUp ? '…' : '⚠ Updates available'}
            </button>
          )}
          <button style={{ ...btn('ghost'), fontSize: 11 }} onClick={() => setMode('create')}>Regenerate</button>
          <button style={{ ...btn('ghost'), fontSize: 11, color: '#ef4444', borderColor: '#ef444433' }} onClick={handleDeletePlan}>Delete Plan</button>
        </div>
      </div>

      {/* Overall progress */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Overall progress</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{Math.round((plan?.overall_progress || 0) * 100)}%</span>
          </div>
          <ProgressBar value={plan?.overall_progress || 0} color='var(--accent)' height={6} />
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {(plan?.phases || []).map(p => (
            <div key={p.id} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, whiteSpace: 'nowrap' }}>Ph {p.phase_order}</div>
              <ProgressBar value={p.progress || 0} height={3} style={{ width: 40 }} color={p.status === 'locked' ? 'var(--border)' : 'var(--accent)'} />
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding:     '8px 18px',
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              fontSize:    12,
              fontWeight:  activeTab === t.id ? 700 : 400,
              color:       activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              fontFamily:  'DM Sans',
              transition:  'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Today */}
      {activeTab === 'today' && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'IBM Plex Mono' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {todayTasks.length === 0 ? (
            <div style={{ ...card, padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              🎉 Nothing pressing today — or mark some tasks as "In Progress" to see them here.
            </div>
          ) : (
            todayTasks.map(task => (
              <TodayTaskCard
                key={task.id}
                task={task}
                onStatusChange={handleStatusChange}
                onOpenDetail={handleOpenDetail}
              />
            ))
          )}
        </div>
      )}

      {/* Tab: Full Plan */}
      {activeTab === 'plan' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['phases', 'kanban'].map(v => (
              <button
                key={v}
                onClick={() => setPlanView(v)}
                style={{
                  ...btn('ghost'),
                  background: planView === v ? 'rgba(99,102,241,0.15)' : 'transparent',
                  color:      planView === v ? 'var(--accent)' : 'var(--text-muted)',
                  textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {planView === 'phases' ? (
            (plan?.phases || []).map(phase => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                onTaskClick={(task, ph) => handleOpenDetail(task, ph || phase)}
              />
            ))
          ) : (
            <KanbanView
              phases={plan?.phases || []}
              onTaskClick={task => handleOpenDetail(task)}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === 'notes' && <NotesTab planId={plan?.id} />}

      {/* Task detail drawer */}
      {selectedTask && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setSelectedTask(null)}
          />
          <TaskDetailDrawer
            task={selectedTask}
            phase={selectedPhase}
            onClose={() => setSelectedTask(null)}
            onStatusChange={async (id, status) => {
              await handleStatusChange(id, status)
            }}
            onAddNote={() => loadPlan()}
          />
        </>
      )}

      {/* Update modal */}
      {showUpdate && updateData && (
        <UpdateModal
          updates={updateData}
          onApply={handleApplyUpdates}
          onDismiss={() => setShowUpdate(false)}
        />
      )}
    </div>
  )
}
