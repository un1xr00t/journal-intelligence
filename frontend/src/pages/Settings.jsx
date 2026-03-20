/**
 * Settings.jsx  —  frontend/src/pages/Settings.jsx
 * Tabbed settings page: Memory Profile, AI Preferences, Account, Sessions, Data.
 * Account tab now includes API Key management (reveal / copy / regenerate).
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import api from '../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────
const SITUATION_OPTS = [
  { id: 'relationship',  icon: '⚡', label: 'Relationship'     },
  { id: 'custody',       icon: '◎', label: 'Custody/Parenting' },
  { id: 'workplace',     icon: '⊞', label: 'Workplace'         },
  { id: 'housing',       icon: '⬡', label: 'Housing'           },
  { id: 'legal',         icon: '⊕', label: 'Legal Matter'      },
  { id: 'mental_health', icon: '〜', label: 'Mental Health'     },
  { id: 'growth',        icon: '◈', label: 'Personal Growth'   },
  { id: 'other',         icon: '✦', label: 'Something Else'    },
]
const TOPIC_OPTS = [
  'Anxiety','Sleep','Health','Work','Relationships','Family',
  'Money','Safety','Legal','Housing','Trauma','Boundaries',
  'Self-worth','Healing','Documentation','Growth','Addiction',
  'Children','Isolation','Identity',
]
const GOAL_OPTS = [
  { id: 'document',  icon: '◷', label: 'Document my experience'   },
  { id: 'patterns',  icon: '⬡', label: "Find patterns I'm missing" },
  { id: 'case_file', icon: '⊕', label: 'Build a case file'         },
  { id: 'mental',    icon: '〜', label: 'Track my mental health'    },
  { id: 'exit',      icon: '⚡', label: 'Plan a major life change'  },
  { id: 'process',   icon: '◎', label: 'Process my feelings'       },
  { id: 'evidence',  icon: '◈', label: 'Gather legal evidence'      },
  { id: 'heal',      icon: '✦', label: 'Grow and heal'             },
]
const TONE_OPTS = [
  { id: 'therapist',    icon: '◎', label: 'Therapist',    desc: 'Clinical, reflective, structured'  },
  { id: 'best_friend',  icon: '⚡', label: 'Best Friend',  desc: 'Warm, casual, validating'           },
  { id: 'coach',        icon: '⊕', label: 'Coach',        desc: 'Goal-focused, motivational'         },
  { id: 'mentor',       icon: '◈', label: 'Mentor',       desc: 'Wise, long-view perspective'        },
  { id: 'inner_critic', icon: '⬡', label: 'Inner Critic', desc: 'Challenging, honest, unfiltered'    },
  { id: 'chaos_agent',  icon: '✦', label: 'Chaos Agent',  desc: 'Unconventional, pattern-breaking'   },
]
const PRONOUN_OPTS = ['she/her', 'he/him', 'they/them', 'prefer not to say']

// ─── Micro components ─────────────────────────────────────────────────────────
const SectionTitle = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ color: 'var(--accent)', fontSize: 12 }}>{icon}</span>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15, color: 'rgba(255,255,255,0.88)', margin: 0 }}>{title}</h2>
    </div>
    {subtitle && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, paddingLeft: 20, fontFamily: "'IBM Plex Mono', monospace" }}>{subtitle}</p>}
  </div>
)

const Card = ({ children, style: sx = {} }) => (
  <div style={{
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: '22px 24px', marginBottom: 16, ...sx,
  }}>{children}</div>
)

const Label = ({ children }) => (
  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.12em', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>
)

const Spin = ({ s = 12 }) => (
  <span style={{ display: 'inline-block', width: s, height: s, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
)

const SaveBtn = ({ saving, saved, onClick, label = 'Save Changes' }) => (
  <button onClick={onClick} disabled={saving} style={{
    padding: '9px 20px', borderRadius: 8, fontSize: 12,
    fontWeight: 700, fontFamily: 'Syne, sans-serif', letterSpacing: '0.04em',
    cursor: saving ? 'not-allowed' : 'pointer',
    background: saved ? 'rgba(34,197,94,0.15)' : 'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))',
    border: saved ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent',
    color: saved ? '#4ade80' : '#fff', opacity: saving ? 0.6 : 1,
    transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
  }}>
    {saving ? <><Spin />Saving…</> : saved ? '✓ Saved' : label}
  </button>
)

function TInput({ val, set, placeholder, type = 'text', disabled }) {
  const [f, setF] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === 'password'
  const inputStyle = {
    width: '100%', padding: isPassword ? '9px 40px 9px 12px' : '9px 12px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${f && !disabled ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: 7, color: 'rgba(255,255,255,0.88)', fontSize: 13, outline: 'none',
    fontFamily: "'DM Sans', sans-serif", transition: 'border-color 0.2s',
    opacity: disabled ? 0.45 : 1,
  }
  if (!isPassword) {
    return (
      <input
        type={type} value={val || ''} onChange={e => set && set(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={inputStyle}
      />
    )
  }
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={showPw ? 'text' : 'password'} value={val || ''} onChange={e => set && set(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={() => setShowPw(v => !v)}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.8)'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
        aria-label={showPw ? 'Hide password' : 'Show password'}
      >
        {showPw ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  )
}

function TArea({ val, set, placeholder, rows = 3 }) {
  const [f, setF] = useState(false)
  return (
    <textarea
      value={val || ''} onChange={e => set(e.target.value)}
      placeholder={placeholder} rows={rows}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        width: '100%', padding: '9px 12px', boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${f ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 7, color: 'rgba(255,255,255,0.88)', fontSize: 13, outline: 'none',
        fontFamily: "'DM Sans', sans-serif", transition: 'border-color 0.2s',
        resize: 'vertical', lineHeight: 1.6,
      }}
    />
  )
}

function Pill({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
      fontFamily: "'DM Sans', sans-serif", fontWeight: active ? 600 : 400,
      background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
      border: active ? '1px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.07)',
      color: active ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.35)',
      transition: 'all 0.15s',
    }}>{children}</button>
  )
}

function StatusBadge({ type, msg }) {
  const palettes = {
    error:   { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)',  text: '#f87171' },
    success: { bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)',  text: '#4ade80' },
    info:    { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', text: '#818cf8' },
    warning: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.22)',  text: '#fbbf24' },
  }
  const c = palettes[type] || palettes.info
  return (
    <div style={{ fontSize: 11, padding: '8px 12px', borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, color: c.text, marginTop: 10 }}>
      {msg}
    </div>
  )
}

// ─── Memory Section ───────────────────────────────────────────────────────────
function MemorySection({ memory, onSaved }) {
  const [form, setForm]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')
  const [newPerson, setNewPerson] = useState({ name: '', role: '' })
  const [customTopic, setCustomTopic] = useState('')

  useEffect(() => { if (memory) setForm({ ...memory }) }, [memory])

  const upd = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSaved(false) }
  const toggleList = (key, item) => {
    const cur = form[key] || []
    upd(key, cur.includes(item) ? cur.filter(x => x !== item) : [...cur, item])
  }
  const addPerson = () => {
    if (!newPerson.name.trim()) return
    upd('people', [...(form.people || []), { ...newPerson }])
    setNewPerson({ name: '', role: '' })
  }
  const removePerson = (i) => upd('people', (form.people || []).filter((_, idx) => idx !== i))

  const handleSave = async () => {
  setSaving(true); setError('')
  try {
    const { preferred_tone, ...profileOnly } = form;
    await api.patch('/api/memory', profileOnly)
    setSaved(true); onSaved?.()
    setTimeout(() => setSaved(false), 3000)
  } catch (e) {
    setError(e.response?.data?.detail || 'Failed to save memory profile')
  } finally { setSaving(false) }
}

  if (!form) return (
    <Card><div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.22)', fontSize: 12 }}><Spin />Loading memory profile…</div></Card>
  )

  return (
    <>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 0 }}>
          <div>
            <Label>Preferred Name</Label>
            <TInput val={form.preferred_name} set={v => upd('preferred_name', v)} placeholder="What should AI call you?" />
          </div>
          <div>
            <Label>Pronouns</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingTop: 2 }}>
              {PRONOUN_OPTS.map(p => (
                <Pill key={p} active={form.pronouns === p} onClick={() => upd('pronouns', p)}>{p}</Pill>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Label>Situation Type</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {SITUATION_OPTS.map(s => (
            <Pill key={s.id} active={form.situation_type === s.id} onClick={() => upd('situation_type', s.id)}>
              {s.icon} {s.label}
            </Pill>
          ))}
        </div>
        <Label>Situation Story</Label>
        <TArea val={form.situation_story} set={v => upd('situation_story', v)} placeholder="Brief context for your AI — what's going on?" rows={3} />
      </Card>

      <Card>
        <Label>Focus Topics</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {[...TOPIC_OPTS, ...((form.topics || []).filter(t => !TOPIC_OPTS.includes(t)))].map(t => {
            const isCustom = !TOPIC_OPTS.includes(t)
            return (
              <Pill key={t} active={(form.topics || []).includes(t)} onClick={() => toggleList('topics', t)}
                style={isCustom ? { borderColor: 'rgba(139,92,246,0.4)', color: 'rgba(139,92,246,0.8)' } : {}}>
                {t}
              </Pill>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={customTopic}
            onChange={e => setCustomTopic(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = customTopic.trim()
                if (val && !(form.topics || []).includes(val)) toggleList('topics', val)
                setCustomTopic('')
              }
            }}
            placeholder="Add your own topic…"
            style={{
              flex: 1, padding: '7px 11px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 7, color: 'rgba(255,255,255,0.88)',
              fontSize: 12, outline: 'none',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent,#6366f1)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
          <button
            onClick={() => {
              const val = customTopic.trim()
              if (val && !(form.topics || []).includes(val)) toggleList('topics', val)
              setCustomTopic('')
            }}
            style={{
              padding: '7px 13px',
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 7, color: 'var(--accent,#6366f1)',
              fontSize: 18, lineHeight: 1, cursor: 'pointer', flexShrink: 0,
            }}
          >+</button>
        </div>
      </Card>

      <Card>
        <Label>Goals</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {GOAL_OPTS.map(g => (
            <Pill key={g.id} active={(form.goals || []).includes(g.id)} onClick={() => toggleList('goals', g.id)}>
              {g.icon} {g.label}
            </Pill>
          ))}
        </div>
      </Card>

      <Card>
        <Label>Key People</Label>
        {(form.people || []).length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(form.people || []).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace", minWidth: 80 }}>{p.role || '—'}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 }}>{p.name}</span>
                <button onClick={() => removePerson(i)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <TInput val={newPerson.name} set={v => setNewPerson(p => ({ ...p, name: v }))} placeholder="Name" />
          <TInput val={newPerson.role} set={v => setNewPerson(p => ({ ...p, role: v }))} placeholder="Role (Partner, Therapist…)" />
          <button onClick={addPerson} style={{ padding: '9px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 7, color: '#818cf8', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add</button>
        </div>
      </Card>

      {form.ai_summary && (
        <Card style={{ borderColor: 'rgba(99,102,241,0.15)' }}>
          <Label>AI Context Summary</Label>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, margin: '0 0 8px' }}>{form.ai_summary}</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>Auto-generated — updates when you save.</p>
        </Card>
      )}

      {error && <StatusBadge type="error" msg={error} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
      </div>
    </>
  )
}

// ─── AI Preferences Section ───────────────────────────────────────────────────
function AIPrefsSection({ memory }) {
  const [tone, setTone]     = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

useEffect(() => { if (memory?.preferred_tone && tone === null) setTone(memory.preferred_tone) }, [memory])

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await api.patch('/api/memory', { preferred_tone: tone })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <Card>
      <Label>Default Reflection Tone</Label>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
        Voice used for therapist insights, pattern summaries, and daily reflections.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {TONE_OPTS.map(t => (
          <button key={t.id} onClick={() => { setTone(t.id); setSaved(false) }} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            background: tone === t.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
            border: tone === t.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 9, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 14, color: tone === t.id ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.3)' }}>{t.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: tone === t.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)', fontFamily: 'Syne, sans-serif' }}>{t.label}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace" }}>{t.desc}</div>
            </div>
            {tone === t.id && <span style={{ fontSize: 9, color: 'var(--accent,#818cf8)', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 4, padding: '2px 6px' }}>active</span>}
          </button>
        ))}
      </div>
      {error && <StatusBadge type="error" msg={error} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn saving={saving} saved={saved} onClick={handleSave} />
      </div>
    </Card>
  )
}

// ─── Auto Reflect Section ─────────────────────────────────────────────────────
function AutoReflectSection() {
  const [autoReflect, setAutoReflect] = useState(true)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [status, setStatus]           = useState(null)

  useEffect(() => {
    api.get('/api/settings/reflect-mode')
      .then(r => setAutoReflect(r.data.auto_reflect))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (val) => {
    setAutoReflect(val)
    setSaving(true)
    setStatus(null)
    try {
      await api.put('/api/settings/reflect-mode', { auto_reflect: val })
      setStatus({ type: 'success', msg: val
        ? 'Reflection will auto-generate when new entries are detected.'
        : 'Reflection will only generate when you click Refresh.'
      })
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Failed to save' })
      setAutoReflect(!val)
    } finally { setSaving(false) }
  }

  if (loading) return null

  return (
    <Card>
      <Label>Reflection on Page Load</Label>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 16, lineHeight: 1.6 }}>
        Each reflection call costs tokens. Auto mode generates when new entries are detected. Manual mode only generates when you click Refresh.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[
          { val: true,  icon: '⚡', label: 'Auto-generate', desc: 'Runs when new entries detected' },
          { val: false, icon: '◎', label: 'Manual only',    desc: 'Only on Refresh click' },
        ].map(opt => (
          <button
            key={String(opt.val)}
            onClick={() => !saving && handleToggle(opt.val)}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              background: autoReflect === opt.val ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
              border: '1px solid ' + (autoReflect === opt.val ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'),
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 3 }}>{opt.icon}</div>
            <div style={{ fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: 700, color: autoReflect === opt.val ? '#a5b4fc' : 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{opt.label}</div>
            <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>{opt.desc}</div>
          </button>
        ))}
      </div>
      {status && <StatusBadge type={status.type === 'success' ? 'success' : 'error'} msg={status.msg} />}
    </Card>
  )
}

// ─── AI Provider Section ──────────────────────────────────────────────────────
const PROVIDERS = [
  { id: 'anthropic',     icon: '✦', label: 'Anthropic Claude',   desc: 'Claude Sonnet / Opus / Haiku', needsUrl: false },
  { id: 'openai',        icon: '⊕', label: 'OpenAI',             desc: 'GPT-4o, GPT-4o-mini, etc.',   needsUrl: false },
  { id: 'openai_compat', icon: '⬡', label: 'OpenAI-compatible',  desc: 'OpenRouter, Groq, Together…', needsUrl: true  },
  { id: 'local',         icon: '◈', label: 'Local Model',        desc: 'Ollama, LM Studio, etc.',      needsUrl: true  },
]

function AIProviderSection() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)

  // form state
  const [provider, setProvider] = useState('anthropic')
  const [apiKey, setApiKey]     = useState('')
  const [baseUrl, setBaseUrl]   = useState('')
  const [model, setModel]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [clearing, setClearing] = useState(false)
  const [status, setStatus]     = useState(null)

  const load = () => {
    setLoading(true)
    api.get('/api/settings/ai-provider')
      .then(r => {
        setSettings(r.data)
        setProvider(r.data.provider || 'anthropic')
        setBaseUrl(r.data.base_url || '')
        setModel(r.data.model || '')
        if (!r.data.has_key) setEditing(true)
      })
      .catch(() => setSettings({ provider: 'anthropic', has_key: false }))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const needsUrl = PROVIDERS.find(p => p.id === provider)?.needsUrl

  const handleSave = async () => {
    setSaving(true); setStatus(null)
    try {
      await api.put('/api/settings/ai-provider', {
        provider,
        api_key:  apiKey.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        model:    model.trim() || undefined,
      })
      setStatus({ type: 'success', msg: 'Settings saved.' })
      setApiKey(''); setEditing(false); load()
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Failed to save' })
    } finally { setSaving(false) }
  }

  const handleClear = async () => {
    setClearing(true); setStatus(null)
    try {
      await api.delete('/api/settings/ai-provider')
      setStatus({ type: 'success', msg: 'API key cleared.' })
      load(); setEditing(true)
    } catch { setStatus({ type: 'error', msg: 'Failed to clear' }) }
    setClearing(false)
  }

  if (loading) return null

  const provInfo = PROVIDERS.find(p => p.id === (settings?.provider || 'anthropic'))

  return (
    <Card style={{ marginBottom: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <Label>AI Provider</Label>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.5 }}>
            Your API key is stored on your server only — never leaves your instance.
          </p>
        </div>
        <span style={{
          fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", padding: '3px 8px', borderRadius: 4, flexShrink: 0, marginTop: 2,
          background: settings?.has_key ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
          border: settings?.has_key ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.2)',
          color: settings?.has_key ? '#4ade80' : '#f87171',
        }}>
          {settings?.has_key ? '✓ configured' : '✕ not set'}
        </span>
      </div>

      {/* Current config summary (non-editing) */}
      {!editing && settings?.has_key && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9 }}>
          <span style={{ fontSize: 14, color: 'var(--accent)' }}>{provInfo?.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontFamily: 'Syne, sans-serif' }}>{provInfo?.label}</div>
            <code style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.3)' }}>
              {settings.preview}
              {settings.base_url && <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.2)' }}>· {settings.base_url}</span>}
              {settings.model && <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.2)' }}>· {settings.model}</span>}
            </code>
          </div>
          <button onClick={() => setEditing(true)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: 'rgba(255,255,255,0.4)' }}>
            ↻ Change
          </button>
          <button onClick={handleClear} disabled={clearing} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 600, cursor: 'pointer', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}>
            {clearing ? '…' : '✕'}
          </button>
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div>
          {/* Provider picker */}
          <Label>Provider</Label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14, marginTop: 6 }}>
            {PROVIDERS.map(p => (
              <button key={p.id} onClick={() => setProvider(p.id)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                background: provider === p.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                border: provider === p.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 13, color: provider === p.id ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}>{p.icon}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: provider === p.id ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontFamily: 'Syne, sans-serif' }}>{p.label}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: "'IBM Plex Mono', monospace" }}>{p.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {/* API Key */}
          <div style={{ marginBottom: needsUrl ? 10 : 14 }}>
            <Label>API Key {!settings?.has_key ? '' : '(leave blank to keep existing)'}</Label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={
                provider === 'anthropic' ? 'sk-ant-api03-...' :
                provider === 'openai'    ? 'sk-proj-...' :
                provider === 'local'     ? 'optional (some local servers need none)' :
                'your-api-key'
              }
              style={{
                width: '100%', padding: '9px 12px', fontSize: 12, boxSizing: 'border-box',
                fontFamily: "'IBM Plex Mono', monospace",
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'rgba(255,255,255,0.7)', outline: 'none', marginTop: 4,
              }}
            />
          </div>

          {/* Base URL (openai_compat / local) */}
          {needsUrl && (
            <div style={{ marginBottom: 14 }}>
              <Label>Base URL {provider === 'local' ? '(default: http://localhost:11434/v1)' : '(required)'}</Label>
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder={provider === 'local' ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1'}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 12, boxSizing: 'border-box',
                  fontFamily: "'IBM Plex Mono', monospace",
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, color: 'rgba(255,255,255,0.7)', outline: 'none', marginTop: 4,
                }}
              />
            </div>
          )}

          {/* Model override */}
          <div style={{ marginBottom: 14 }}>
            <Label>Model Override <span style={{ color: 'rgba(255,255,255,0.18)' }}>(optional — uses provider default if blank)</span></Label>
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={
                provider === 'anthropic' ? 'claude-sonnet-4-5' :
                provider === 'openai'    ? 'gpt-4o-mini' :
                provider === 'local'     ? 'llama3' : 'model-name'
              }
              style={{
                width: '100%', padding: '9px 12px', fontSize: 12, boxSizing: 'border-box',
                fontFamily: "'IBM Plex Mono', monospace",
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'rgba(255,255,255,0.7)', outline: 'none', marginTop: 4,
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '8px 18px', borderRadius: 7, fontSize: 11, fontFamily: 'Syne, sans-serif',
              fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#818cf8', opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {saving ? <><Spin s={10} /> Saving…</> : '⊕ Save'}
            </button>
            {settings?.has_key && (
              <button onClick={() => { setEditing(false); setApiKey(''); setStatus(null) }} style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 10, fontFamily: 'Syne, sans-serif',
                fontWeight: 600, cursor: 'pointer', background: 'none',
                border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)',
              }}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {status && <StatusBadge type={status.type} msg={status.msg} style={{ marginTop: 10 }} />}

      {!settings?.has_key && (
        <div style={{ marginTop: 10, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: '#f87171', lineHeight: 1.6 }}>
          ✕ AI features (reflections, pattern analysis, exit plan) will not work until a key is saved.
        </div>
      )}
    </Card>
  )
}

// ─── API Key Card ─────────────────────────────────────────────────────────────
function ApiKeyCard() {
  const [info, setInfo]         = useState(null)   // {has_key, prefix}
  const [loading, setLoading]   = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [newKey, setNewKey]     = useState(null)   // full key shown once after regenerate
  const [copied, setCopied]     = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenStatus, setRegenStatus]   = useState(null)

  useEffect(() => {
    api.get('/api/auth/api-key')
      .then(r => setInfo(r.data))
      .catch(() => setInfo({ has_key: false, prefix: null }))
      .finally(() => setLoading(false))
  }, [])

  const copyKey = async (key) => {
    await navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const handleRegenerate = async () => {
    if (!confirmRegen) { setConfirmRegen(true); return }
    setRegenerating(true); setRegenStatus(null); setConfirmRegen(false)
    try {
      const r = await api.post('/api/auth/api-key/regenerate')
      setNewKey(r.data.api_key)
      setInfo({ has_key: true, prefix: r.data.prefix })
      setRegenStatus({ type: 'success', msg: 'New key generated. Copy it now — it won\'t be shown again.' })
    } catch (e) {
      setRegenStatus({ type: 'error', msg: e.response?.data?.detail || 'Failed to regenerate key' })
    } finally { setRegenerating(false) }
  }

  const maskedExisting = info?.prefix
    ? `${info.prefix}${'•'.repeat(28)}`
    : '—'

  if (loading) return (
    <Card>
      <Label>API Key</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.22)', fontSize: 12 }}><Spin s={11} />Loading…</div>
    </Card>
  )

  return (
    <Card style={{ borderColor: newKey ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>API Key</Label>
        <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>iPhone Shortcut</span>
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginBottom: 16, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
        Used in the <code style={{ color: 'rgba(99,102,241,0.8)' }}>X-API-Key</code> header when uploading entries from your iPhone Shortcut.
      </p>

      {/* Show new key if just regenerated */}
      {newKey ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(234,179,8,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>⚠ New Key — Copy Now</div>
          <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 9, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <code style={{
              flex: 1, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
              color: '#a5b4fc',
              wordBreak: 'break-all', lineHeight: 1.5,
              userSelect: 'text',
            }}>
              {newKey}
            </code>
          </div>
          <button
            onClick={() => copyKey(newKey)}
            style={{
              width: '100%', padding: '8px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              fontFamily: 'Syne, sans-serif', cursor: 'pointer',
              background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)',
              border: copied ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(99,102,241,0.3)',
              color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)',
              transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {copied ? '✓ Copied!' : '⊕ Copy Key'}
          </button>
          <button
            onClick={() => setNewKey(null)}
            style={{ width: '100%', marginTop: 6, padding: '6px', background: 'none', border: 'none', fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', cursor: 'pointer' }}
          >
            I've saved it — dismiss
          </button>
        </div>
      ) : (
        /* Show existing key prefix (masked) */
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <code style={{
            flex: 1, fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
            color: 'rgba(255,255,255,0.4)',
          }}>
            {info?.has_key ? maskedExisting : 'No key generated'}
          </code>
          {info?.has_key && (
            <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
              (prefix only)
            </span>
          )}
        </div>
      )}

      {/* Regenerate section */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14 }}>
        <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.22)', marginBottom: 10, lineHeight: 1.6 }}>
          {confirmRegen
            ? '⚠ This will invalidate your current key. Your iPhone Shortcut will stop working until you update it.'
            : info?.has_key
              ? 'Lost your key? Generate a new one — the old one will stop working immediately.'
              : 'No API key found. Generate one to enable iPhone Shortcut uploads.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {confirmRegen && (
            <button
              onClick={() => setConfirmRegen(false)}
              style={{ padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            style={{
              padding: '8px 18px', borderRadius: 7, fontSize: 11, fontWeight: 700,
              fontFamily: 'Syne, sans-serif', cursor: regenerating ? 'not-allowed' : 'pointer',
              background: confirmRegen ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.1)',
              border: confirmRegen ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.25)',
              color: confirmRegen ? '#f87171' : 'rgba(255,255,255,0.55)',
              opacity: regenerating ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {regenerating ? <><Spin s={11} />Generating…</> : confirmRegen ? '⚠ Confirm Regenerate' : info?.has_key ? '↻ Regenerate Key' : '⊕ Generate Key'}
          </button>
        </div>
        {regenStatus && <StatusBadge type={regenStatus.type} msg={regenStatus.msg} />}
      </div>
    </Card>
  )
}


// ─── Security Questions Card ──────────────────────────────────────────────────
const SQ_BANK = [
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What was the make and model of your first car?",
  "What is the middle name of your oldest sibling?",
  "What street did you grow up on?",
  "What was the name of your childhood best friend?",
  "What is the name of the town where your nearest relative lives?",
  "What was your childhood nickname?",
  "What is the name of the hospital where you were born?",
  "What was the first concert you attended?",
]

function SecurityQuestionsCard() {
  const [phase, setPhase]       = useState('loading') // loading|idle|gate|form|saved
  const [hasQs, setHasQs]       = useState(false)
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [q1, setQ1] = useState(SQ_BANK[0])
  const [q2, setQ2] = useState(SQ_BANK[1])
  const [q3, setQ3] = useState(SQ_BANK[2])
  const [a1, setA1] = useState('')
  const [a2, setA2] = useState('')
  const [a3, setA3] = useState('')
  const [saving, setSaving]     = useState(false)
  const [status, setStatus]     = useState(null)

  useEffect(() => {
    api.get('/auth/security-questions/has-questions')
      .then(r => { setHasQs(r.data.has_questions); setPhase('idle') })
      .catch(() => setPhase('idle'))
  }, [])

  const usedQs = [q1, q2, q3]
  const opts = (self) => SQ_BANK.filter(q => q === self || !usedQs.includes(q))

  const handleVerifyPassword = async () => {
    if (!password.trim()) return
    setVerifying(true); setStatus(null)
    try {
      await api.post('/auth/verify-password', { password })
      setPhase('form')
      setPassword('')
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Incorrect password.' })
    } finally { setVerifying(false) }
  }

  const handleSave = async () => {
    if (!a1.trim() || !a2.trim() || !a3.trim()) {
      setStatus({ type: 'error', msg: 'Please answer all three questions.' }); return
    }
    if (new Set([q1, q2, q3]).size < 3) {
      setStatus({ type: 'error', msg: 'Please choose three different questions.' }); return
    }
    setSaving(true); setStatus(null)
    try {
      await api.post('/auth/security-questions/setup', {
        question_1: q1, answer_1: a1,
        question_2: q2, answer_2: a2,
        question_3: q3, answer_3: a3,
      })
      setHasQs(true)
      setPhase('saved')
      setA1(''); setA2(''); setA3('')
      setTimeout(() => setPhase('idle'), 3000)
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Failed to save.' })
    } finally { setSaving(false) }
  }

  const selectStyle = {
    width: '100%', padding: '9px 28px 9px 12px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 7, color: 'rgba(255,255,255,0.88)', fontSize: 12, outline: 'none',
    fontFamily: "'DM Sans', sans-serif", marginBottom: 6, appearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.28)'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  }

  if (phase === 'loading') return null

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>Recovery Questions</Label>
        {phase === 'idle' && (
          <span style={{
            fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase',
            letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 4,
            background: hasQs ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.08)',
            border: hasQs ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(234,179,8,0.2)',
            color: hasQs ? '#4ade80' : '#fbbf24',
          }}>
            {hasQs ? '◉ Configured' : '⚠ Not set up'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6, marginBottom: 14 }}>
        {hasQs
          ? 'Offline recovery is active. You can update your questions below.'
          : 'Set up security questions so you can recover your account without email access.'}
      </p>

      {/* ── idle: show open button ── */}
      {phase === 'idle' && (
        <button
          onClick={() => { setStatus(null); setPhase('gate') }}
          style={{
            padding: '8px 18px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            fontFamily: 'Syne, sans-serif', cursor: 'pointer',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {hasQs ? '↻ Update questions' : '◉ Set up recovery questions'}
        </button>
      )}

      {/* ── gate: password confirm ── */}
      {phase === 'gate' && (
        <>
          <div style={{ padding: '12px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.18)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#fbbf24', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
              Enter your current password to continue.
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <Label>Current Password</Label>
            <TInput
              val={password} set={setPassword} type="password"
              placeholder="Your current password"
            />
          </div>
          {status && <StatusBadge type={status.type} msg={status.msg} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => { setPhase('idle'); setPassword(''); setStatus(null) }}
              style={{ padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleVerifyPassword}
              disabled={verifying || !password.trim()}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 700,
                fontFamily: 'Syne, sans-serif',
                cursor: verifying || !password.trim() ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))',
                border: 'none', color: '#fff',
                opacity: verifying || !password.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {verifying ? <><Spin s={11} />Verifying…</> : 'Confirm →'}
            </button>
          </div>
        </>
      )}

      {/* ── form: question setup ── */}
      {phase === 'form' && (
        <>
          {[
            { label: 'Question 1', q: q1, setQ: setQ1, a: a1, setA: setA1 },
            { label: 'Question 2', q: q2, setQ: setQ2, a: a2, setA: setA2 },
            { label: 'Question 3', q: q3, setQ: setQ3, a: a3, setA: setA3 },
          ].map((item, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <Label>{item.label}</Label>
              <select value={item.q} onChange={e => item.setQ(e.target.value)} style={selectStyle}>
                {opts(item.q).map(qo => (
                  <option key={qo} value={qo} style={{ background: '#0d0d1e', color: 'rgba(255,255,255,0.88)' }}>{qo}</option>
                ))}
              </select>
              <TInput val={item.a} set={item.setA} placeholder="Your answer (not case-sensitive)" />
            </div>
          ))}
          {status && <StatusBadge type={status.type} msg={status.msg} />}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={() => { setPhase('idle'); setStatus(null) }}
              style={{ padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
            <SaveBtn saving={saving} saved={false} onClick={handleSave} label="Save Questions" />
          </div>
        </>
      )}

      {/* ── saved: success flash ── */}
      {phase === 'saved' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4ade80', fontFamily: "'IBM Plex Mono', monospace" }}>
          <span>✓</span> Recovery questions saved successfully.
        </div>
      )}
    </Card>
  )
}

// \u2500\u2500\u2500 TwoFactorCard \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function TwoFactorCard() {
  const [phase, setPhase]               = useState('loading')
  const [enabled, setEnabled]           = useState(false)
  const [backupRemaining, setRemaining] = useState(0)
  const [qrBase64, setQr]              = useState('')
  const [secret, setSecret]            = useState('')
  const [backupCodes, setBackupCodes]  = useState([])
  const [totpCode, setTotpCode]        = useState('')
  const [disableCode, setDisableCode]  = useState('')
  const [status, setStatus]            = useState(null)
  const [saving, setSaving]            = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/auth/2fa/status')
      setEnabled(r.data.enabled)
      setRemaining(r.data.backup_codes_remaining)
      setPhase('idle')
    } catch { setPhase('idle') }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSetup = async () => {
    setSaving(true); setStatus(null)
    try {
      const r = await api.post('/auth/2fa/setup')
      setQr(r.data.qr_base64)
      setSecret(r.data.secret)
      setBackupCodes(r.data.backup_codes)
      setPhase('setup')
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Setup failed' })
    } finally { setSaving(false) }
  }

  const handleEnable = async () => {
    const code = totpCode.replace(/\s/g, '')
    if (code.length !== 6) { setStatus({ type: 'error', msg: 'Enter the 6-digit code from your authenticator' }); return }
    setSaving(true); setStatus(null)
    try {
      await api.post('/auth/2fa/enable', { totp_code: code })
      await load()
      setPhase('idle')
      setTotpCode('')
      setStatus({ type: 'success', msg: '2FA enabled. Store your backup codes somewhere safe.' })
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Invalid code' })
    } finally { setSaving(false) }
  }

  const handleDisable = async () => {
    if (!disableCode.trim()) { setStatus({ type: 'error', msg: 'Enter your current authenticator code' }); return }
    setSaving(true); setStatus(null)
    try {
      await api.post('/auth/2fa/disable', { totp_code: disableCode.trim() })
      setEnabled(false)
      setPhase('idle')
      setDisableCode('')
      setStatus({ type: 'success', msg: '2FA has been disabled.' })
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Invalid code' })
    } finally { setSaving(false) }
  }

  if (phase === 'loading') return null

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>Two-Factor Authentication</Label>
        {phase === 'idle' && (
          <span style={{
            fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase',
            letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 4,
            background: enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
            border: enabled ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.1)',
            color: enabled ? '#4ade80' : 'rgba(255,255,255,0.3)',
          }}>
            {enabled ? '◉ Enabled' : '◎ Disabled'}
          </span>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6, marginBottom: 14 }}>
        {enabled
          ? `TOTP authenticator active. ${backupRemaining} backup code${backupRemaining !== 1 ? 's' : ''} remaining.`
          : 'Add a second layer of protection. Use Google Authenticator, Authy, or any TOTP app.'}
      </p>

      {phase === 'idle' && !enabled && (
        <button
          onClick={handleSetup} disabled={saving}
          style={{ padding: '8px 18px', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'Syne, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {saving ? <><Spin s={10} /> Setting up…</> : '◉ Enable 2FA'}
        </button>
      )}

      {phase === 'idle' && enabled && (
        <button
          onClick={() => { setPhase('disable_confirm'); setStatus(null); setDisableCode('') }}
          style={{ padding: '8px 18px', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(248,113,113,0.7)' }}
        >
          ✕ Disable 2FA
        </button>
      )}

      {phase === 'setup' && (
        <>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scan with your authenticator app</div>
              {qrBase64 && (
                <img
                  src={`data:image/png;base64,${qrBase64}`}
                  alt="TOTP QR code"
                  style={{ width: 160, height: 160, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#fff', padding: 4, display: 'block' }}
                />
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: "'IBM Plex Mono', monospace", wordBreak: 'break-all' }}>
                Manual: <span style={{ color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>{secret}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Backup codes — save these now</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {backupCodes.map((c, i) => (
                  <div key={i} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.65)', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 5, letterSpacing: '0.05em' }}>{c}</div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 8, lineHeight: 1.5 }}>Each code is single-use. Store in a password manager.</p>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />
          <Label>Enter the 6-digit code from your app to confirm</Label>
          <TInput
            val={totpCode}
            set={v => setTotpCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
          {status && <div style={{ marginTop: 8 }}><StatusBadge type={status.type} msg={status.msg} /></div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => { setPhase('idle'); setStatus(null); setTotpCode('') }}
              style={{ padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
            <SaveBtn saving={saving} saved={false} onClick={handleEnable} label="Activate 2FA" />
          </div>
        </>
      )}

      {phase === 'disable_confirm' && (
        <>
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#f87171', fontFamily: "'IBM Plex Mono', monospace" }}>Enter your current 2FA code to confirm.</div>
          </div>
          <Label>Authenticator Code</Label>
          <TInput
            val={disableCode}
            set={v => setDisableCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
          {status && <div style={{ marginTop: 8 }}><StatusBadge type={status.type} msg={status.msg} /></div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => { setPhase('idle'); setStatus(null); setDisableCode('') }}
              style={{ padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 600, fontFamily: 'Syne, sans-serif', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDisable} disabled={saving}
              style={{ flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: 'Syne, sans-serif', cursor: saving ? 'not-allowed' : 'pointer', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saving ? <><Spin s={11} /> Disabling…</> : 'Confirm Disable'}
            </button>
          </div>
        </>
      )}

      {phase === 'idle' && status && (
        <div style={{ marginTop: 12 }}><StatusBadge type={status.type} msg={status.msg} /></div>
      )}
    </Card>
  )
}


// ─── PasskeyCard ─────────────────────────────────────────────────────────────
function PasskeyCard() {
  const [passkeys, setPasskeys]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [registering, setReg]       = useState(false)
  const [deleting, setDeleting]     = useState(null)
  const [deviceName, setDeviceName] = useState('')
  const [status, setStatus]         = useState(null)

  const load = async () => {
    try {
      const r = await api.get('/auth/passkey/list')
      setPasskeys(r.data.passkeys || [])
    } catch { setPasskeys([]) }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  // ── WebAuthn helpers ──────────────────────────────────────────────────────
  function b64url(buffer) {
    const bytes = new Uint8Array(buffer)
    let str = ''
    bytes.forEach(b => str += String.fromCharCode(b))
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  function fromB64url(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4)
    const binary = atob(padded)
    const buf = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    return buf.buffer
  }

  function prepareRegOptions(opts) {
    return {
      ...opts,
      challenge: fromB64url(opts.challenge),
      user: { ...opts.user, id: fromB64url(opts.user.id) },
      excludeCredentials: (opts.excludeCredentials || []).map(c => ({
        ...c, id: fromB64url(c.id),
      })),
    }
  }

  function serializeRegCred(cred) {
    return {
      id: cred.id,
      rawId: b64url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment,
      response: {
        clientDataJSON:   b64url(cred.response.clientDataJSON),
        attestationObject: b64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : [],
      },
    }
  }

  // ── Register flow ─────────────────────────────────────────────────────────
  const handleAddPasskey = async () => {
    if (!window.PublicKeyCredential) {
      setStatus({ type: 'error', msg: 'This browser does not support passkeys.' })
      return
    }
    setReg(true)
    setStatus(null)
    try {
      const beginRes = await api.post('/auth/passkey/register-begin')
      const opts = prepareRegOptions(beginRes.data)
      const challengeId = beginRes.data.challenge_id

      let credential
      try {
        credential = await navigator.credentials.create({ publicKey: opts })
      } catch (e) {
        if (e.name === 'NotAllowedError') {
          setStatus({ type: 'info', msg: 'Passkey setup was cancelled.' })
          return
        }
        throw e
      }

      const serialised = serializeRegCred(credential)
      await api.post('/auth/passkey/register-complete', {
        challenge_id: challengeId,
        credential: serialised,
        device_name: deviceName.trim() || undefined,
      })

      setStatus({ type: 'success', msg: 'Passkey registered! You can now sign in with biometrics.' })
      setDeviceName('')
      await load()
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Registration failed. Try again.'
      setStatus({ type: 'error', msg })
    } finally { setReg(false) }
  }

  // ── Delete flow ───────────────────────────────────────────────────────────
  const handleDelete = async (credId) => {
    setDeleting(credId)
    setStatus(null)
    try {
      await api.post('/auth/passkey/delete', { credential_id: credId })
      setPasskeys(ps => ps.filter(p => p.credential_id !== credId))
      setStatus({ type: 'success', msg: 'Passkey removed.' })
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Could not remove passkey.' })
    } finally { setDeleting(null) }
  }

  const fmt = (dt) => dt ? new Date(dt + 'Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Label>Passkeys / Biometric Login</Label>
        {!loading && (
          <span style={{
            fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase',
            letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 4,
            background: passkeys.length ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
            border: passkeys.length ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.1)',
            color: passkeys.length ? '#4ade80' : 'rgba(255,255,255,0.3)',
          }}>
            {passkeys.length ? `◉ ${passkeys.length} enrolled` : '◎ None enrolled'}
          </span>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6, marginBottom: 16 }}>
        Sign in with Face ID, Touch ID, or a hardware security key — no password needed.
        Works on iPhone, Mac, Android, and Windows Hello.
      </p>

      {/* Enrolled passkeys list */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.22)', fontSize: 12 }}><Spin s={11} />Loading…</div>
      ) : passkeys.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {passkeys.map(pk => (
            <div key={pk.credential_id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
            }}>
              <span style={{ fontSize: 14, opacity: 0.6 }}>◈</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', fontFamily: 'Syne, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pk.device_name}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", marginTop: 1 }}>
                  Added {fmt(pk.created_at)}
                  {pk.last_used_at ? ` · Last used ${fmt(pk.last_used_at)}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleDelete(pk.credential_id)}
                disabled={deleting === pk.credential_id}
                style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                  fontFamily: 'Syne, sans-serif', cursor: deleting === pk.credential_id ? 'not-allowed' : 'pointer',
                  background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                  color: 'rgba(248,113,113,0.7)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {deleting === pk.credential_id ? <><Spin s={9} /></> : '✕ Remove'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Add passkey */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={deviceName}
          onChange={e => setDeviceName(e.target.value)}
          placeholder="Nickname (e.g. MacBook Pro, iPhone 15)"
          style={{
            flex: 1, padding: '8px 11px', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 7, color: 'rgba(255,255,255,0.88)',
            fontSize: 12, outline: 'none', fontFamily: "'DM Sans', sans-serif",
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent,#6366f1)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        <button
          onClick={handleAddPasskey}
          disabled={registering}
          style={{
            padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 700,
            fontFamily: 'Syne, sans-serif', cursor: registering ? 'not-allowed' : 'pointer',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
            color: 'rgba(255,255,255,0.55)', flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: registering ? 0.6 : 1,
          }}
        >
          {registering ? <><Spin s={10} />Registering…</> : '◈ Add passkey'}
        </button>
      </div>

      {status && <div style={{ marginTop: 10 }}><StatusBadge type={status.type} msg={status.msg} /></div>}
    </Card>
  )
}

// ─── Account Section ──────────────────────────────────────────────────────────
function AccountSection({ user }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving]       = useState(false)
  const [status, setStatus]       = useState(null)

  const handleChangePw = async () => {
    if (!newPw || newPw !== confirmPw) { setStatus({ type: 'error', msg: 'New passwords do not match' }); return }
    if (newPw.length < 8) { setStatus({ type: 'error', msg: 'Password must be at least 8 characters' }); return }
    setSaving(true); setStatus(null)
    try {
      await api.post('/auth/change-password', { current_password: currentPw, new_password: newPw })
      setStatus({ type: 'success', msg: 'Password changed successfully' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (e) {
      setStatus({ type: 'error', msg: e.response?.data?.detail || 'Failed to change password' })
    } finally { setSaving(false) }
  }

  return (
    <>
      {/* API Key card — shown to all users */}
      <ApiKeyCard />

      {/* Recovery questions */}
      <SecurityQuestionsCard />

      {/* 2FA */}
      <TwoFactorCard />

      {/* Passkeys */}
      <PasskeyCard />

      {/* Password change card */}
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
          <div>
            <Label>Username</Label>
            <TInput val={user?.username} disabled />
          </div>
          <div>
            <Label>Role</Label>
            <div style={{ padding: '9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {user?.role}
            </div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 18 }} />
        <Label>Change Password</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <TInput val={currentPw} set={setCurrentPw} type="password" placeholder="Current password" />
          <TInput val={newPw} set={setNewPw} type="password" placeholder="New password (min 8 chars)" />
          <TInput val={confirmPw} set={setConfirmPw} type="password" placeholder="Confirm new password" />
        </div>
        {status && <StatusBadge type={status.type} msg={status.msg} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <SaveBtn saving={saving} saved={false} onClick={handleChangePw} label="Change Password" />
        </div>
      </Card>
    </>
  )
}

// ─── Sessions Section ─────────────────────────────────────────────────────────
function SessionsSection() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [revoking, setRevoking] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await api.get('/auth/sessions'); setSessions(r.data.sessions || []) }
    catch { setSessions([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const revoke = async (id) => {
    setRevoking(id)
    try { await api.delete(`/auth/sessions/${id}`); setSessions(s => s.filter(x => x.id !== id)) }
    catch {}
    setRevoking(null)
  }

  const revokeAll = async () => {
    setRevoking('all')
    try { await api.delete('/auth/sessions'); await load() }
    catch {}
    setRevoking(null)
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <Label>Active Sessions</Label>
        {sessions.length > 1 && (
          <button onClick={revokeAll} disabled={revoking === 'all'} style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontFamily: 'Syne', fontWeight: 600 }}>
            {revoking === 'all' ? '…' : 'Revoke All Others'}
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.22)', fontSize: 12 }}><Spin />Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono', monospace", margin: 0 }}>No sessions found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sessions.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 14, color: s.is_current ? 'var(--accent)' : 'rgba(255,255,255,0.25)' }}>{s.is_current ? '◉' : '◎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: s.is_current ? '#818cf8' : 'rgba(255,255,255,0.55)', fontFamily: 'Syne' }}>
                  {s.device_hint || 'Unknown device'}
                  {s.is_current && <span style={{ fontSize: 9, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 4, padding: '1px 5px', marginLeft: 6, color: '#818cf8' }}>current</span>}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {s.ip || '—'} · issued {s.issued_at ? new Date(s.issued_at).toLocaleDateString() : '—'}
                </div>
              </div>
              {!s.is_current && (
                <button onClick={() => revoke(s.id)} disabled={!!revoking} style={{ fontSize: 10, padding: '4px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 6, color: '#f87171', cursor: 'pointer', fontFamily: 'Syne', fontWeight: 600 }}>
                  {revoking === s.id ? '…' : 'Revoke'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function DayOneImportButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/import/dayone')}
      style={{
        flexShrink: 0, padding: '9px 18px', borderRadius: 8,
        background: 'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))',
        border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
        fontFamily: 'Syne, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
        letterSpacing: '0.03em',
      }}
    >
      Import →
    </button>
  )
}

// ─── Data Section ─────────────────────────────────────────────────────────────
function DataSection() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/api/stats').then(r => setStats(r.data)).catch(() => {}) }, [])

  const fmt = (n) => n != null ? (n > 9999 ? `${(n/1000).toFixed(1)}k` : n) : '—'

  return (
    <>
      <Card>
        <Label>Journal Stats</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
          {[
            { label: 'Entries', val: fmt(stats?.total_entries), icon: '◈' },
            { label: 'Days', val: fmt(stats?.days_covered), icon: '◷' },
            { label: 'Words', val: fmt(stats?.total_words), icon: '〜' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '14px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 9, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 16, color: 'var(--accent)', marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 20, fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'rgba(255,255,255,0.88)' }}>{item.val}</div>
              <div style={{ fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <Label>Data & Privacy</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { icon: '⊙', label: 'Storage',  val: 'Local SQLite on your VPS — never sent to third parties' },
            { icon: '⬡', label: 'AI calls',  val: 'Only summaries and excerpts sent to Anthropic API — never full raw entries' },
            { icon: '◈', label: 'Exports',   val: 'Full data export available anytime from the Exports page' },
            { icon: '◎', label: 'Backups',   val: 'SQLite WAL mode enabled — manual backups recommended' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}>{row.icon}</span>
              <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.08em', minWidth: 60, paddingTop: 1, flexShrink: 0 }}>{row.label}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{row.val}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--accent)' }}>⬆</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: 'rgba(255,255,255,0.88)' }}>Import from Day One</span>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
              Import your Day One journal history. Entries are fully analyzed — patterns, people, contradictions, and mood intelligence unlock instantly.
            </p>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['ZIP export', 'JSON export', 'Full pipeline'].map(tag => (
                <span key={tag} style={{ fontSize: 9, padding: '2px 8px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 4, color: 'rgba(99,102,241,0.7)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.06em' }}>{tag}</span>
              ))}
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', margin: '10px 0 0', lineHeight: 1.5, fontFamily: "'IBM Plex Mono', monospace" }}>
              Day One is a trademark of its respective owner. This app is not affiliated with or endorsed by Day One.
            </p>
          </div>
          <DayOneImportButton />
        </div>
      </Card>
    </>
  )
}


// ─── Appearance Section ───────────────────────────────────────────────────────
const THEME_OPTIONS = [
  {
    id: 'default',
    name: 'Default',
    desc: 'Dark navy · mood-adaptive accents',
    preview: {
      bg: '#07070f', surface: '#0c0c18', card: '#10101e',
      accent: '#6366f1', text: '#e8e8f0', muted: '#55556a',
      border: 'rgba(99,102,241,0.18)',
    },
  },
  {
    id: 'writer',
    name: 'Writer',
    desc: 'Warm umber · notebook aesthetic',
    preview: {
      bg: '#0a0704', surface: '#110d07', card: '#18110a',
      accent: '#c8965a', text: '#ede0cb', muted: '#6b5640',
      border: 'rgba(195,145,85,0.22)',
    },
  },
]

function AppearanceSection() {
  const { uiTheme, setUiTheme } = useTheme()

  return (
    <>
      <Card>
        <Label>UI Theme</Label>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 16, lineHeight: 1.5 }}>
          Controls the global color palette and typography. Applies instantly across the entire app.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {THEME_OPTIONS.map(t => {
            const active = uiTheme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setUiTheme(t.id)}
                style={{
                  position: 'relative', padding: 0, cursor: 'pointer',
                  border: active ? `1px solid ${t.preview.accent}` : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12, overflow: 'hidden', background: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxShadow: active ? `0 0 16px ${t.preview.accent}28` : 'none',
                  textAlign: 'left',
                }}
              >
                {/* ── Mini app preview ── */}
                <div style={{ background: t.preview.bg, padding: '13px 12px 10px', borderRadius: '11px 11px 0 0' }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {/* Fake sidebar */}
                    <div style={{
                      width: 30, background: t.preview.surface,
                      border: `1px solid ${t.preview.border}`,
                      borderRadius: 5, padding: '6px 5px',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ height: 3, width: '60%', background: t.preview.accent, borderRadius: 2 }} />
                      {[0,1,2,3].map(i => (
                        <div key={i} style={{ height: 2.5, background: t.preview.border, borderRadius: 2 }} />
                      ))}
                    </div>
                    {/* Fake content */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {/* Fake stat row */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0,1,2].map(i => (
                          <div key={i} style={{ flex: 1, height: 18, background: t.preview.card, border: `1px solid ${t.preview.border}`, borderRadius: 4 }} />
                        ))}
                      </div>
                      {/* Fake entry card */}
                      <div style={{ background: t.preview.card, border: `1px solid ${t.preview.border}`, borderRadius: 5, padding: '5px 7px' }}>
                        <div style={{ height: 2.5, width: '75%', background: t.preview.text, borderRadius: 2, opacity: 0.55, marginBottom: 3 }} />
                        <div style={{ height: 2, width: '50%', background: t.preview.muted, borderRadius: 2, opacity: 0.5 }} />
                      </div>
                      {/* Fake button */}
                      <div style={{
                        height: 16, width: 52, borderRadius: 5,
                        background: `linear-gradient(135deg, ${t.preview.accent}, ${t.preview.accent}99)`,
                        opacity: 0.85,
                      }} />
                    </div>
                  </div>
                </div>
                {/* ── Label strip ── */}
                <div style={{ padding: '9px 13px 11px', background: t.preview.card, borderTop: `1px solid ${t.preview.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, fontFamily: 'Syne, sans-serif',
                      color: active ? t.preview.accent : 'rgba(255,255,255,0.7)',
                    }}>{t.name}</span>
                    {active && (
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: t.preview.accent, display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#000', fontWeight: 800,
                      }}>✓</span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.45 }}>
                    {t.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {uiTheme === 'writer' && (
        <Card style={{ background: 'rgba(200,150,90,0.04)', borderColor: 'rgba(200,150,90,0.15)' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14, color: '#c8965a', flexShrink: 0, marginTop: 1 }}>✦</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Syne, sans-serif', color: '#c8965a', marginBottom: 4 }}>Writer mode active</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6 }}>
                Amber palette is locked across all pages. Mood-adaptive accent colors are paused while Writer is active.
              </div>
            </div>
          </div>
        </Card>
      )}
    </>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'memory',   icon: '◷', label: 'Memory Profile' },
  { id: 'ai',       icon: '〜', label: 'AI Preferences' },
  { id: 'account',  icon: '⊞', label: 'Account'        },
  { id: 'sessions', icon: '◎', label: 'Sessions'        },
  { id: 'data',     icon: '◈', label: 'Data'            },
  { id: 'appearance', icon: '◉', label: 'Appearance'   },
]

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab]       = useState('memory')
  const [memory, setMemory] = useState(null)
  const [memErr, setMemErr] = useState(false)

  const reloadMemory = useCallback(() => {
    api.get('/api/memory').then(r => setMemory(r.data.memory || {})).catch(() => setMemErr(true))
  }, [])

  useEffect(() => { reloadMemory() }, [reloadMemory])

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'rgba(255,255,255,0.88)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--accent)' }}>⊙</span> Settings
        </h1>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
          memory profile · ai preferences · account · appearance
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 26, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, fontFamily: 'Syne, sans-serif', fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.3)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent,#6366f1)' : 'transparent'}`,
            marginBottom: -1, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 10, color: tab === t.id ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.2)' }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'memory' && (
        <>
          <SectionTitle icon="◷" title="Memory Profile" subtitle="Context injected into every AI call — personalize your experience" />
          {memErr
            ? <StatusBadge type="error" msg="Could not load memory profile." />
            : <MemorySection memory={memory} onSaved={reloadMemory} />
          }
        </>
      )}
      
    {tab === 'ai' && (
      <>
        <SectionTitle icon="〜" title="AI Preferences" subtitle="Provider key, model, and reflection voice" />
        <AutoReflectSection />
        <AIProviderSection />
        {memErr
            ? <StatusBadge type="info" msg="Memory profile not loaded — complete Memory Profile tab first." />
            : <AIPrefsSection memory={memory} />
          }
        </>
      )}
      {tab === 'account' && (
        <>
          <SectionTitle icon="⊞" title="Account" subtitle="API key, username, and password management" />
          <AccountSection user={user} />
        </>
      )}
      {tab === 'sessions' && (
        <>
          <SectionTitle icon="◎" title="Active Sessions" subtitle="Devices holding valid refresh tokens" />
          <SessionsSection />
        </>
      )}
      {tab === 'data' && (
        <>
          <SectionTitle icon="◈" title="Your Data" subtitle="Stats, storage, and privacy information" />
          <DataSection />
        </>
      )}
      {tab === 'appearance' && (
        <>
          <SectionTitle icon="◉" title="Appearance" subtitle="Global UI theme — colors, palette, and typography" />
          <AppearanceSection />
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { font-family: inherit; }
        textarea { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  )
}
