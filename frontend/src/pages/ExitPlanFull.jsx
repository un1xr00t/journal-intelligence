/**
 * ExitPlanFull.jsx — pages/ExitPlanFull.jsx
 * Full-screen Exit Plan workspace. No sidebar. 3-panel layout.
 * Opens from ExitPlan.jsx via "Open Full Workspace" button.
 * Shares all data with the main ExitPlan page (same API endpoints).
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

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

const BRANCH_LABELS = {
  children:  '👶 Children',
  financial: '💰 Financial',
  housing:   '🏠 Housing',
  pets:      '🐾 Pets',
  safety:    '🛡 Safety',
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
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 12px', borderRadius: 7, marginBottom: 6,
      background: resource.cat_color + '10',
      border: `1px solid ${resource.cat_color}28`,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{resource.cat_icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {resource.url ? (
            <a href={resource.url} target="_blank" rel="noopener noreferrer"
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



const card = (extra = {}) => ({
  background:   'var(--bg-card)',
  border:       '1px solid var(--border)',
  borderRadius: 10,
  padding:      '16px 18px',
  ...extra,
})

const pill = (color = 'var(--accent)') => ({
  display:       'inline-flex',
  alignItems:    'center',
  gap:           4,
  padding:       '2px 8px',
  borderRadius:  99,
  fontSize:      10,
  fontWeight:    600,
  background:    color + '22',
  color:         color,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace:    'nowrap',
})

const btn = (variant = 'primary', extra = {}) => ({
  padding:    '7px 16px',
  borderRadius: 7,
  fontSize:   12,
  fontWeight: 600,
  cursor:     'pointer',
  border:     variant === 'ghost' ? '1px solid var(--border)' : 'none',
  background: variant === 'primary' ? 'var(--accent)'
            : variant === 'danger'  ? '#ef4444'
            : variant === 'success' ? '#10b981'
            : 'transparent',
  color:      variant === 'ghost' ? 'var(--text-secondary)' : '#fff',
  fontFamily: 'DM Sans, sans-serif',
  transition: 'opacity 0.15s',
  ...extra,
})

// ── Progress ring ──────────────────────────────────────────────────────────────

function Ring({ value = 0, size = 40, stroke = 3, color = 'var(--accent)' }) {
  const r   = (size - stroke * 2) / 2
  const circ = 2 * Math.PI * r
  const dash = circ * Math.min(value, 1)
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={9}
        fill="var(--text-secondary)" fontFamily="IBM Plex Mono"
      >
        {Math.round(value * 100)}%
      </text>
    </svg>
  )
}

// ── Mini progress bar ──────────────────────────────────────────────────────────

function Bar({ value = 0, color = 'var(--accent)', height = 4, style = {} }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', height, ...style }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── Left panel: phase overview ─────────────────────────────────────────────────

function LeftPanel({ plan, selectedTask, onSelectTask }) {
  if (!plan) return null

  const allTasks = (plan.phases || []).flatMap(p =>
    (p.tasks || []).map(t => ({ ...t, phase_title: p.title }))
  )
  const total  = allTasks.length
  const done   = allTasks.filter(t => t.status === 'done').length
  const doing  = allTasks.filter(t => t.status === 'doing').length
  const crit   = allTasks.filter(t => t.priority === 'critical' && t.status !== 'done').length

  return (
    <div style={{
      width: 260, flexShrink: 0, overflowY: 'auto',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 0,
      background: 'rgba(0,0,0,0.12)',
    }}>
      {/* Overall stats */}
      <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
          Overall Progress
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <Ring value={plan.overall_progress || 0} size={52} stroke={4} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Syne' }}>
              {done}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>/{total}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>tasks complete</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {doing > 0 && (
            <span style={pill('#10b981')}>→ {doing} active</span>
          )}
          {crit > 0 && (
            <span style={pill('#ef4444')}>⚠ {crit} critical</span>
          )}
        </div>
      </div>

      {/* Branch signals */}
      {(plan.branches || []).length > 0 && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Active Signals
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(plan.branches || []).map(b => (
              <span key={b} style={pill('var(--text-secondary)')}>{BRANCH_LABELS[b] || b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Phases list */}
      <div style={{ padding: '14px 16px 0', flex: 1 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Phases
        </div>
        {(plan.phases || []).map(phase => {
          const pDone  = (phase.tasks || []).filter(t => t.status === 'done').length
          const pTotal = (phase.tasks || []).length
          const color  = phase.status === 'locked' ? 'var(--border)' : phase.status === 'completed' ? '#10b981' : 'var(--accent)'
          const isActive = phase.status === 'active'

          return (
            <div
              key={phase.id}
              style={{
                marginBottom: 4,
                borderRadius: 8,
                padding: '10px 12px',
                background: isActive ? 'rgba(99,102,241,0.07)' : 'transparent',
                border: isActive ? '1px solid rgba(99,102,241,0.18)' : '1px solid transparent',
                cursor: phase.status !== 'locked' ? 'default' : 'default',
                opacity: phase.status === 'locked' ? 0.5 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, color }}>
                  {phase.status === 'completed' ? '✓' : phase.status === 'locked' ? '🔒' : '→'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: phase.status === 'locked' ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {phase.title}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{pDone}/{pTotal}</span>
              </div>
              <Bar value={phase.progress || 0} color={color} height={3} />
            </div>
          )
        })}
      </div>

      {/* Quick task list — doing */}
      {doing > 0 && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            In Progress
          </div>
          {allTasks.filter(t => t.status === 'doing').map(t => (
            <div
              key={t.id}
              onClick={() => onSelectTask(t)}
              style={{
                fontSize: 11, color: 'var(--text-secondary)', padding: '6px 8px',
                borderRadius: 6, cursor: 'pointer', marginBottom: 2,
                background: selectedTask?.id === t.id ? 'rgba(99,102,241,0.1)' : 'transparent',
                borderLeft: `2px solid #10b981`,
                paddingLeft: 10,
              }}
            >
              {t.title}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Right panel: task detail ───────────────────────────────────────────────────

function RightPanel({ task, phase, onClose, onStatusChange, onRefresh }) {
  const [notes,     setNotes]     = useState([])
  const [noteText,  setNoteText]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [loading,   setLoading]   = useState(false)

  const loadNotes = useCallback(() => {
    if (!task) return
    setLoading(true)
    api.get(`/api/exit-plan/notes?task_id=${task.id}`)
      .then(r => setNotes(r.data.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [task?.id])

  useEffect(() => { loadNotes() }, [loadNotes])

  const submitNote = async () => {
    if (!noteText.trim()) return
    setSaving(true)
    try {
      await api.post('/api/exit-plan/notes', { task_id: task.id, note_text: noteText.trim() })
      setNoteText('')
      loadNotes()
      if (onRefresh) onRefresh()
    } finally { setSaving(false) }
  }

  const handleStatus = async (status) => {
    await onStatusChange(task.id, status)
  }

  if (!task) {
    return (
      <div style={{
        width: 340, flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>☰</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>Select a task to see<br />its details and notes here</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: 340, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      overflowY: 'auto',
      background: 'var(--bg-card)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, paddingRight: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 4 }}>
              {task.title}
            </div>
            {phase?.title && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>{phase.title}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ ...btn('ghost'), padding: '4px 9px', fontSize: 13, flexShrink: 0 }}
          >✕</button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={pill(PRIORITY_COLORS[task.priority])}>⚑ {task.priority}</span>
          <span style={pill()}>{STATUS_LABELS[task.status] || task.status}</span>
          {task.due_date && <span style={pill('#f59e0b')}>📅 {new Date(task.due_date).toLocaleDateString()}</span>}
        </div>
      </div>

      <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Description */}
        {task.description && (
          <div>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
              What to do
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
              {task.description}
            </div>
          </div>
        )}

        {/* Why it matters */}
        {task.why_it_matters && (
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Why this matters
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {task.why_it_matters}
            </div>
          </div>
        )}

        {/* Status actions */}
        {task.status !== 'done' && task.status !== 'skipped' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {task.status !== 'doing' && (
              <button style={btn('ghost')} onClick={() => handleStatus('doing')}>Start</button>
            )}
            <button style={btn('primary')} onClick={() => handleStatus('done')}>Mark Done ✓</button>
            <button
              style={{ ...btn('ghost'), color: 'var(--text-muted)', fontSize: 11 }}
              onClick={() => handleStatus('skipped')}
            >Skip</button>
          </div>
        )}
        {task.status === 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#10b981' }}>✓ Completed</span>
            <button style={{ ...btn('ghost'), fontSize: 11 }} onClick={() => handleStatus('backlog')}>Reopen</button>
          </div>
        )}

        {/* Delete task */}
        {(() => {
          const [deleting, setDeleting] = [false, () => {}]
          return null  // placeholder — handled via deleteBtn below
        })()}
        <div style={{ paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <button
            style={{ ...btn('ghost', { fontSize: 11, color: '#ef444488', borderColor: '#ef444422', width: '100%' }) }}
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

        {/* Resources */}
        {(() => {
          const resources = getTaskResources(task)
          if (resources.length === 0) return null
          return (
            <div>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                Resources for this step
              </div>
              {resources.map((r, i) => <ResourceChip key={i} resource={r} />)}
            </div>
          )
        })()}

        {/* Notes */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Notes {notes.length > 0 && `· ${notes.length}`}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a private note…"
              rows={2}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 12,
                resize: 'vertical', outline: 'none', fontFamily: 'DM Sans',
              }}
            />
            <button
              style={{ ...btn('primary'), alignSelf: 'flex-end', whiteSpace: 'nowrap', padding: '7px 12px' }}
              onClick={submitNote}
              disabled={saving || !noteText.trim()}
            >
              {saving ? '…' : 'Add'}
            </button>
          </div>

          {loading ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Loading…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes yet.</div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ ...card({ marginBottom: 8, padding: '10px 12px' }) }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.note_text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'IBM Plex Mono' }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Today tab ──────────────────────────────────────────────────────────────────

function TodayTab({ plan, onStatusChange, onSelectTask, selectedTaskId }) {
  const todayTaskIds = plan?.today_tasks || []
  const todayTasks = (plan?.phases || []).flatMap(p =>
    (p.tasks || [])
      .filter(t => todayTaskIds.includes(t.id))
      .map(t => ({ ...t, phase_title: p.title }))
  )

  if (todayTasks.length === 0) {
    return (
      <div style={{ ...card({ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, maxWidth: 500, margin: '0 auto' }) }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🎉</div>
        Nothing pressing today — mark some tasks as In Progress to see them here.
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'IBM Plex Mono' }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      {todayTasks.map(task => {
        const isSelected = selectedTaskId === task.id
        return (
          <div
            key={task.id}
            style={{
              ...card({
                marginBottom: 10,
                borderLeft: `3px solid ${PRIORITY_COLORS[task.priority] || '#6366f1'}`,
                cursor: 'pointer',
                outline: isSelected ? '2px solid var(--accent)' : 'none',
                outlineOffset: -1,
              })
            }}
            onClick={() => onSelectTask(task)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{task.title}</span>
                  <span style={pill(PRIORITY_COLORS[task.priority])}>{task.priority}</span>
                  {task.status === 'doing' && <span style={pill('#10b981')}>In Progress</span>}
                </div>
                {task.phase_title && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>{task.phase_title}</div>
                )}
                {task.due_date && (
                  <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>
                    Due {new Date(task.due_date).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {task.status !== 'doing' && task.status !== 'done' && (
                  <button
                    style={{ ...btn('ghost', { padding: '5px 12px', fontSize: 11 }) }}
                    onClick={e => { e.stopPropagation(); onStatusChange(task.id, 'doing') }}
                  >Start</button>
                )}
                {task.status !== 'done' && (
                  <button
                    style={{ ...btn('primary', { padding: '5px 12px', fontSize: 11 }) }}
                    onClick={e => { e.stopPropagation(); onStatusChange(task.id, 'done') }}
                  >Done ✓</button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Phases tab ─────────────────────────────────────────────────────────────────

function PhasesTab({ phases, onSelectTask, selectedTaskId, onRefresh }) {
  const [open,         setOpen]         = useState(() => {
    const active = phases.find(p => p.status === 'active')
    return active ? { [active.id]: true } : {}
  })
  const [addingFor,    setAddingFor]    = useState(null)
  const [newTitle,     setNewTitle]     = useState('')
  const [newPriority,  setNewPriority]  = useState('normal')
  const [aiEnrich,     setAiEnrich]     = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [enrichingIds, setEnrichingIds] = useState(new Set())
  const [deletingIds,  setDeletingIds]  = useState(new Set())

  const toggle    = (id) => setOpen(o => ({ ...o, [id]: !o[id] }))
  const startAdd  = (pid) => { setAddingFor(pid); setNewTitle(''); setNewPriority('normal') }
  const cancelAdd = () => setAddingFor(null)

  const submitTask = async (phaseId, aiEnrich = true) => {
    if (!newTitle.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/api/exit-plan/tasks', { phase_id: phaseId, title: newTitle.trim(), priority: newPriority })
      const taskId = r.data.task_id
      setAddingFor(null)
      setNewTitle('')
      if (onRefresh) await onRefresh()
      // Fire AI enrichment in background — non-blocking
      setEnrichingIds(prev => new Set([...prev, taskId]))
      api.post(`/api/exit-plan/tasks/${taskId}/enrich`).then(() => {
        setEnrichingIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
        if (onRefresh) onRefresh()
      }).catch(() => {
        setEnrichingIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
      })
    } catch (e) { console.error('Failed to add task', e) }
    finally { setSaving(false) }
  }

  const deleteTask = async (taskId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setDeletingIds(prev => new Set([...prev, taskId]))
    try {
      await api.delete(`/api/exit-plan/tasks/${taskId}`)
      if (onRefresh) await onRefresh()
    } catch (err) { console.error('Failed to delete task', err) }
    finally { setDeletingIds(prev => { const s = new Set(prev); s.delete(taskId); return s }) }
  }

  const statusColor = { active: 'var(--accent)', locked: 'var(--text-muted)', completed: '#10b981' }

  return (
    <div>
      {phases.map(phase => (
        <div key={phase.id} style={{ ...card({ marginBottom: 10 }) }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggle(phase.id)}
          >
            <span style={{ fontSize: 14, color: statusColor[phase.status] || 'var(--text-muted)', width: 16, textAlign: 'center' }}>
              {phase.status === 'completed' ? '✓' : phase.status === 'locked' ? '🔒' : '→'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: phase.status === 'locked' ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 2 }}>
                Phase {phase.phase_order}: {phase.title}
              </div>
              {phase.description && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{phase.description}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', minWidth: 80 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                {Math.round((phase.progress || 0) * 100)}%
              </div>
              <Bar value={phase.progress || 0} height={3} style={{ width: 80 }} color={statusColor[phase.status] || 'var(--border)'} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4, width: 12 }}>
              {open[phase.id] ? '▲' : '▼'}
            </span>
          </div>

          {phase.status === 'locked' && !open[phase.id] && (
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
              🔒 Unlocks when Phase {phase.phase_order - 1} reaches {(() => { const t = parseFloat(phase.unlock_threshold) || 0.5; return Math.round((t > 1 ? t / 100 : t) * 100) })()} %
            </div>
          )}

          {open[phase.id] && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              {(phase.tasks || []).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No tasks yet.</div>
              ) : (
                (phase.tasks || []).map(task => {
                  const isSelected   = selectedTaskId === task.id
                  const isEnriching  = enrichingIds.has(task.id)
                  const isDeleting   = deletingIds.has(task.id)
                  return (
                    <div
                      key={task.id}
                      onClick={() => phase.status !== 'locked' && onSelectTask(task, phase)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 7, marginBottom: 2,
                        cursor: phase.status !== 'locked' ? 'pointer' : 'default',
                        opacity: (task.status === 'skipped' || isDeleting) ? 0.4 : 1,
                        background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                        border: isSelected ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        transition: 'background 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 12, color: task.status === 'done' ? '#10b981' : PRIORITY_COLORS[task.priority] || 'var(--text-muted)', width: 14, textAlign: 'center', flexShrink: 0 }}>
                        {task.status === 'done' ? '✓' : task.status === 'doing' ? '→' : task.status === 'skipped' ? '⊘' : '○'}
                      </span>
                      <span style={{
                        fontSize: 12, flex: 1,
                        color:          task.status === 'done' ? 'var(--text-muted)' : 'var(--text-secondary)',
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
                      {task.note_count > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>📝 {task.note_count}</span>
                      )}
                      {task.priority !== 'normal' && (
                        <span style={{ ...pill(PRIORITY_COLORS[task.priority]), fontSize: 9, flexShrink: 0 }}>{task.priority}</span>
                      )}
                      {phase.status !== 'locked' && !isDeleting && (
                        <button
                          onClick={(e) => deleteTask(task.id, e)}
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

              {/* Add Task UI — only for unlocked phases */}
              {phase.status !== 'locked' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.07)' }}>
                  {addingFor === phase.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        autoFocus
                        value={newTitle}
                        onChange={e => setNewTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submitTask(phase.id, aiEnrich); if (e.key === 'Escape') cancelAdd() }}
                        placeholder="Task title — AI will write the details…"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--accent)',
                          borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)',
                          fontSize: 12, outline: 'none', fontFamily: 'DM Sans',
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Priority:</span>
                        {['critical','high','normal','low'].map(p => (
                          <button key={p} onClick={() => setNewPriority(p)} style={{
                            padding: '3px 9px', borderRadius: 99, fontSize: 10, fontWeight: 600,
                            cursor: 'pointer', border: 'none', fontFamily: 'DM Sans',
                            background: newPriority === p ? (PRIORITY_COLORS[p] || 'var(--accent)') + '33' : 'rgba(255,255,255,0.04)',
                            color: newPriority === p ? (PRIORITY_COLORS[p] || 'var(--accent)') : 'var(--text-muted)',
                            outline: newPriority === p ? `1px solid ${(PRIORITY_COLORS[p] || 'var(--accent)')}55` : 'none',
                          }}>{p}</button>
                        ))}
                      {/* AI / manual toggle */}
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{ width: '100%', marginTop: 4, marginBottom: 2 }}
                      >
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
                        <div style={{ flex: 1 }} />
                        <button
                          style={{ ...btn('primary', { padding: '4px 12px', fontSize: 11 }) }}
                          onClick={() => submitTask(phase.id)}
                          disabled={saving || !newTitle.trim()}
                        >{saving ? '…' : aiEnrich ? 'Add + AI Fill' : 'Add Task'}</button>
                        <button style={{ ...btn('ghost', { padding: '4px 10px', fontSize: 11 }) }} onClick={cancelAdd}>Cancel</button>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        ✨ AI will generate: what to do, why it matters, and resources
                      </div>
                    </div>
                  ) : (
                    <button
                      style={{
                        width: '100%', padding: '6px 0', borderRadius: 6,
                        background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)',
                        color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.color = 'var(--accent)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                      onClick={() => { startAdd(phase.id); setOpen(o => ({ ...o, [phase.id]: true })) }}
                    >+ Add your own task</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Kanban tab ─────────────────────────────────────────────────────────────────

function KanbanTab({ phases, onSelectTask, selectedTaskId, onStatusChange }) {
  const COLS = ['backlog', 'next', 'doing', 'done']
  const allTasks = phases.flatMap(p =>
    (p.tasks || []).map(t => ({ ...t, phase_title: p.title, phase_status: p.status }))
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
      {COLS.map(col => {
        const colTasks = allTasks.filter(t => t.status === col)
        return (
          <div key={col}>
            <div style={{
              fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em',
              color: col === 'doing' ? '#10b981' : col === 'done' ? '#6b7280' : 'var(--text-muted)',
              textTransform: 'uppercase', marginBottom: 12, paddingBottom: 8,
              borderBottom: `2px solid ${col === 'doing' ? '#10b981' : col === 'done' ? '#374151' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>{STATUS_LABELS[col]}</span>
              <span style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 99, padding: '1px 7px' }}>{colTasks.length}</span>
            </div>
            {colTasks.map(task => {
              const isSelected = selectedTaskId === task.id
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  style={{
                    ...card({
                      marginBottom: 8, cursor: 'pointer', padding: '10px 12px',
                      borderLeft: `2px solid ${PRIORITY_COLORS[task.priority] || 'var(--border)'}`,
                      outline: isSelected ? '2px solid var(--accent)' : 'none',
                      outlineOffset: -1,
                      transition: 'background 0.12s',
                    })
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{task.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>{task.phase_title}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {task.priority !== 'normal' && (
                      <span style={{ ...pill(PRIORITY_COLORS[task.priority]), fontSize: 9 }}>{task.priority}</span>
                    )}
                    {task.due_date && (
                      <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: 'IBM Plex Mono' }}>
                        {new Date(task.due_date).toLocaleDateString()}
                      </span>
                    )}
                    {task.note_count > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>📝</span>}
                  </div>
                  {col !== 'done' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      {col !== 'doing' && (
                        <button
                          style={{ ...btn('ghost', { padding: '3px 9px', fontSize: 10 }) }}
                          onClick={e => { e.stopPropagation(); onStatusChange(task.id, 'doing') }}
                        >Start</button>
                      )}
                      <button
                        style={{ ...btn('primary', { padding: '3px 9px', fontSize: 10 }) }}
                        onClick={e => { e.stopPropagation(); onStatusChange(task.id, 'done') }}
                      >Done</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Notes tab ──────────────────────────────────────────────────────────────────

function NotesTab({ planId }) {
  const [notes,   setNotes]   = useState([])
  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(() => {
    if (!planId) return
    api.get('/api/exit-plan/notes')
      .then(r => setNotes(r.data.notes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [planId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      await api.post('/api/exit-plan/notes', { note_text: text.trim() })
      setText('')
      load()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
        A private scratchpad attached to this plan. No AI reads this — it's purely for you.
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a note…"
          rows={4}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 13,
            resize: 'vertical', outline: 'none', fontFamily: 'DM Sans', lineHeight: 1.7,
          }}
        />
        <button
          style={{ ...btn('primary', { alignSelf: 'flex-end', whiteSpace: 'nowrap', padding: '8px 18px' }) }}
          onClick={submit}
          disabled={saving || !text.trim()}
        >
          {saving ? '…' : 'Save Note'}
        </button>
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
      ) : notes.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No plan-level notes yet.</div>
      ) : (
        notes.map(n => (
          <div key={n.id} style={{ ...card({ marginBottom: 12 }) }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{n.note_text}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, fontFamily: 'IBM Plex Mono' }}>
              {new Date(n.created_at).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Update modal ───────────────────────────────────────────────────────────────

function UpdateModal({ updates, onApply, onDismiss }) {
  const [selected, setSelected] = useState(() => updates.proposed_changes.map((_, i) => i))
  const toggle = (i) => setSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
      <div style={{ ...card({ maxWidth: 540, width: '90%', maxHeight: '80vh', overflowY: 'auto' }) }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Plan Update Available</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Your journal has new signals. Review suggested changes — you control what gets applied.
        </div>
        {updates.proposed_changes.map((change, i) => (
          <div
            key={i}
            style={{ ...card({ marginBottom: 10, padding: '12px 14px', borderColor: selected.includes(i) ? 'var(--accent)' : 'var(--border)', cursor: 'pointer' }) }}
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
                {change.reason && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{change.reason}</div>}
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

// ── Create plan flow (embedded) ────────────────────────────────────────────────

function CreatePlanFlow({ detectData, onCreated, onDismiss }) {
  const [confirmed,   setConfirmed]   = useState([])
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState(null)

  const BRANCH_META = {
    children:  '👶 Children involved',
    financial: '💰 Financial dependence',
    housing:   '🏠 Housing concerns',
    pets:      '🐾 Pets',
    safety:    '🛡 Safety concern',
  }

  const toggleConfirm = (b) => setConfirmed(c => c.includes(b) ? c.filter(x => x !== b) : [...c, b])

  const handleBuild = async () => {
    setGenerating(true); setError(null)
    try {
      await api.post('/api/exit-plan/generate', { force: false, confirmed_branches: confirmed })
      onCreated()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Generation failed — try again')
      setGenerating(false)
    }
  }

  const detected  = detectData?.detected_signals || []
  const toggles   = detectData?.confirm_toggles  || []

  return (
    <div style={{ maxWidth: 580, margin: '40px auto' }}>
      <div style={{ ...card({ padding: '32px 36px' }) }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, fontFamily: 'Syne' }}>
          🗺 Your Exit Plan
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
          We'll build a step-by-step plan based on what your journal has shown us. Nothing gets shared. This lives only here, private to you.
        </div>

        {detected.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Detected signals</div>
            {detected.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ color: '#10b981', fontSize: 12 }}>✓</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{s.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}

        {toggles.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Does any of this apply? (optional)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {toggles.map(branch => (
                <button
                  key={branch}
                  onClick={() => toggleConfirm(branch)}
                  style={{
                    padding: '7px 16px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                    border: '1px solid var(--border)', fontFamily: 'DM Sans',
                    background: confirmed.includes(branch) ? 'var(--accent)' : 'transparent',
                    color:      confirmed.includes(branch) ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {BRANCH_META[branch] || branch}
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

// ── Support Network tab (manual contact book) ───────────────────────────────

const ROLE_OPTIONS = ['Therapist', 'Lawyer', 'Family', 'Friend', 'Doctor', 'Advocate', 'Other']

function ContactCard({ contact, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 18px', marginBottom: 10,
      display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {contact.role === 'Therapist' ? '🧠' : contact.role === 'Lawyer' ? '⚖️' : contact.role === 'Doctor' ? '🩺' : '👤'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{contact.name}</span>
          {contact.role && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 99,
              background: 'rgba(99,102,241,0.15)', color: 'var(--accent)',
              fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{contact.role}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              📞 {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              ✉️ {contact.email}
            </a>
          )}
          {contact.address && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>📍 {contact.address}</span>
          )}
        </div>
        {contact.notes && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>
            {contact.notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onEdit(contact)}
          style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >Edit</button>
        {confirming ? (
          <button
            onClick={() => { setConfirming(false); onDelete(contact.id) }}
            style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid #ef444444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
          >Confirm</button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            style={{ padding: '5px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
          >✕</button>
        )}
      </div>
    </div>
  )
}

const BLANK_FORM = { name: '', role: '', phone: '', email: '', address: '', notes: '' }

function ContactFormModal({ contact, onSave, onClose }) {
  const [form, setForm] = useState(contact ? { ...contact } : { ...BLANK_FORM })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 7, padding: '8px 11px', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'DM Sans',
  }
  const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 299 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 300, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '24px 26px', width: 420, maxWidth: '92vw',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
          {contact ? 'Edit Contact' : 'Add Contact'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="">Select role…</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="555-555-5555" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@example.com" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Address</label>
            <input style={inputStyle} value={form.address} onChange={e => set('address', e.target.value)} placeholder="City, State or full address" />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical' }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Office hours, meeting instructions, anything helpful…"
              rows={2}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !form.name.trim()}
            style={{ padding: '8px 18px', fontSize: 12, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: (saving || !form.name.trim()) ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

function NetworkTab() {
  const [contacts,   setContacts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [editTarget, setEditTarget] = useState(null)

  const load = async () => {
    try {
      const r = await api.get('/api/exit-plan/contacts')
      setContacts(r.data.contacts || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    if (editTarget) {
      await api.patch(`/api/exit-plan/contacts/${editTarget.id}`, form)
    } else {
      await api.post('/api/exit-plan/contacts', form)
    }
    setShowModal(false)
    setEditTarget(null)
    load()
  }

  const handleEdit = (contact) => {
    setEditTarget(contact)
    setShowModal(true)
  }

  const handleDelete = async (id) => {
    await api.delete(`/api/exit-plan/contacts/${id}`)
    load()
  }

  const openAdd = () => {
    setEditTarget(null)
    setShowModal(true)
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>👥 Support Network</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            People you can count on — therapist, lawyer, trusted friends and family.
            This is private and never connected to your journal entries.
          </div>
        </div>
        <button
          onClick={openAdd}
          style={{ padding: '8px 16px', fontSize: 12, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          + Add Person
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Loading…</div>
      ) : contacts.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px dashed var(--border)',
          borderRadius: 10, padding: '32px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>👥</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            No contacts yet.<br />
            Add your therapist, lawyer, or anyone you trust during this transition.
          </div>
          <button
            onClick={openAdd}
            style={{ marginTop: 16, padding: '9px 20px', fontSize: 12, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Add First Contact
          </button>
        </div>
      ) : (
        contacts.map(c => (
          <ContactCard key={c.id} contact={c} onEdit={handleEdit} onDelete={handleDelete} />
        ))
      )}

      {showModal && (
        <ContactFormModal
          contact={editTarget}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditTarget(null) }}
        />
      )}
    </div>
  )
}


// ── Main component ─────────────────────────────────────────────────────────────

export default function ExitPlanFull() {
  const navigate = useNavigate()

  const [loading,       setLoading]       = useState(true)
  const [plan,          setPlan]          = useState(null)
  const [detectData,    setDetectData]    = useState(null)
  const [mode,          setMode]          = useState('loading')
  const [activeTab,     setActiveTab]     = useState('today')
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
    } catch {
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
      if (selectedTask?.id === taskId) {
        setSelectedTask(prev => prev ? { ...prev, status } : null)
      }
    } catch (e) {
      console.error('Status update failed', e)
    }
  }

  const handleSelectTask = (task, phase) => {
    if (selectedTask?.id === task.id) {
      setSelectedTask(null); setSelectedPhase(null)
    } else {
      setSelectedTask(task); setSelectedPhase(phase || null)
    }
  }

  const handleCheckUpdates = async () => {
    setCheckingUp(true)
    try {
      const r = await api.post('/api/exit-plan/check-updates', { apply: false })
      if (r.data.update_available && r.data.proposed_changes?.length > 0) {
        setUpdateData(r.data); setShowUpdate(true)
      } else {
        alert('Your plan is up to date.')
        await loadPlan()
      }
    } catch {} finally { setCheckingUp(false) }
  }

  const handleApplyUpdates = async () => {
    try {
      await api.post('/api/exit-plan/check-updates', { apply: true })
      setShowUpdate(false); setUpdateData(null)
      await loadPlan()
    } catch {}
  }

  const handleDeletePlan = async () => {
    if (!window.confirm('Delete your exit plan and all progress? This cannot be undone.')) return
    try {
      await api.delete('/api/exit-plan')
      setPlan(null); setMode('no_plan')
    } catch {}
  }

  const TABS = [
    { id: 'today',   label: 'Today',      count: (plan?.today_tasks || []).length },
    { id: 'phases',  label: 'Phases' },
    { id: 'kanban',  label: 'Kanban' },
    { id: 'notes',   label: 'Notes' },
    { id: 'network', label: '👥 Support Network' },
  ]

  // ── Header bar (always rendered) ─────────────────────────────────────────────

  const Header = () => (
    <div style={{
      height: 56, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-card)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Syne', whiteSpace: 'nowrap' }}>
          🗺 Exit Plan Workspace
        </div>
        {plan && (
          <>
            <span style={pill()}>{PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Overall</span>
              <Bar value={plan.overall_progress || 0} style={{ width: 100 }} height={5} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                {Math.round((plan.overall_progress || 0) * 100)}%
              </span>
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {plan?.update_available && (
          <button
            style={{ ...btn('ghost', { color: '#f59e0b', borderColor: '#f59e0b44', fontSize: 11 }) }}
            onClick={handleCheckUpdates}
            disabled={checkingUp}
          >
            {checkingUp ? '…' : '⚠ Updates available'}
          </button>
        )}
        {plan && (
          <>
            <button style={{ ...btn('ghost', { fontSize: 11 }) }} onClick={() => setMode('create')}>Regenerate</button>
            <button style={{ ...btn('ghost', { fontSize: 11, color: '#ef4444', borderColor: '#ef444433' }) }} onClick={handleDeletePlan}>Delete</button>
          </>
        )}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
        <button
          onClick={() => navigate('/exit-plan')}
          style={{
            display:      'flex', alignItems: 'center', gap: 6,
            padding:      '6px 14px', borderRadius: 7,
            background:   'rgba(255,255,255,0.05)',
            border:       '1px solid var(--border)',
            color:        'var(--text-secondary)', fontSize: 12,
            cursor:       'pointer', fontFamily: 'DM Sans',
            transition:   'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          ← Exit to Dashboard
        </button>
      </div>
    </div>
  )

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        <Header />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>Loading…</div>
        </div>
      </div>
    )
  }

  // ── No plan ───────────────────────────────────────────────────────────────────

  if (mode === 'no_plan') {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        <Header />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...card({ padding: '36px 44px', maxWidth: 520, textAlign: 'center' }) }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10, fontFamily: 'Syne' }}>
              🗺 You don't have a plan yet.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
              Build a personalized step-by-step plan tailored to your situation. It adapts to what your journal already knows about you.
            </div>
            <button style={btn('primary')} onClick={() => setMode('create')}>Create My Plan</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Create flow ───────────────────────────────────────────────────────────────

  if (mode === 'create') {
    return (
      <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        <Header />
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          <CreatePlanFlow
            detectData={detectData}
            onCreated={() => { setMode('loading'); setLoading(true); loadPlan() }}
            onDismiss={() => setMode(plan ? 'plan' : 'no_plan')}
          />
        </div>
      </div>
    )
  }

  // ── Active plan — 3-panel layout ──────────────────────────────────────────────

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <Header />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel */}
        <LeftPanel
          plan={plan}
          selectedTask={selectedTask}
          onSelectTask={t => handleSelectTask(t)}
        />

        {/* Center: tabs + content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', gap: 0, padding: '0 24px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.1)',
            flexShrink: 0,
          }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding:      '10px 20px',
                  background:   'transparent',
                  border:       'none',
                  cursor:       'pointer',
                  fontSize:     12,
                  fontWeight:   activeTab === t.id ? 700 : 400,
                  color:        activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  fontFamily:   'DM Sans',
                  transition:   'color 0.15s',
                  display:      'flex', alignItems: 'center', gap: 6,
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{
                    background: 'var(--accent)', color: '#fff',
                    borderRadius: 99, fontSize: 9, fontWeight: 700,
                    padding: '1px 6px', lineHeight: '14px',
                  }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {activeTab === 'today' && (
              <TodayTab
                plan={plan}
                onStatusChange={handleStatusChange}
                onSelectTask={handleSelectTask}
                selectedTaskId={selectedTask?.id}
              />
            )}
            {activeTab === 'phases' && (
              <PhasesTab
                phases={plan?.phases || []}
                onSelectTask={handleSelectTask}
                selectedTaskId={selectedTask?.id}
                onRefresh={loadPlan}
              />
            )}
            {activeTab === 'kanban' && (
              <KanbanTab
                phases={plan?.phases || []}
                onSelectTask={handleSelectTask}
                selectedTaskId={selectedTask?.id}
                onStatusChange={handleStatusChange}
              />
            )}
            {activeTab === 'notes' && (
              <NotesTab planId={plan?.id} />
            )}
            {activeTab === 'network' && (
              <NetworkTab />
            )}
          </div>
        </div>

        {/* Right panel: task detail */}
        <RightPanel
          task={selectedTask}
          phase={selectedPhase}
          onClose={() => { setSelectedTask(null); setSelectedPhase(null) }}
          onStatusChange={handleStatusChange}
          onRefresh={loadPlan}
        />
      </div>

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
