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
      { name: 'DV Connect',             description: 'thehotline.org — chat online anytime',        url: 'https://www.thehotline.org/get-help/chat', type: 'hotline' },
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
      { name: 'Tenant Rights Guide',    description: 'Know your rights as a renter in your state',  url: 'https://www.hud.gov/topics/rental_assistance/tenantrights', type: 'resource' },
    ]
  },
  parenting: {
    title: 'Parenting & Co-Parenting', icon: '🌻', color: '#f59e0b',
    resources: [
      { name: 'Our Family Wizard',      description: 'Co-parenting communication tool',             url: 'https://ourfamilywizard.com',      type: 'tool' },
      { name: 'Childhelp Hotline',      description: '1-800-422-4453 — support for parents',       type: 'hotline' },
      { name: 'Zero to Three',          description: 'Parenting resources and developmental support', url: 'https://zerotothree.org',         type: 'resource' },
      { name: 'coParenter App',         description: 'Guided co-parenting communication',            url: 'https://coparenter.com',          type: 'tool' },
    ]
  },
  financial: {
    title: 'Financial Help', icon: '💰', color: '#10b981',
    resources: [
      { name: '211 Helpline',           description: 'Dial 2-1-1 — connects to local financial aid', url: 'https://211.org',                 type: 'hotline' },
      { name: 'CFPB Tools',             description: 'Free budgeting and financial tools',           url: 'https://www.consumerfinance.gov/consumer-tools/', type: 'resource' },
      { name: 'Free Credit Report',     description: 'annualcreditreport.com — free from all 3 bureaus', url: 'https://annualcreditreport.com', type: 'tool' },
      { name: 'NFCC Credit Counseling', description: 'Free/low-cost nonprofit credit counseling',   url: 'https://nfcc.org',                 type: 'service' },
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
      { name: 'Safety Plan Guide',      description: 'Step-by-step safety planning',                url: 'https://www.thehotline.org/plan-for-safety', type: 'resource' },
      { name: 'Signal',                 description: 'Encrypted messaging for private communication', url: 'https://signal.org',             type: 'tool' },
    ]
  },
  income: {
    title: 'Income & Gig Work', icon: '💼', color: '#059669',
    resources: [
      { name: 'DoorDash / Dasher',      description: 'Flexible delivery — earn on your schedule',  url: 'https://dasher.doordash.com',      type: 'service' },
      { name: 'Instacart Shopper',      description: 'Grocery delivery — flexible hours',           url: 'https://shoppers.instacart.com',   type: 'service' },
      { name: 'Rover',                  description: 'Dog walking & pet sitting gigs',              url: 'https://rover.com',                type: 'service' },
      { name: 'TaskRabbit',             description: 'Local tasks and odd jobs — set your rate',    url: 'https://taskrabbit.com',           type: 'service' },
      { name: 'Upwork',                 description: 'Freelance work — remote, set your schedule', url: 'https://upwork.com',               type: 'service' },
    ]
  },
  job_search: {
    title: 'Job Search & Employment', icon: '🔍', color: '#3b82f6',
    resources: [
      { name: 'Indeed',                 description: 'Job listings — filter by location and hours', url: 'https://indeed.com',               type: 'service' },
      { name: 'LinkedIn Jobs',          description: 'Professional network and job listings',       url: 'https://linkedin.com/jobs',        type: 'service' },
      { name: 'CareerOneStop',          description: 'Free career tools and skills assessment (DOL)', url: 'https://careeronestop.org',      type: 'resource' },
      { name: 'Unemployment Benefits',  description: 'File at your state labor dept — careeronestop.org', url: 'https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/find-unemployment-benefits.aspx', type: 'resource' },
    ]
  },
  pets: {
    title: 'Pet Resources', icon: '🐾', color: '#d97706',
    resources: [
      { name: 'ASPCA',                  description: 'Pet care resources and emergency assistance', url: 'https://aspca.org',                type: 'resource' },
      { name: 'RedRover Relief',        description: 'Financial aid for urgent pet care needs',     url: 'https://redrover.org/relief',      type: 'resource' },
      { name: 'Rover',                  description: 'Pet sitting/boarding during housing transitions', url: 'https://rover.com',           type: 'service' },
      { name: 'PetFinder',              description: 'Rehoming help — connect with shelters if needed', url: 'https://petfinder.com',       type: 'directory' },
    ]
  },
  documentation: {
    title: 'Documentation & Records', icon: '📋', color: '#475569',
    resources: [
      { name: 'Safety Plan Guide',      description: 'How to document incidents effectively',       url: 'https://www.thehotline.org/plan-for-safety', type: 'resource' },
      { name: 'Google Drive',           description: 'Free secure cloud storage for your documents', url: 'https://drive.google.com',       type: 'tool' },
      { name: 'Signal',                 description: 'Encrypted messaging — keep evidence private', url: 'https://signal.org',              type: 'tool' },
    ]
  },
  self_care: {
    title: 'Self-Care & Wellbeing', icon: '🌿', color: '#7c3aed',
    resources: [
      { name: 'Calm',                   description: 'Meditation and sleep support app',            url: 'https://calm.com',                 type: 'service' },
      { name: 'Headspace',              description: 'Guided meditation and stress management',     url: 'https://headspace.com',            type: 'service' },
      { name: 'Woebot',                 description: 'Free AI mental health support — no waitlist', url: 'https://woebothealth.com',         type: 'service' },
    ]
  },
}

const KEYWORD_RESOURCE_MAP = [
  // Crisis / immediate safety
  { k: ['safety contact', 'safe space', 'escape route', 'in danger', 'abuse', 'violence', 'emergency exit', 'emergency safety', 'immediate safety', 'go-bag', 'safe word', 'safety plan', 'dv hotline', 'unsafe', 'need to leave now', 'not safe'], cats: ['crisis', 'safety_planning'] },
  // Incident documentation — specific, not just "record"
  { k: ['incident log', 'document incident', 'log incident', 'record abuse', 'document abuse', 'document events', 'evidence of'], cats: ['documentation', 'safety_planning'] },
  // Legal — only clearly legal tasks
  { k: ['legal', 'court', 'protection order', 'restraining order', 'attorney', 'lawyer', 'divorce', 'separation agreement', 'file for divorce', 'legal aid', 'legal rights', 'legal help'], cats: ['legal'] },
  // Tenant/housing with legal angle
  { k: ['tenant rights', 'lease agreement', 'eviction', 'landlord dispute', 'break lease'], cats: ['housing', 'legal'] },
  // Housing — without auto-attaching legal
  { k: ['housing', 'shelter', 'apartment', 'rent', 'lease', 'move out', 'new place', 'living situation', 'find housing', 'place to live', 'temporary housing', 'affordable housing'], cats: ['housing'] },
  // Financial — without auto-attaching legal
  { k: ['bank account', 'credit report', 'credit freeze', 'savings account', 'budget', 'financial plan', 'direct deposit', 'joint account', 'marital assets', 'financial records', 'open account'], cats: ['financial'] },
  // Gig / income
  { k: ['dasher', 'doordash', 'instacart', 'uber', 'lyft', 'gig', 'side income', 'freelance', 'extra income', 'delivery job', 'earn money', 'income source', 'make money', 'rover', 'taskrabbit'], cats: ['income'] },
  // Job search / employment
  { k: ['job', 'employment', 'work', 'career', 'resume', 'interview', 'apply for job', 'unemployment', 'job search', 'find work', 'full-time', 'part-time'], cats: ['job_search'] },
  // Children / co-parenting
  { k: ['children', 'child', 'custody', 'co-parent', 'coparent', 'school', 'daycare', 'kids', 'parenting plan', 'child support', 'school pickup', 'childcare'], cats: ['parenting'] },
  // Pets — now gets real pet resources
  { k: ['pet', 'pets', 'animal', 'dog', 'cat', 'vet', 'veterinarian', 'boarding', 'foster pet', 'pet care', 'pet sitting'], cats: ['pets'] },
  // Communication / digital privacy
  { k: ['private phone', 'code name', 'contact list', 'support network', 'encrypted', 'privacy', 'private communication', 'signal', 'safe contact'], cats: ['safety_planning'] },
  // Emotional / therapy
  { k: ['therapist', 'counselor', 'mental health', 'emotional support', 'healing', 'cope', 'wellbeing', 'anxiety', 'grief', 'overwhelmed', 'process feelings', 'therapy'], cats: ['emotional_support'] },
  // Self-care / routines
  { k: ['self-care', 'self care', 'new routine', 'exercise', 'meditation', 'sleep routine', 'breathing', 'grounding', 'stabilize'], cats: ['self_care'] },
  // Relationship / DV support
  { k: ['relationship', 'toxic relationship', 'controlling', 'manipulation', 'gaslighting', 'emotional abuse', 'coercive'], cats: ['relationship'] },
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
  return result.slice(0, 7)
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

function PhaseRow({ phase, onTaskClick, onTaskAdded }) {
  const [open,          setOpen]          = useState(phase.status === 'active')
  const [addingTask,    setAddingTask]    = useState(false)
  const [newTitle,      setNewTitle]      = useState('')
  const [newPriority,   setNewPriority]   = useState('normal')
  const [aiEnrich,      setAiEnrich]      = useState(true)
  const [savingTask,    setSavingTask]    = useState(false)
  const [taskError,     setTaskError]     = useState(null)
  const [enrichingIds,  setEnrichingIds]  = useState(new Set())
  const [deletingIds,   setDeletingIds]   = useState(new Set())

  const handleAddTask = async () => {
    if (!newTitle.trim()) return
    setSavingTask(true)
    setTaskError(null)
    try {
      const resp = await api.post('/api/exit-plan/tasks', {
        phase_id: phase.id,
        title:    newTitle.trim(),
        priority: newPriority,
      })
      const taskId = resp.data.task_id
      setNewTitle('')
      setNewPriority('normal')
      setAiEnrich(true)
      setAddingTask(false)
      if (onTaskAdded) onTaskAdded()
      // Fire AI enrichment in background — non-blocking (same pattern as ExitPlanFull)
      if (aiEnrich && taskId) {
        setEnrichingIds(prev => new Set([...prev, taskId]))
        api.post(`/api/exit-plan/tasks/${taskId}/enrich`).then(() => {
          setEnrichingIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
          if (onTaskAdded) onTaskAdded()
        }).catch(() => {
          setEnrichingIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
        })
      }
    } catch (e) {
      setTaskError(e?.response?.data?.detail || 'Failed to save task')
    } finally {
      setSavingTask(false)
    }
  }

  const handleDeleteTask = async (taskId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setDeletingIds(prev => new Set([...prev, taskId]))
    try {
      await api.delete(`/api/exit-plan/tasks/${taskId}`)
      if (onTaskAdded) onTaskAdded()
    } catch (err) { console.error('Failed to delete task', err) }
    finally { setDeletingIds(prev => { const s = new Set(prev); s.delete(taskId); return s }) }
  }

  const statusIcon  = { active: '→', locked: '🔒', completed: '✓' }
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
            (phase.tasks || []).map(task => {
              const isEnriching = enrichingIds.has(task.id)
              const isDeleting  = deletingIds.has(task.id)
              return (
                <div
                  key={task.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: phase.status !== 'locked' ? 'pointer' : 'default',
                    opacity: (task.status === 'skipped' || isDeleting) ? 0.4 : 1,
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
                    {!task.ai_generated && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 6, fontFamily: 'IBM Plex Mono' }}>you</span>
                    )}
                  </span>
                  {isEnriching && (
                    <span style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'IBM Plex Mono', flexShrink: 0 }}>✨ AI writing…</span>
                  )}
                  {task.note_count > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>📝 {task.note_count}</span>}
                  {task.priority !== 'normal' && (
                    <span style={{ ...pill(PRIORITY_COLORS[task.priority]), fontSize: 9, flexShrink: 0 }}>{task.priority}</span>
                  )}
                  {phase.status !== 'locked' && !isDeleting && (
                    <button
                      onClick={(e) => handleDeleteTask(task.id, e)}
                      title="Delete task"
                      style={{
                        flexShrink: 0, background: 'transparent', border: 'none',
                        cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12,
                        padding: '0 2px', lineHeight: 1, opacity: 0,
                        transition: 'opacity 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >🗑</button>
                  )}
                </div>
              )
            })
          )}


          {/* Add task — only for non-locked phases */}
          {phase.status !== 'locked' && (
            <div style={{ marginTop: 10 }}>
              {!addingTask ? (
                <button
                  onClick={e => { e.stopPropagation(); setAddingTask(true) }}
                  style={{
                    background: 'transparent', border: '1px dashed var(--border)',
                    borderRadius: 6, padding: '5px 12px', fontSize: 11,
                    color: 'var(--text-muted)', cursor: 'pointer', width: '100%',
                    textAlign: 'left', fontFamily: 'DM Sans',
                  }}
                >
                  + Add task
                </button>
              ) : (
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '12px 14px',
                  }}
                >
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setAddingTask(false) }}
                    placeholder="Task title…"
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid var(--border)', borderRadius: 6,
                      padding: '7px 10px', color: 'var(--text-primary)',
                      fontSize: 12, outline: 'none', fontFamily: 'DM Sans',
                      boxSizing: 'border-box', marginBottom: 10,
                    }}
                  />

                  {/* Priority pill buttons */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                      Priority:
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['critical', 'high', 'normal', 'low'].map(p => (
                        <button
                          key={p}
                          onClick={() => setNewPriority(p)}
                          style={{
                            padding: '4px 12px', borderRadius: 99, fontSize: 11,
                            fontWeight: newPriority === p ? 700 : 400,
                            cursor: 'pointer', fontFamily: 'DM Sans',
                            border: `1px solid ${newPriority === p ? PRIORITY_COLORS[p] : 'var(--border)'}`,
                            background: newPriority === p ? PRIORITY_COLORS[p] + '22' : 'transparent',
                            color: newPriority === p ? PRIORITY_COLORS[p] : 'var(--text-muted)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI / manual toggle */}
                  <div style={{ marginBottom: 12 }}>
                    <button
                      onClick={() => setAiEnrich(a => !a)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: 0, fontFamily: 'DM Sans',
                      }}
                    >
                      <div style={{
                        width: 32, height: 18, borderRadius: 99, position: 'relative', flexShrink: 0,
                        background: aiEnrich ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                        transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2, left: aiEnrich ? 16 : 2,
                          width: 14, height: 14, borderRadius: 99,
                          background: '#fff', transition: 'left 0.2s',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, color: aiEnrich ? 'var(--text-secondary)' : 'var(--text-muted)', fontStyle: 'italic' }}>
                        {aiEnrich
                          ? '✨ AI will generate: what to do, why it matters, and resources'
                          : 'Manual task — no AI enrichment'}
                      </span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={handleAddTask}
                      disabled={savingTask || !newTitle.trim()}
                      style={{ ...btn('primary'), padding: '5px 14px', fontSize: 11 }}
                    >
                      {savingTask ? '…' : aiEnrich ? 'Add + AI Fill' : 'Add Task'}
                    </button>
                    <button
                      onClick={() => { setAddingTask(false); setNewTitle(''); setNewPriority('normal'); setAiEnrich(true); setTaskError(null) }}
                      style={{ ...btn('ghost'), padding: '5px 14px', fontSize: 11 }}
                    >
                      Cancel
                    </button>
                    {taskError && (
                      <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 4 }}>{taskError}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
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

function TaskDetailDrawer({ task, phase, onClose, onStatusChange, onAddNote, onRefresh }) {
  const [notes,              setNotes]              = useState([])
  const [noteText,           setNoteText]           = useState('')
  const [saving,             setSaving]             = useState(false)
  const [loadingNotes,       setLoadingNotes]       = useState(false)
  const [attachments,        setAttachments]        = useState([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [uploadingFile,      setUploadingFile]      = useState(false)

  useEffect(() => {
    if (!task) return
    setLoadingNotes(true)
    api.get(`/api/exit-plan/notes?task_id=${task.id}`)
      .then(r => setNotes(r.data.notes || []))
      .catch(() => {})
      .finally(() => setLoadingNotes(false))
  }, [task?.id])

  useEffect(() => {
    if (!task) return
    setLoadingAttachments(true)
    api.get(`/api/exit-plan/tasks/${task.id}/attachments`)
      .then(r => setAttachments(r.data.attachments || []))
      .catch(() => {})
      .finally(() => setLoadingAttachments(false))
  }, [task?.id])

  const reloadAttachments = () => {
    if (!task) return
    api.get(`/api/exit-plan/tasks/${task.id}/attachments`)
      .then(r => setAttachments(r.data.attachments || []))
      .catch(() => {})
  }

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

      {/* Delete task */}
      <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          style={{ ...btn('ghost'), fontSize: 11, color: '#ef444488', borderColor: '#ef444422', width: '100%' }}
          onClick={async () => {
            if (!window.confirm('Delete this task? This cannot be undone.')) return
            try {
              await api.delete(`/api/exit-plan/tasks/${task.id}`)
              onClose()
              if (onRefresh) onRefresh()
            } catch (e) { console.error('Delete failed', e) }
          }}
        >🗑 Delete task</button>
      </div>

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

      {/* Attachments */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
          Attachments {attachments.length > 0 && `· ${attachments.length}`}
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, cursor: uploadingFile ? 'not-allowed' : 'pointer',
          padding: '7px 12px', border: '1px dashed var(--border)', borderRadius: 7,
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, userSelect: 'none',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
            style={{ display: 'none' }}
            disabled={uploadingFile}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadingFile(true)
              try {
                const fd = new FormData()
                fd.append('file', file)
                await api.post(`/api/exit-plan/tasks/${task.id}/attachments`, fd, {
                  headers: { 'Content-Type': 'multipart/form-data' }
                })
                reloadAttachments()
              } catch (err) {
                const msg = err?.response?.data?.detail || 'Upload failed'
                alert(msg)
              } finally {
                setUploadingFile(false)
                e.target.value = ''
              }
            }}
          />
          {uploadingFile ? '⏳ Uploading…' : '📎 Attach file (PDF, image, TXT · max 10 MB)'}
        </label>

        {loadingAttachments ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</div>
        ) : attachments.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No attachments yet.</div>
        ) : (
          attachments.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)', marginBottom: 6,
            }}>
              <span style={{ fontSize: 14 }}>
                {a.filename.match(/\.(jpg|jpeg|png|webp)$/i) ? '🖼' : a.filename.match(/\.pdf$/i) ? '📄' : '📝'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
                  {a.file_size ? (a.file_size < 1024 ? `${a.file_size} B` : `${(a.file_size / 1024).toFixed(1)} KB`) : ''} · {new Date(a.uploaded_at).toLocaleDateString()}
                </div>
              </div>
              <button
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', padding: '3px 8px', border: '1px solid var(--accent)', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }}
                onClick={async () => {
                  try {
                    const resp = await api.get(`/api/exit-plan/attachments/${a.id}/download`, { responseType: 'blob' })
                    const url = window.URL.createObjectURL(new Blob([resp.data]))
                    const link = document.createElement('a')
                    link.href = url
                    link.download = a.filename
                    link.click()
                    window.URL.revokeObjectURL(url)
                  } catch { alert('Download failed') }
                }}
              >↓</button>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef444488', fontSize: 13, padding: '2px 4px', flexShrink: 0 }}
                onClick={async () => {
                  if (!window.confirm('Delete this attachment?')) return
                  await api.delete(`/api/exit-plan/attachments/${a.id}`)
                  reloadAttachments()
                }}
              >✕</button>
            </div>
          ))
        )}
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

  const handleExport = async () => {
    try {
      const r = await api.get('/api/exit-plan/export', { responseType: 'blob' })
      const cd = r.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : 'exit_plan.json'
      const url = window.URL.createObjectURL(new Blob([r.data], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export failed. Check that you have an active plan.')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const hasPlan = mode === 'plan'
      const msg = hasPlan
        ? 'This will REPLACE your current exit plan and all progress with the imported one. Continue?'
        : 'Import this exit plan into your account?'
      if (!window.confirm(msg)) return
      await api.post('/api/exit-plan/import', payload)
      setLoading(true)
      setMode('loading')
      await loadPlan()
    } catch (err) {
      alert('Import failed — make sure the file is a valid exit plan export.')
    }
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
          <label style={{ ...btn('ghost'), marginTop: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} title="Restore a plan from a previous account">
            ⬆ Import Existing Plan
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
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
          <button style={{ ...btn('ghost'), fontSize: 11 }} onClick={handleExport} title="Download your exit plan as a JSON backup">⬇ Export</button>
          <label style={{ ...btn('ghost'), fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }} title="Import a previously exported plan">
            ⬆ Import
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
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
                onTaskAdded={loadPlan}
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
            onRefresh={() => loadPlan()}
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
