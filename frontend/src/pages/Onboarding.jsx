/**
 * Onboarding.jsx  —  frontend/src/pages/Onboarding.jsx
 * 9-step signup + AI memory building flow.
 * Matches site theme: dark bg, Syne headings, IBM Plex Mono labels, indigo accent.
 */
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'welcome',   icon: '✦', label: 'Welcome'   },
  { id: 'about',     icon: '◎', label: 'About You' },
  { id: 'situation', icon: '〜', label: 'Situation' },
  { id: 'people',    icon: '◈', label: 'People'    },
  { id: 'topics',    icon: '⬡', label: 'Topics'    },
  { id: 'goals',     icon: '⊕', label: 'Goals'     },
  { id: 'account',   icon: '⊞', label: 'Account'   },
  { id: 'ai_key',    icon: '⊙', label: 'AI Setup'  },
  { id: 'memory',    icon: '◷', label: 'Memory'    },
  { id: 'done',      icon: '〇', label: 'All Set'   },
]
const SITUATION_OPTS = [
  { id: 'relationship',  icon: '⚡', label: 'Relationship',     desc: 'Difficult relationship or planning to leave'  },
  { id: 'custody',       icon: '◎', label: 'Custody/Parenting', desc: 'Co-parenting conflict or custody dispute'     },
  { id: 'workplace',     icon: '⊞', label: 'Workplace',         desc: 'Hostile work environment or HR matter'        },
  { id: 'housing',       icon: '⬡', label: 'Housing',           desc: 'Instability, eviction, or unsafe living'      },
  { id: 'legal',         icon: '⊕', label: 'Legal Matter',      desc: 'Ongoing legal case needing documentation'     },
  { id: 'mental_health', icon: '〜', label: 'Mental Health',     desc: 'Tracking mood, anxiety, or wellbeing'         },
  { id: 'growth',        icon: '◈', label: 'Personal Growth',   desc: 'Self-reflection and building self-knowledge'  },
  { id: 'other',         icon: '✦', label: 'Something Else',    desc: "My situation doesn't fit a category"         },
]
const TOPIC_OPTS = [
  'Anxiety','Sleep','Health','Work','Relationships','Family',
  'Money','Safety','Legal','Housing','Trauma','Boundaries',
  'Self-worth','Healing','Documentation','Growth','Addiction',
  'Children','Isolation','Identity',
]
const GOAL_OPTS = [
  { id: 'document',  icon: '◷', label: 'Document my experience',    desc: 'Build an accurate, timestamped record'      },
  { id: 'patterns',  icon: '⬡', label: "Find patterns I'm missing", desc: "Let AI surface what I can't see myself"    },
  { id: 'case_file', icon: '⊕', label: 'Build a case file',         desc: 'Exportable evidence for legal/medical use'  },
  { id: 'mental',    icon: '〜', label: 'Track my mental health',    desc: 'Mood, severity, and stability over time'    },
  { id: 'exit',      icon: '⚡', label: 'Plan a major life change',  desc: 'Structured roadmap with AI support'         },
  { id: 'process',   icon: '◎', label: 'Process my feelings',       desc: "Understand what I'm actually experiencing" },
  { id: 'evidence',  icon: '◈', label: 'Gather legal evidence',      desc: 'For custody, restraining orders, or court' },
  { id: 'heal',      icon: '✦', label: 'Grow and heal',             desc: 'Long-term self-knowledge and recovery'      },
]
const PRONOUN_OPTS = ['she/her','he/him','they/them','prefer not to say']

// ─── Micro components ─────────────────────────────────────────────────────────
const Label = ({ c }) => (
  <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:'0.12em', color:'rgba(255,255,255,0.22)', textTransform:'uppercase', marginBottom:6 }}>{c}</div>
)
const Err = ({ m }) => m ? <div style={{ fontSize:11, color:'#ef4444', marginTop:4 }}>{m}</div> : null
const Spin = ({ s = 13 }) => (
  <span style={{ display:'inline-block', width:s, height:s, border:'2px solid rgba(255,255,255,0.2)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
)

function TInput({ val, set, placeholder, type='text', auto, err }) {
  const [f, setF] = useState(false)
  return (
    <input
      type={type} value={val} onChange={e => set(e.target.value)}
      placeholder={placeholder} autoFocus={auto}
      onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        width:'100%', padding:'11px 14px', boxSizing:'border-box',
        background:'rgba(255,255,255,0.04)',
        border:`1px solid ${err ? '#ef4444' : f ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius:8, color:'rgba(255,255,255,0.88)', fontSize:14, outline:'none',
        fontFamily:"'DM Sans',sans-serif", transition:'border-color 0.2s',
      }}
    />
  )
}

function PrimaryBtn({ children, onClick, disabled, full, style: sx = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:'11px 24px', border:'none', borderRadius:8,
      fontSize:13, fontWeight:700, fontFamily:'Syne,sans-serif', letterSpacing:'0.04em',
      cursor: disabled ? 'not-allowed' : 'pointer',
      background:'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))',
      color:'#fff', opacity: disabled ? 0.5 : 1,
      width: full ? '100%' : 'auto',
      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8,
      transition:'opacity 0.15s', ...sx,
    }}>{children}</button>
  )
}
function GhostBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'11px 20px', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8,
      fontSize:13, fontWeight:600, fontFamily:'Syne,sans-serif',
      cursor:'pointer', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.35)',
    }}>{children}</button>
  )
}
function Nav({ back, next, nextLabel='Continue', disabled=false, loading=false }) {
  return (
    <div style={{ display:'flex', gap:10, marginTop:24 }}>
      {back && <GhostBtn onClick={back}>← Back</GhostBtn>}
      <PrimaryBtn onClick={next} disabled={disabled||loading} style={{ flex:1, padding:'11px 0' }}>
        {loading ? <><Spin />Processing…</> : nextLabel}
      </PrimaryBtn>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function Dots({ cur }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:30 }}>
      {STEPS.map((s, i) => {
        const done = i < cur, active = i === cur
        return (
          <div key={s.id} style={{ display:'flex', alignItems:'center' }}>
            <div title={s.label} style={{
              width:26, height:26, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: done ? 9 : 10,
              background: active
                ? 'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))'
                : done ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
              border: active ? '2px solid transparent'
                : done ? '1.5px solid rgba(99,102,241,0.35)' : '1.5px solid rgba(255,255,255,0.08)',
              color: active ? '#fff' : done ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.22)',
              boxShadow: active ? '0 0 14px rgba(99,102,241,0.5)' : 'none',
              transition:'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
            }}>{done ? '✓' : s.icon}</div>
            {i < STEPS.length-1 && (
              <div style={{ width:16, height:1.5, background: i<cur ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)', transition:'background 0.4s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Individual slides ────────────────────────────────────────────────────────
function Welcome({ next }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:58, lineHeight:1, marginBottom:16, filter:'drop-shadow(0 0 28px rgba(99,102,241,0.65))', animation:'glow 3s ease-in-out infinite' }}>✦</div>
      <h1 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:25, color:'rgba(255,255,255,0.88)', letterSpacing:'-0.01em', marginBottom:8 }}>Journal Intelligence</h1>
      <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.65, maxWidth:380, margin:'0 auto 26px' }}>
        Your private AI system for documenting, understanding, and navigating what you're going through. Built for clarity. Built for privacy.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:28, textAlign:'left' }}>
        {[
          { icon:'◷', label:'Timestamped record',  sub:'Every entry indexed & searchable' },
          { icon:'⬡', label:'Pattern detection',   sub:"AI finds what you might miss" },
          { icon:'⊕', label:'Evidence vault',      sub:'Case-file ready exports' },
          { icon:'〜', label:'Mood intelligence',   sub:'Nervous system tracking over time' },
        ].map((f,i) => (
          <div key={i} style={{ padding:'11px 12px', borderRadius:10, background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.12)', display:'flex', alignItems:'flex-start', gap:9 }}>
            <span style={{ fontSize:14, color:'var(--accent,#6366f1)', marginTop:1 }}>{f.icon}</span>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.88)' }}>{f.label}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', marginTop:1 }}>{f.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <PrimaryBtn onClick={next} full style={{ padding:'13px 0', fontSize:14, boxShadow:'0 8px 28px rgba(99,102,241,0.25)' }}>Begin Setup →</PrimaryBtn>
      <div style={{ marginTop:14 }}>
        <Link to="/login" style={{ fontSize:11, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', textDecoration:'none' }}>
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  )
}

function About({ d, set, next, back }) {
  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>What should we call you?</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:20 }}>Not your username — just how the AI addresses you in reflections. Totally private.</p>
      <div style={{ marginBottom:18 }}>
        <Label c="Preferred Name" />
        <TInput val={d.preferredName} set={v => set({ preferredName:v })} placeholder="e.g. Alex" auto />
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', marginTop:4, fontFamily:"'IBM Plex Mono',monospace" }}>Only used to personalize AI responses.</div>
      </div>
      <div style={{ marginBottom:8 }}>
        <Label c="Pronouns (optional)" />
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {PRONOUN_OPTS.map(p => {
            const on = d.pronouns === p
            return (
              <div key={p} onClick={() => set({ pronouns: on ? '' : p })} style={{
                padding:'7px 13px', borderRadius:20, cursor:'pointer',
                fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
                border:`1.5px solid ${on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
                color: on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.35)',
                background: on ? 'rgba(99,102,241,0.1)' : 'transparent',
                transition:'all 0.15s', userSelect:'none',
              }}>{p}</div>
            )
          })}
        </div>
      </div>
      <Nav back={back} next={next} />
    </div>
  )
}

function Situation({ d, set, next, back }) {
  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>What brings you here?</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:16 }}>Pick the closest match — this gives the AI baseline context from day one.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
        {SITUATION_OPTS.map(s => {
          const on = d.situationType === s.id
          return (
            <div key={s.id} onClick={() => set({ situationType:s.id })} style={{
              padding:'10px 12px', borderRadius:10, cursor:'pointer',
              border:`1.5px solid ${on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
              background: on ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
              transition:'all 0.15s', display:'flex', alignItems:'flex-start', gap:8,
            }}>
              <span style={{ fontSize:13, color: on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.22)', marginTop:1, flexShrink:0 }}>{s.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color: on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.88)', marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', lineHeight:1.4 }}>{s.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
      <Label c="Tell us more (optional)" />
      <textarea
        value={d.situationStory||''} onChange={e => set({ situationStory:e.target.value })}
        placeholder="Briefly describe your situation in your own words. This is completely private."
        rows={3}
        style={{
          width:'100%', padding:'10px 14px', boxSizing:'border-box',
          background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:8, color:'rgba(255,255,255,0.88)', fontSize:13, outline:'none',
          resize:'none', fontFamily:"'DM Sans',sans-serif", lineHeight:1.55, transition:'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderColor='var(--accent,#6366f1)'}
        onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.08)'}
      />
      <Nav back={back} next={next} />
    </div>
  )
}

function People({ d, set, next, back }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [note, setNote] = useState('')
  const add = () => {
    if (!name.trim()) return
    set({ people: [...(d.people||[]), { name:name.trim(), role, note:note.trim() }] })
    setName(''); setNote('')
  }
  const rm = i => set({ people:(d.people||[]).filter((_,idx)=>idx!==i) })
  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>Key people in your story</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:16 }}>
        AI tracks these across your entries and surfaces patterns about them. Use aliases — "J" or "Ex" is fine.
      </p>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Name or alias"
          style={{ flex:1, padding:'9px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'rgba(255,255,255,0.88)', fontSize:13, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
          onFocus={e=>e.target.style.borderColor='var(--accent,#6366f1)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'}
        />
        <input value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. girlfriend, spouse, child"
          style={{ width:160, padding:'9px 10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'rgba(255,255,255,0.88)', fontSize:12, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
          onFocus={e=>e.target.style.borderColor='var(--accent,#6366f1)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'}
        />        <button onClick={add} style={{ padding:'9px 14px', background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:8, color:'var(--accent,#6366f1)', fontSize:18, lineHeight:1, cursor:'pointer' }}>+</button>
      </div>
      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Note (optional) — e.g. 'main person in dispute'"
        style={{ width:'100%', padding:'7px 12px', marginBottom:14, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'rgba(255,255,255,0.22)', fontSize:11, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}
      />
      <div style={{ maxHeight:170, overflowY:'auto', marginBottom:4 }}>
        {(d.people||[]).length===0 ? (
          <div style={{ padding:'16px', textAlign:'center', fontSize:12, color:'rgba(255,255,255,0.22)', fontStyle:'italic', border:'1px dashed rgba(255,255,255,0.08)', borderRadius:8 }}>
            Add people above, or skip and add them later from Admin
          </div>
        ) : (d.people||[]).map((p,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, marginBottom:6 }}>
            <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--accent,#6366f1)' }}>
              {p.name[0]?.toUpperCase()}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.88)' }}>{p.name}</div>
              {p.note && <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)' }}>{p.note}</div>}
            </div>
            <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', background:'rgba(255,255,255,0.04)', padding:'2px 8px', borderRadius:4 }}>{p.role}</span>
            <button onClick={()=>rm(i)} style={{ background:'none', border:'none', color:'rgba(239,68,68,0.5)', cursor:'pointer', fontSize:16, padding:0, lineHeight:1 }}>×</button>
          </div>
        ))}
      </div>
      <Nav back={back} next={next} />
    </div>
  )
}

function Topics({ d, set, next, back }) {
  const [custom, setCustom] = useState('')
  const allTopics = [...TOPIC_OPTS, ...((d.topics||[]).filter(t => !TOPIC_OPTS.includes(t)))]
  const toggle = t => { const c=d.topics||[]; set({ topics:c.includes(t)?c.filter(x=>x!==t):[...c,t] }) }
  const addCustom = () => {
    const val = custom.trim()
    if (!val) return
    const c = d.topics || []
    if (!c.includes(val)) set({ topics: [...c, val] })
    setCustom('')
  }
  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>What topics matter most?</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:16 }}>AI prioritizes these in pattern detection and reflections. Select everything relevant.</p>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
        {allTopics.map(t => {
          const on = (d.topics||[]).includes(t)
          const isCustom = !TOPIC_OPTS.includes(t)
          return (
            <div key={t} onClick={()=>toggle(t)} style={{
              padding:'7px 13px', borderRadius:20, cursor:'pointer',
              fontSize:12, fontFamily:"'IBM Plex Mono',monospace",
              border:`1.5px solid ${on ? 'var(--accent,#6366f1)' : isCustom ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.08)'}`,
              color: on ? 'var(--accent,#6366f1)' : isCustom ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.35)',
              background: on ? 'rgba(99,102,241,0.1)' : isCustom ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
              transition:'all 0.15s', userSelect:'none',
            }}>
              {on && <span style={{ marginRight:4 }}>✓</span>}{t}
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:10 }}>
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustom()}
          placeholder="Add your own topic…"
          style={{
            flex:1, padding:'8px 12px', background:'rgba(255,255,255,0.04)',
            border:'1px solid rgba(255,255,255,0.08)', borderRadius:8,
            color:'rgba(255,255,255,0.88)', fontSize:12, outline:'none',
            fontFamily:"'IBM Plex Mono',monospace",
          }}
          onFocus={e => e.target.style.borderColor='var(--accent,#6366f1)'}
          onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.08)'}
        />
        <button onClick={addCustom} style={{
          padding:'8px 14px', background:'rgba(99,102,241,0.12)',
          border:'1px solid rgba(99,102,241,0.3)', borderRadius:8,
          color:'var(--accent,#6366f1)', fontSize:18, lineHeight:1,
          cursor:'pointer', flexShrink:0,
        }}>+</button>
      </div>
      {(d.topics||[]).length>0 && <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'var(--accent,#6366f1)', marginBottom:4 }}>{(d.topics||[]).length} selected</div>}
      <Nav back={back} next={next} />
    </div>
  )
}

function Goals({ d, set, next, back }) {
  const toggle = id => { const c=d.goals||[]; set({ goals:c.includes(id)?c.filter(x=>x!==id):[...c,id] }) }
  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>What do you want from this?</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:16 }}>This shapes what the AI focuses on. Select everything that applies.</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
        {GOAL_OPTS.map(g => {
          const on = (d.goals||[]).includes(g.id)
          return (
            <div key={g.id} onClick={()=>toggle(g.id)} style={{
              padding:'11px 12px', borderRadius:10, cursor:'pointer',
              border:`1.5px solid ${on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.08)'}`,
              background: on ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
              transition:'all 0.15s', display:'flex', alignItems:'flex-start', gap:8,
            }}>
              <span style={{ fontSize:13, color: on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.22)', marginTop:1, flexShrink:0 }}>{g.icon}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: on ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.88)', marginBottom:2 }}>{g.label}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)', lineHeight:1.4 }}>{g.desc}</div>
              </div>
            </div>
          )
        })}
      </div>
      <Nav back={back} next={next} />
    </div>
  )
}

function Account({ d, set, next, back, onReg }) {
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(null)
  const [copied, setCopied] = useState(false)
  const pw = d.password || ''
  const strength = [pw.length>=12, /[A-Z]/.test(pw), /[0-9]/.test(pw), /[^a-zA-Z0-9]/.test(pw), pw.length>=20].filter(Boolean).length
  const strLabel = ['','Weak','Fair','Good','Strong','Very Strong'][strength]
  const strColor = ['','#ef4444','#f59e0b','#eab308','#10b981','#6366f1'][strength]
  const validate = () => {
    const e = {}
    if (!d.username||d.username.length<3) e.username='Min 3 characters'
    if (!d.email||!d.email.includes('@')) e.email='Valid email required'
    if (pw.length<12) e.password='Min 12 characters required'
    else if (!/[A-Z]/.test(pw)) e.password='Must include uppercase'
    else if (!/[0-9]/.test(pw)) e.password='Must include a number'
    else if (!/[^a-zA-Z0-9]/.test(pw)) e.password='Must include a symbol'
    if (pw!==d.confirmPassword) e.confirmPassword='Passwords do not match'
    return e
  }
  const submit = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setLoading(true); setErrors({})
    try {
      const res = await api.post('/api/register', { username:d.username, email:d.email, password:d.password })
      setApiKey(res.data.api_key || null)
      if (!res.data.api_key) onReg()
    } catch (err) {
      const detail = err.response?.data?.detail || ''
      const alreadyExists = err.response?.status === 409 ||
        detail.toLowerCase().includes('already') ||
        detail.toLowerCase().includes('taken') ||
        detail.toLowerCase().includes('exists')
      if (alreadyExists) {
        onReg()
        return
      }
      setErrors({ general: detail || 'Registration failed. Username or email may be taken.' })
    } finally { setLoading(false) }
  }
  const copyKey = async () => {
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  if (apiKey) return (
    <div>
      <div style={{ width:52, height:52, borderRadius:'50%', margin:'0 0 18px', background:'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#fff', boxShadow:'0 0 30px rgba(99,102,241,0.4)' }}>✦</div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>Account created!</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:18, lineHeight:1.6 }}>
        Your API key is shown <strong style={{ color:'rgba(255,255,255,0.55)' }}>once</strong> — copy it now and paste it into your iPhone Shortcut. You can regenerate it later in Settings if needed.
      </p>
      <div style={{ background:'rgba(0,0,0,0.35)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:10, padding:'14px 16px', marginBottom:10 }}>
        <div style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(234,179,8,0.7)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:10 }}>⚠ Copy Now — Won't Be Shown Again</div>
        <code style={{ display:'block', fontSize:11, fontFamily:"'IBM Plex Mono',monospace", color:'#a5b4fc', wordBreak:'break-all', lineHeight:1.6, userSelect:'text' }}>
          {apiKey}
        </code>
      </div>
      <button onClick={copyKey} style={{
        width:'100%', padding:'10px', borderRadius:8, fontSize:12, fontWeight:700,
        fontFamily:'Syne,sans-serif', cursor:'pointer', marginBottom:14,
        background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)',
        border: copied ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(99,102,241,0.3)',
        color: copied ? '#4ade80' : 'rgba(255,255,255,0.7)',
        transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        {copied ? '✓ Copied!' : '⊕ Copy API Key'}
      </button>
      <PrimaryBtn onClick={onReg} full style={{ padding:'11px 0' }}>Continue →</PrimaryBtn>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>Secure your account</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:18 }}>Passwords stored as bcrypt hashes. Plain text is never kept or logged.</p>
      {errors.general && <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, color:'#ef4444', fontSize:12, marginBottom:14 }}>{errors.general}</div>}
      <div style={{ marginBottom:12 }}>
        <Label c="Username" /><TInput val={d.username} set={v=>set({username:v})} placeholder="yourname" auto err={!!errors.username} /><Err m={errors.username} />
      </div>
      <div style={{ marginBottom:12 }}>
        <Label c="Email" /><TInput type="email" val={d.email} set={v=>set({email:v})} placeholder="you@email.com" err={!!errors.email} /><Err m={errors.email} />
      </div>
      <div style={{ marginBottom:6 }}>
        <Label c="Password" /><TInput type="password" val={d.password} set={v=>set({password:v})} err={!!errors.password} /><Err m={errors.password} />
      </div>
      {pw.length>0 && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
          <div style={{ flex:1, height:3, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ width:`${(strength/5)*100}%`, height:'100%', background:strColor, transition:'all 0.3s', borderRadius:2 }} />
          </div>
          <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:strColor, minWidth:64, textAlign:'right' }}>{strLabel}</span>
        </div>
      )}
      <div style={{ marginBottom:12 }}>
        <Label c="Confirm Password" /><TInput type="password" val={d.confirmPassword} set={v=>set({confirmPassword:v})} err={!!errors.confirmPassword} /><Err m={errors.confirmPassword} />
      </div>
      <Nav back={back} next={submit} nextLabel="Create Account" loading={loading} />
    </div>
  )
}

function Memory({ formData, next, back }) {
  const [preview, setPreview] = useState(null)
  const [loadingP, setLoadingP] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.post('/api/onboarding/memory-preview', {
      preferred_name:formData.preferredName, pronouns:formData.pronouns,
      situation_type:formData.situationType, situation_story:formData.situationStory,
      people:formData.people, topics:formData.topics, goals:formData.goals,
    }).then(r=>setPreview(r.data)).catch(()=>setPreview({ai_summary:null})).finally(()=>setLoadingP(false))
  }, [])

  const handleNext = async () => {
    setSaving(true)
    try {
      await api.post('/api/onboarding/memory', {
        preferred_name:formData.preferredName, pronouns:formData.pronouns,
        situation_type:formData.situationType, situation_story:formData.situationStory,
        people:formData.people, topics:formData.topics, goals:formData.goals,
        ai_summary: preview?.ai_summary || '',
      })
    } catch {}
    next()
  }

  const sitLabel = SITUATION_OPTS.find(s=>s.id===formData.situationType)?.label || formData.situationType
  const goalLabels = (formData.goals||[]).map(id=>GOAL_OPTS.find(g=>g.id===id)?.label||id)

  return (
    <div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:22, color:'rgba(255,255,255,0.88)', marginBottom:4 }}>Your AI memory</h2>
      <p style={{ fontSize:12, color:'rgba(255,255,255,0.22)', marginBottom:18 }}>This context is injected into every AI interaction — reflections, pattern analysis, summaries, everything.</p>

      <div style={{ background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:14, padding:'18px 20px', marginBottom:14 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, paddingBottom:14, marginBottom:14, borderBottom:'1px solid rgba(99,102,241,0.15)' }}>
          <span style={{ fontSize:18, color:'var(--accent,#6366f1)' }}>✦</span>
          <div>
            <div style={{ fontSize:12, fontWeight:700, fontFamily:'Syne,sans-serif', color:'var(--accent,#6366f1)' }}>AI Memory — Active</div>
            <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)' }}>updates with every new journal entry</div>
          </div>
        </div>

        {/* Rows */}
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
          {formData.preferredName && <MRow icon="◎" label="Name" v={`${formData.preferredName}${formData.pronouns ? ` · ${formData.pronouns}` : ''}`} />}
          {sitLabel && <MRow icon="〜" label="Situation" v={sitLabel} />}
          {(formData.people||[]).length>0 && <MRow icon="◈" label="Key People" v={(formData.people||[]).map(p=>`${p.name} (${p.role})`).join(', ')} />}
          {(formData.topics||[]).length>0 && <MRow icon="⬡" label="Topics" v={(formData.topics||[]).join(', ')} />}
          {goalLabels.length>0 && <MRow icon="⊕" label="Goals" v={goalLabels.join(', ')} />}
        </div>

        {/* AI summary */}
        <div style={{ borderTop:'1px solid rgba(99,102,241,0.15)', paddingTop:14 }}>
          <div style={{ fontSize:9, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>AI Context Summary</div>
          {loadingP ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'rgba(255,255,255,0.22)', fontSize:12 }}>
              <Spin /><span style={{ fontFamily:"'IBM Plex Mono',monospace" }}>Generating your context…</span>
            </div>
          ) : preview?.ai_summary ? (
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.35)', lineHeight:1.65, margin:0 }}>{preview.ai_summary}</p>
          ) : (
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.22)', fontStyle:'italic', margin:0, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1.7 }}>
              Your memory context will grow as you add journal entries.<br/>
              <span style={{ color:'rgba(255,255,255,0.15)' }}>To use AI-generated summaries and features, you must supply an API key in <strong style={{color:'rgba(255,255,255,0.25)'}}>Settings → AI Preferences</strong>.</span>
            </p>
          )}
        </div>
      </div>

      <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', marginBottom:4 }}>
        Update your memory profile anytime from Admin → Memory Profile.
      </div>
      <Nav back={back} next={handleNext} nextLabel="Save Memory & Continue" loading={saving} disabled={loadingP} />
    </div>
  )
}

const AI_PROVIDERS = [
  { id: 'anthropic',     icon: '✦', label: 'Anthropic Claude',  desc: 'Claude Sonnet / Haiku / Opus', needsUrl: false },
  { id: 'openai',        icon: '⊕', label: 'OpenAI',            desc: 'GPT-4o, GPT-4o-mini…',        needsUrl: false },
  { id: 'openai_compat', icon: '⬡', label: 'OpenAI-compatible', desc: 'OpenRouter, Groq, Together…', needsUrl: true  },
  { id: 'local',         icon: '◈', label: 'Local / Offline',   desc: 'Ollama, LM Studio, etc.',      needsUrl: true  },
]

function AIProviderStep({ next, back }) {
  const [provider, setProvider] = useState('anthropic')
  const [apiKey,   setApiKey]   = useState('')
  const [baseUrl,  setBaseUrl]  = useState('')
  const [model,    setModel]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  const needsUrl = AI_PROVIDERS.find(p => p.id === provider)?.needsUrl

  const handleSave = async () => {
    setSaving(true); setErr('')
    try {
      await api.put('/api/settings/ai-provider', {
        provider,
        api_key:  apiKey.trim()  || undefined,
        base_url: baseUrl.trim() || undefined,
        model:    model.trim()   || undefined,
      })
      next()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to save — you can set this later in Settings.')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: 'rgba(255,255,255,0.88)', marginBottom: 4 }}>
          Connect an AI
        </h2>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6, marginBottom: 0 }}>
          Reflections, pattern analysis, and exit planning all need an AI API.
          You can skip this and add it later in <strong style={{ color: 'rgba(255,255,255,0.45)' }}>Settings → AI Preferences</strong>.
        </p>
      </div>

      <Label c="Provider" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14, marginTop: 6 }}>
        {AI_PROVIDERS.map(p => (
          <button key={p.id} onClick={() => setProvider(p.id)} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
            background: provider === p.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
            border: provider === p.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontSize: 13, color: provider === p.id ? 'var(--accent,#6366f1)' : 'rgba(255,255,255,0.28)' }}>{p.icon}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: provider === p.id ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)', fontFamily: 'Syne,sans-serif' }}>{p.label}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: "'IBM Plex Mono',monospace" }}>{p.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <Label c="API Key" />
        <TInput
          val={apiKey} set={setApiKey}
          type="password"
          placeholder={
            provider === 'anthropic' ? 'sk-ant-api03-...' :
            provider === 'openai'    ? 'sk-proj-...' :
            provider === 'local'     ? 'none needed for most local servers' :
            'your-api-key'
          }
        />
      </div>

      {needsUrl && (
        <div style={{ marginBottom: 10 }}>
          <Label c={`Base URL${provider === 'local' ? ' (default: localhost:11434)' : ' (required)'}`} />
          <TInput
            val={baseUrl} set={setBaseUrl}
            placeholder={provider === 'local' ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1'}
          />
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label c="Model (optional — leave blank for default)" />
        <TInput
          val={model} set={setModel}
          placeholder={
            provider === 'anthropic' ? 'claude-sonnet-4-5' :
            provider === 'openai'    ? 'gpt-4o-mini' :
            provider === 'local'     ? 'llama3' : ''
          }
        />
      </div>

      {err && <Err m={err} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
        <PrimaryBtn onClick={handleSave} disabled={saving} full>
          {saving ? <Spin s={13} /> : '⊙ Save & Continue →'}
        </PrimaryBtn>
        <button onClick={() => next()} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: "'IBM Plex Mono',monospace",
          color: 'rgba(255,255,255,0.5)',
          padding: '9px 0',
          width: '100%',
          letterSpacing: '0.02em',
        }}>
          Skip for now — add AI key later in Settings
        </button>
        <button onClick={back} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 11, color: 'rgba(255,255,255,0.18)', padding: '4px 0',
        }}>← Back</button>
      </div>
    </div>
  )
}

function MRow({ icon, label, v }) {
  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
      <span style={{ fontSize:12, color:'var(--accent,#6366f1)', flexShrink:0, marginTop:1 }}>{icon}</span>
      <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', textTransform:'uppercase', letterSpacing:'0.08em', minWidth:56, flexShrink:0, paddingTop:2 }}>{label}</span>
      <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)', lineHeight:1.5 }}>{v}</span>
    </div>
  )
}

function Done({ formData, onDone }) {
  const [c, setC] = useState(5)
  useEffect(() => {
    const t = setInterval(() => setC(n => { if(n<=1){clearInterval(t);onDone();return 0}return n-1 }), 1000)
    return () => clearInterval(t)
  }, [])
  const name = formData.preferredName || formData.username || ''
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', margin:'0 auto 22px', background:'linear-gradient(135deg, var(--accent,#6366f1), var(--accent-2,#8b5cf6))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'#fff', boxShadow:'0 0 40px rgba(99,102,241,0.45)', animation:'popIn 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}>✓</div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:24, color:'rgba(255,255,255,0.88)', marginBottom:8 }}>
        {name ? `You're set, ${name}!` : "You're all set!"}
      </h2>
      <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.65, maxWidth:360, margin:'0 auto 24px' }}>
        Your AI already knows your context. Every reflection, pattern alert, and insight will be personalized from day one.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:28, textAlign:'left' }}>
        {[
          { icon:'◈', text:'Upload first entry',  hint:'via iPhone Shortcut' },
          { icon:'〜', text:'Nervous System',      hint:'mood tracking over time' },
          { icon:'⬡', text:'Pattern Detection',   hint:'AI runs automatically' },
          { icon:'✦', text:'Exit Plan',            hint:"when you're ready" },
        ].map((item,i) => (
          <div key={i} style={{ padding:'10px 13px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:9 }}>
            <div style={{ fontSize:13, color:'var(--accent,#6366f1)', marginBottom:3 }}>{item.icon}</div>
            <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.88)' }}>{item.text}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)' }}>{item.hint}</div>
          </div>
        ))}
      </div>
      <PrimaryBtn onClick={onDone} full style={{ padding:'13px 0', fontSize:14, boxShadow:'0 8px 28px rgba(99,102,241,0.28)' }}>Enter Dashboard →</PrimaryBtn>
      <div style={{ marginTop:10, fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)' }}>Redirecting in {c}s</div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Onboarding() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [step, setStep] = useState(0)
  const [key, setKey] = useState(0)
  const [form, setForm] = useState({
    preferredName:'', pronouns:'',
    situationType:'', situationStory:'',
    people:[], topics:[], goals:[],
    username:'', email:'', password:'', confirmPassword:'',
  })
  const upd = ch => setForm(d => ({ ...d, ...ch }))
  const next = () => { setKey(k=>k+1); setStep(s=>s+1); window.scrollTo(0,0) }
  const back = () => { setKey(k=>k+1); setStep(s=>s-1); window.scrollTo(0,0) }
  const handleReg = async () => { try { await login(form.username, form.password) } catch {} next() }
  const handleDone = () => navigate('/')

  const slides = [
    <Welcome next={next} />,
    <About   d={form} set={upd} next={next} back={back} />,
    <Situation d={form} set={upd} next={next} back={back} />,
    <People  d={form} set={upd} next={next} back={back} />,
    <Topics  d={form} set={upd} next={next} back={back} />,
    <Goals   d={form} set={upd} next={next} back={back} />,
    <Account d={form} set={upd} next={next} back={back} onReg={handleReg} />,
    <AIProviderStep next={next} back={back} />,
    <Memory  formData={form} next={next} back={back} />,
    <Done    formData={form} onDone={handleDone} />,
  ]

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#07070f', backgroundImage:'radial-gradient(ellipse 70% 40% at 50% -10%, rgba(99,102,241,0.18), transparent)', padding:'24px 16px' }}>
      {/* Grid */}
      <div style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)', backgroundSize:'44px 44px' }} />
      {/* Orbs */}
      <div style={{ position:'fixed', zIndex:0, width:340, height:340, borderRadius:'50%', background:'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)', top:'5%', left:'10%', pointerEvents:'none' }} />
      <div style={{ position:'fixed', zIndex:0, width:280, height:280, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', bottom:'8%', right:'8%', pointerEvents:'none' }} />

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:560 }}>
        {/* Wordmark */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:18, color:'var(--accent,#6366f1)', filter:'drop-shadow(0 0 10px rgba(99,102,241,0.5))' }}>✦</div>
          <div style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)', letterSpacing:'0.15em', textTransform:'uppercase', marginTop:3 }}>Journal Intelligence</div>
        </div>

        <Dots cur={step} />

        <div style={{ background:'#0d0d1e', border:'1px solid rgba(255,255,255,0.08)', borderRadius:18, padding:'32px 36px', boxShadow:'0 0 80px rgba(0,0,0,0.45), 0 0 40px rgba(99,102,241,0.06)' }}>
          <div key={`${step}-${key}`} style={{ animation:'up 0.3s cubic-bezier(0.22,1,0.36,1)' }}>
            {slides[step]}
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:12, fontSize:10, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.22)' }}>
          {STEPS[step]?.label} · {step+1} of {STEPS.length}
        </div>
      </div>

      <style>{`
        @keyframes up    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow  { 0%,100%{opacity:.65;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes popIn { 0%{transform:scale(0.4);opacity:0} 100%{transform:scale(1);opacity:1} }
        *{box-sizing:border-box;margin:0;padding:0;}
        input,select,textarea{font-family:inherit;}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:rgba(99,102,241,0.2);border-radius:2px}
      `}</style>
    </div>
  )
}
