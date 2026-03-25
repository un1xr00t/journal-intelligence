/**
 * DetectiveFull.jsx — pages/DetectiveFull.jsx
 * Full-screen Investigation Workspace. No sidebar.
 * Collapsible cases panel + collapsible Case Partner panel.
 * Adds: Intelligence tab (persistent AI case brief) + Wire History tab.
 * Opens from Detective.jsx "⬡ Full Workspace" button or DetectiveBanner.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import {
  card, mono, SEVERITY_COLORS, ENTRY_TYPES,
  CaseList, InvestigationLog, PhotoEvidence, GalleryView,
  CasePartner, AuthedImage,
} from './Detective'

// ── Style tokens ──────────────────────────────────────────────────────────────

const fullBg    = { background: 'var(--bg-base)' }
const headerH   = 52
const PANEL_W   = 248
const PARTNER_W = 360
const ICON_W    = 48

// ── Intelligence Panel ────────────────────────────────────────────────────────

function IntelligencePanel({ caseId }) {
  const [intel, setIntel]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRef]    = useState(false)
  const [expanded, setExpanded] = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/detective/cases/${caseId}/intelligence`)
      setIntel(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (caseId) load() }, [caseId])

  const refresh = async () => {
    setRef(true)
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/intelligence/refresh`)
      setIntel(r.data)
    } catch (e) {
      alert(e.response?.data?.detail || 'Refresh failed. Check your API key in Settings.')
    }
    setRef(false)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading intelligence brief…
    </div>
  )

  if (!intel?.summary) return (
    <div style={{ ...card, padding: 32, textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🧠</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 10 }}>
        No Intelligence Brief Yet
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
        Drop a Wire to generate your first case intelligence brief. This brief persists between sessions — your Case Partner reads it instead of loading all raw entries every time.
      </div>
      <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, borderTop: '1px solid var(--border)', paddingTop: 14, lineHeight: 1.6 }}>
        After each wire drop, the brief auto-updates and gets injected into every Case Partner chat — saving 60-70% on AI tokens.
      </div>
    </div>
  )

  // Parse sections from the summary
  const parseSection = (text, header) => {
    const re = new RegExp(`${header}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i')
    const m = text.match(re)
    return m ? m[1].trim() : null
  }

  const sections = [
    { key: 'core',       icon: '🔍', label: 'Core Picture',         color: '#6366f1' },
    { key: 'subjects',   icon: '👤', label: 'Key Subjects',          color: '#a855f7' },
    { key: 'patterns',   icon: '📈', label: 'Behavioral Patterns',   color: '#f59e0b' },
    { key: 'evidence',   icon: '🗂',  label: 'Critical Evidence',     color: '#22c55e' },
    { key: 'anomalies',  icon: '⚠️',  label: 'Anomalies / Red Flags', color: '#ef4444' },
    { key: 'action',     icon: '→',  label: 'Recommended Action',    color: '#38bdf8' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            🧠 Case Intelligence Brief
          </div>
          <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>
            {intel.entry_count} entries · {intel.wire_count} wire drop{intel.wire_count !== 1 ? 's' : ''} incorporated
            {intel.last_updated && ` · last updated ${intel.last_updated.slice(0, 16).replace('T', ' ')}`}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={refresh}
          disabled={refreshing}
          style={{
            background: refreshing ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: 8, color: refreshing ? 'var(--text-muted)' : 'var(--accent)',
            fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '6px 14px',
            cursor: refreshing ? 'not-allowed' : 'pointer', letterSpacing: '0.05em',
          }}
        >
          {refreshing ? '⟳ Updating…' : '⟳ Refresh Brief'}
        </button>
      </div>

      {/* Raw summary — beautifully formatted */}
      <div style={{ ...card, padding: 0, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.03)' }}>
        {/* Gradient header strip */}
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
        }} />

        <div style={{ padding: 24 }}>
          {/* Full formatted brief */}
          <pre style={{
            fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)',
            fontFamily: 'inherit', whiteSpace: 'pre-wrap', margin: 0,
            wordBreak: 'break-word',
          }}>
            {intel.summary}
          </pre>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 24px',
          borderTop: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>
            PERSISTENT BRIEF — auto-updates on wire drop · injected into every Case Partner chat
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 10, color: 'rgba(99,102,241,0.6)' }}>
            ≈ {Math.ceil(intel.summary.length / 4)} tokens saved per chat
          </span>
        </div>
      </div>

      {/* Token savings callout */}
      <div style={{ marginTop: 16, padding: '10px 16px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14 }}>⚡</span>
        <span style={{ ...mono, fontSize: 11, color: 'rgba(34,197,94,0.8)', lineHeight: 1.5 }}>
          Intelligence active — Case Partner reads this brief instead of loading all {intel.entry_count} raw entries.
          {intel.entry_count > 10 ? ` Estimated ${Math.round(intel.entry_count * 120 * 0.65)} tokens saved per conversation.` : ''}
        </span>
      </div>
    </div>
  )
}

// ── Wire History Panel ────────────────────────────────────────────────────────

function WireHistory({ caseId }) {
  const [wires, setWires]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [wiring, setWiring]     = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/detective/cases/${caseId}/wire-history`)
      setWires(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (caseId) load() }, [caseId])

  const dropNew = async () => {
    setWiring(true)
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/wire`)
      setWires(w => [{ id: Date.now(), briefing: r.data.briefing, created_at: new Date().toISOString() }, ...w])
      setExpanded(0)
    } catch (e) {
      alert(e.response?.data?.detail || 'Wire failed. Check your API key.')
    }
    setWiring(false)
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading wire history…
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18, color: 'var(--text-primary)' }}>
            📡 Wire History
          </div>
          <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, marginTop: 3 }}>
            {wires.length} intelligence briefing{wires.length !== 1 ? 's' : ''} on file
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={dropNew}
          disabled={wiring}
          style={{
            background: wiring ? 'rgba(99,102,241,0.1)' : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 8, color: 'var(--accent)',
            fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '7px 16px',
            cursor: wiring ? 'not-allowed' : 'pointer', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {wiring ? '📡 Dropping Wire…' : '📡 Drop New Wire'}
        </button>
      </div>

      {wires.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 8 }}>
            No Wires Dropped Yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
            Drop a Wire to get a full case briefing — your Case Partner reads everything and tells you exactly where things stand.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {wires.map((w, i) => (
            <div
              key={w.id}
              style={{
                ...card,
                border: expanded === i ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)',
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Header */}
              <div
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{
                  padding: '12px 18px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  cursor: 'pointer',
                  background: expanded === i ? 'rgba(99,102,241,0.06)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 16 }}>📡</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Wire Drop #{wires.length - i}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {w.created_at?.slice(0, 16).replace('T', ' ') || '—'}
                  </div>
                </div>
                <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.briefing?.slice(0, 80)}…
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, flexShrink: 0 }}>
                  {expanded === i ? '▲' : '▼'}
                </span>
              </div>

              {/* Expanded briefing */}
              {expanded === i && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ paddingTop: 16, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                    {w.briefing}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Export Tab ────────────────────────────────────────────────────────────────

function ExportTab({ caseId, caseName }) {
  const [exporting, setExporting] = useState(false)
  const [status,    setStatus]    = useState(null)  // null | 'generating' | 'done' | 'error'
  const [errorMsg,  setErrorMsg]  = useState('')

  const generate = async () => {
    setExporting(true)
    setStatus('generating')
    setErrorMsg('')
    try {
      const res = await api.post(
        `/api/detective/cases/${caseId}/export`,
        {},
        { responseType: 'blob' }
      )
      // Trigger browser download
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      const cd   = res.headers['content-disposition'] || ''
      const fnMatch = cd.match(/filename="([^"]+)"/)
      link.href     = url
      link.download = fnMatch ? fnMatch[1] : `case_report_${caseId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      setStatus('done')
    } catch (e) {
      const msg = e.response?.data?.detail
        || (e.response?.data instanceof Blob
            ? await e.response.data.text().then(t => { try { return JSON.parse(t).detail } catch { return t } })
            : null)
        || 'Export failed. Check logs.'
      setErrorMsg(msg)
      setStatus('error')
    }
    setExporting(false)
  }

  return (
    <div style={{ padding: 32, maxWidth: 700 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', marginBottom: 6 }}>
          📄 Export Case Report
        </div>
        <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>
          Generate a comprehensive PDF report of the entire case
        </div>
      </div>

      {/* What's included card */}
      <div style={{
        background: 'rgba(99,102,241,0.04)',
        border: '1px solid rgba(99,102,241,0.18)',
        borderRadius: 12, padding: '22px 24px', marginBottom: 24,
      }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 14 }}>
          What&apos;s included in the report
        </div>
        {[
          ['🎯', 'Cover Page', 'Case title, stats summary, generated timestamp'],
          ['🧠', 'Intelligence Brief', 'Full AI-synthesized case analysis (if generated)'],
          ['◷',  'Investigation Log', 'Every log entry with type, severity, content & attached photo analyses'],
          ['📡', 'Wire Briefings', 'Complete history of all wire drops, full text'],
          ['📷', 'Photo Evidence', 'Gallery thumbnails with AI analysis text'],
          ['🖼',  'Appendix', 'Full-resolution evidence photos embedded at the end'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={exporting}
        style={{
          width: '100%',
          padding: '14px 24px',
          background: exporting
            ? 'rgba(99,102,241,0.1)'
            : 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.25))',
          border: '1px solid rgba(99,102,241,0.45)',
          borderRadius: 10,
          color: exporting ? 'var(--text-muted)' : 'var(--text-primary)',
          fontFamily: 'Syne',
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: '0.04em',
          cursor: exporting ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {exporting ? (
          <>
            <span style={{ fontSize: 16 }}>⏳</span>
            Generating report…
          </>
        ) : (
          <>
            <span style={{ fontSize: 16 }}>📄</span>
            Generate &amp; Download PDF
          </>
        )}
      </button>

      {/* Status messages */}
      {status === 'done' && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: '#22c55e',
        }}>
          <span>✓</span>
          <span>Report downloaded successfully. Check your downloads folder.</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8,
          fontSize: 13, color: '#ef4444',
          lineHeight: 1.6,
        }}>
          <strong>Export failed:</strong> {errorMsg}
        </div>
      )}

      {/* Note about PDF backend */}
      <div style={{ marginTop: 20, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          PDF requires <strong>weasyprint</strong> on the server. If generation fails, run:
          <br />
          <span style={{ color: 'rgba(99,102,241,0.8)' }}>pip install weasyprint --break-system-packages</span>
        </div>
      </div>
    </div>
  )
}

// ── Collapsed Panel Stub ──────────────────────────────────────────────────────

function CollapsedCases({ cases, selected, onSelect, onOpen }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 12, gap: 8,
      background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
    }}>
      <button
        onClick={onOpen}
        title="Expand cases"
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, cursor: 'pointer', padding: '4px 0' }}
      >
        ▶
      </button>
      <div style={{ ...mono, fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', writingMode: 'vertical-rl', transform: 'rotate(180deg)', marginTop: 4 }}>
        Cases
      </div>
      <div style={{ flex: 1, overflowY: 'auto', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
        {cases.slice(0, 12).map(c => (
          <div
            key={c.id}
            onClick={() => { onSelect(c); onOpen() }}
            title={c.title}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: selected?.id === c.id ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${selected?.id === c.id ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 10,
              color: c.status === 'active' ? '#22c55e' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            ●
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Research Agent Modal ─────────────────────────────────────────────────────

const FOCUS_OPTIONS = [
  { key: 'social',     label: '📱 Social Media'     },
  { key: 'employment', label: '💼 Employment'        },
  { key: 'legal',      label: '⚖️ Legal Records'     },
  { key: 'news',       label: '📰 News & Press'      },
  { key: 'address',    label: '📍 Location (public)' },
  { key: 'business',   label: '🏢 Business Records'  },
]

function ResearchModal({ caseId, onClose, onSaved }) {
  const [subject, setSubject]   = useState('')
  const [context, setContext]   = useState('')
  const [focus, setFocus]       = useState([])
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [step, setStep]         = useState('form') // form | running | result

  const toggleFocus = (key) => setFocus(f => f.includes(key) ? f.filter(k => k !== key) : [...f, key])

  const run = async () => {
    if (!subject.trim()) return
    setStep('running')
    setLoading(true)
    setError(null)
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/research`, {
        subject: subject.trim(),
        context: context.trim() || null,
        focus: focus.length > 0 ? focus : null,
      })
      setResult(r.data)
      setStep('result')
    } catch (e) {
      setError(e.response?.data?.detail || 'Research agent failed. Check your Anthropic API key in Settings.')
      setStep('form')
    }
    setLoading(false)
  }

  const save = () => {
    if (onSaved) onSaved(result)
    onClose()
  }

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  }
  const modal = {
    background: 'var(--bg-card)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: 16,
    width: '100%',
    maxWidth: step === 'result' ? 760 : 520,
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  }
  const field = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  }
  const btn = (active) => ({
    padding: '6px 14px',
    background: active ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`,
    borderRadius: 6,
    color: active ? '#a5b4fc' : 'var(--text-muted)',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.15s',
  })

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={modal}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <div>
            <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Research Agent</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Searches public web sources and adds a report to your case log</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {step === 'form' && (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>
                  ⚠️ {error}
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Subject Name *
                </label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. John Smith"
                  style={field}
                  onKeyDown={e => e.key === 'Enter' && subject.trim() && run()}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Context (optional)
                </label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. Works at Acme Corp, claims to be from Denver, involved in incident on 3/10"
                  style={{ ...field, minHeight: 72, resize: 'vertical' }}
                  rows={3}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 10, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Focus Areas (all selected by default)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FOCUS_OPTIONS.map(f => (
                    <button key={f.key} onClick={() => toggleFocus(f.key)} style={btn(focus.includes(f.key))}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                ⚠️ This agent searches only publicly available information. It does not access private data, bypass authentication, or violate any privacy laws. Research is logged to your case file.
              </div>
            </div>
          )}

          {step === 'running' && (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 20, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>🔍</div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>
                Agent Searching the Web…
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                Searching social media, news, public records, and professional profiles.<br />
                This may take 30–90 seconds.
              </div>
              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 4 }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `pulse 1.2s ease-in-out ${i * 0.4}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div style={{ padding: 24 }}>
              <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#86efac', marginBottom: 16 }}>
                ✓ Research complete — report will be saved to your investigation log
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '18px 20px',
                fontFamily: 'IBM Plex Mono',
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.8,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {result.report}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          {step === 'result' ? (
            <button onClick={save} style={{ padding: '8px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Syne' }}>
              ✓ Saved to Case Log
            </button>
          ) : (
            <button
              onClick={run}
              disabled={!subject.trim() || loading}
              style={{ padding: '8px 18px', background: subject.trim() && !loading ? 'var(--accent)' : 'rgba(99,102,241,0.3)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: subject.trim() && !loading ? 'pointer' : 'default', fontFamily: 'Syne', transition: 'all 0.15s' }}
            >
              🔍 Run Agent
            </button>
          )}
        </div>

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>
    </div>
  )
}

// ── Research Reports Panel (tab view) ─────────────────────────────────────────

function ResearchPanel({ caseId, refreshKey }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/detective/cases/${caseId}/research`)
      setReports(r.data)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (caseId) load() }, [caseId, refreshKey])

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading reports…</div>
  )

  if (!reports.length) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 8 }}>No Research Reports Yet</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
        Click <strong>🔍 Research</strong> in the toolbar to deploy the agent.<br />
        Reports are saved here and automatically added to your case context.
      </div>
    </div>
  )

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reports.map(r => {
        const isOpen = expanded === r.id
        // Extract subject from content: "[RESEARCH AGENT REPORT]\nSubject: NAME\n\n..."
        const subjectMatch = r.content.match(/Subject:\s*(.+?)\n/)
        const subject = subjectMatch ? subjectMatch[1] : 'Research Report'
        const preview = r.content.replace(/\[RESEARCH AGENT REPORT\]\nSubject:.+?\n\n/, '').slice(0, 180) + '…'
        return (
          <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, overflow: 'hidden' }}>
            <div
              onClick={() => setExpanded(isOpen ? null : r.id)}
              style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 16 }}>🔍</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{subject}</div>
                {!isOpen && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</div>}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                {r.created_at?.slice(0, 10)}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                <div style={{
                  marginTop: 12,
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 480,
                  overflowY: 'auto',
                }}>
                  {r.content.replace('[RESEARCH AGENT REPORT]\n', '')}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main DetectiveFull Page ───────────────────────────────────────────────────

export default function DetectiveFull() {
  const navigate = useNavigate()

  const [access, setAccess]           = useState(null)
  const [cases, setCases]             = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [entries, setEntries]         = useState([])
  const [uploads, setUploads]         = useState([])
  const [creating, setCreating]       = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [wiring, setWiring]           = useState(false)
  const [activeTab, setActiveTab]     = useState('log')
  const [loadingEntries, setLE]       = useState(false)

  // Panel collapse state
  const [casesOpen,   setCasesOpen]   = useState(true)
  const [partnerOpen, setPartnerOpen] = useState(true)
  const [researchOpen, setResearchOpen] = useState(false)
  const [researchKey, setResearchKey]   = useState(0)

  // ── Access check ──
  useEffect(() => {
    api.get('/api/detective/access')
      .then(r => setAccess(r.data.has_access))
      .catch(() => setAccess(false))
  }, [])

  useEffect(() => {
    if (access) loadCases()
  }, [access])

  const loadCases = async () => {
    try {
      const r = await api.get('/api/detective/cases')
      setCases(r.data)
      if (r.data.length > 0 && !selectedCase) setSelectedCase(r.data[0])
    } catch {}
  }

  const selectCase = (c) => {
    setSelectedCase(c)
    setEntries([])
    setUploads([])
    setActiveTab('log')
  }

  useEffect(() => {
    if (selectedCase) { loadEntries(); loadUploads() }
  }, [selectedCase])

  const loadEntries = async () => {
    setLE(true)
    try {
      const r = await api.get(`/api/detective/cases/${selectedCase.id}/entries`)
      setEntries(r.data)
    } catch {}
    setLE(false)
  }

  const loadUploads = async () => {
    try {
      const r = await api.get(`/api/detective/cases/${selectedCase.id}/uploads`)
      setUploads(r.data)
    } catch {}
  }

  const addEntry = async (data) => {
    try {
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/entries`, data)
      setEntries(e => [r.data, ...e])
      return r.data
    } catch (e) { alert(e.response?.data?.detail || 'Failed to add entry.') }
  }

  const updateEntryAttachment = (entryId, attachData) => {
    setEntries(es => es.map(e => e.id === entryId ? { ...e, ...attachData } : e))
  }

  const deleteEntry = async (id) => {
    try {
      await api.delete(`/api/detective/cases/${selectedCase.id}/entries/${id}`)
      setEntries(e => e.filter(x => x.id !== id))
    } catch {}
  }

  const uploadPhoto = async (file) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploads(u => [r.data, ...u])
    } catch (e) { alert(e.response?.data?.detail || 'Upload failed.') }
    setUploading(false)
  }

  const deleteUpload = async (id) => {
    try {
      await api.delete(`/api/detective/cases/${selectedCase.id}/uploads/${id}`)
      setUploads(u => u.filter(x => x.id !== id))
    } catch {}
  }

  const dropWire = async () => {
    setWiring(true)
    try {
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/wire`)
      return r.data
    } finally { setWiring(false) }
  }

  const createCase = async (title) => {
    setCreating(true)
    try {
      const r = await api.post('/api/detective/cases', { title })
      setCases(c => [r.data, ...c])
      setSelectedCase(r.data)
    } catch {}
    setCreating(false)
  }

  if (access === null) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading workspace…</div>
    </div>
  )

  if (!access) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, color: 'var(--text-primary)' }}>Access Required</div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Detective Mode access not granted.</div>
      <button onClick={() => navigate('/detective')} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}>
        Back
      </button>
    </div>
  )

  const TABS = [
    { key: 'log',          label: '◷ Log'       },
    { key: 'photos',       label: '📷 Photos'   },
    { key: 'gallery',      label: '🖼 Gallery'   },
    { key: 'intelligence', label: '🧠 Intelligence' },
    { key: 'wires',        label: '📡 Wire History' },
    { key: 'export',       label: '📄 Export Report' },
    { key: 'research',     label: '🔍 Research'       },
  ]

  // Column widths based on open/collapsed state
  const leftW   = casesOpen   ? PANEL_W  : ICON_W
  const rightW  = partnerOpen ? PARTNER_W : ICON_W
  const showPartner = activeTab !== 'gallery' && activeTab !== 'intelligence' && activeTab !== 'wires' && activeTab !== 'export' && activeTab !== 'research'
  const effectiveRightW = showPartner ? rightW : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Research Agent Modal ── */}
      {researchOpen && selectedCase && (
        <ResearchModal
          caseId={selectedCase.id}
          onClose={() => setResearchOpen(false)}
          onSaved={(result) => {
            // Refresh entries + research tab
            loadEntries()
            setResearchKey(k => k + 1)
            setActiveTab('research')
          }}
        />
      )}

      {/* ── Top header bar ── */}
      <div style={{
        height: headerH, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 20px',
        background: 'linear-gradient(90deg, rgba(5,5,18,0.98), rgba(10,8,28,0.98))',
        borderBottom: '1px solid rgba(99,102,241,0.2)',
        boxShadow: '0 1px 20px rgba(0,0,0,0.4)',
      }}>
        <button
          onClick={() => navigate('/detective')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: 'IBM Plex Mono', letterSpacing: '0.05em', padding: '4px 8px', borderRadius: 6, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
        >
          ← back
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🕵</span>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'linear-gradient(90deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Investigation Workspace
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Active case badge */}
        {selectedCase && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, padding: '4px 12px' }}>
            <span style={{ fontSize: 8, color: selectedCase.status === 'active' ? '#22c55e' : 'var(--text-muted)' }}>●</span>
            <span style={{ fontFamily: 'Syne', fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{selectedCase.title}</span>
            <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{selectedCase.status}</span>
          </div>
        )}

        {/* Research Agent button */}
        {selectedCase && (
          <button
            onClick={() => setResearchOpen(true)}
            title='Deploy Research Agent'
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: '#a5b4fc', fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.22)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)' }}
          >
            🔍 Research
          </button>
        )}

        {/* Panel toggles */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setCasesOpen(o => !o)}
            title={casesOpen ? 'Collapse cases' : 'Expand cases'}
            style={{ background: casesOpen ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, color: casesOpen ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
          >
            {casesOpen ? '◀ Cases' : '▶ Cases'}
          </button>
          {showPartner && (
            <button
              onClick={() => setPartnerOpen(o => !o)}
              title={partnerOpen ? 'Collapse partner' : 'Expand partner'}
              style={{ background: partnerOpen ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, color: partnerOpen ? 'var(--accent)' : 'var(--text-muted)', fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              {partnerOpen ? 'Partner ▶' : 'Partner ◀'}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* ── Left: Cases panel ── */}
        <div style={{
          width: leftW,
          flexShrink: 0,
          transition: 'width 0.22s ease',
          borderRight: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          {casesOpen ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CaseList
                cases={cases}
                selected={selectedCase}
                onSelect={selectCase}
                onCreate={createCase}
                creating={creating}
              />
            </div>
          ) : (
            <CollapsedCases
              cases={cases}
              selected={selectedCase}
              onSelect={selectCase}
              onOpen={() => setCasesOpen(true)}
            />
          )}
        </div>

        {/* ── Center: Workspace ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* Tab bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0,
            borderBottom: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
            overflowX: 'auto',
          }}>
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '11px 20px',
                  background: 'none', border: 'none',
                  borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -1,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: activeTab === t.key ? 700 : 400,
                  fontFamily: activeTab === t.key ? 'Syne' : 'inherit',
                  color: activeTab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  letterSpacing: activeTab === t.key ? '0.02em' : '0',
                }}
                onMouseEnter={e => { if (activeTab !== t.key) e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { if (activeTab !== t.key) e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!selectedCase ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🕵</div>
                Select or create a case to begin.
              </div>
            ) : (
              <>
                {/* Case title bar */}
                <div style={{
                  padding: '10px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(0,0,0,0.15)',
                  flexShrink: 0,
                }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    {selectedCase.title}
                  </span>
                  {selectedCase.description && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedCase.description}</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>
                    {entries.length} entries · {uploads.length} photos
                  </span>
                </div>

                {activeTab === 'log' && (
                  <div style={{ padding: 20 }}>
                    <InvestigationLog
                      caseId={selectedCase.id}
                      entries={entries}
                      onAdd={addEntry}
                      onDelete={deleteEntry}
                      onAttachmentUpdate={updateEntryAttachment}
                      loading={loadingEntries}
                    />
                  </div>
                )}
                {activeTab === 'photos' && (
                  <div style={{ padding: 20 }}>
                    <PhotoEvidence
                      caseId={selectedCase.id}
                      uploads={uploads}
                      onUpload={uploadPhoto}
                      onDelete={deleteUpload}
                      uploading={uploading}
                    />
                  </div>
                )}
                {activeTab === 'gallery' && (
                  <GalleryView
                    caseId={selectedCase.id}
                    uploads={uploads}
                    onDelete={deleteUpload}
                  />
                )}
                {activeTab === 'intelligence' && (
                  <IntelligencePanel caseId={selectedCase.id} />
                )}
                {activeTab === 'wires' && (
                  <WireHistory caseId={selectedCase.id} />
                )}
                {activeTab === 'export' && (
                  <ExportTab caseId={selectedCase.id} caseName={selectedCase.title} />
                )}
                {activeTab === 'research' && (
                  <ResearchPanel caseId={selectedCase.id} refreshKey={researchKey} />
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Right: Case Partner ── */}
        {showPartner && (
          <div style={{
            width: partnerOpen ? PARTNER_W : ICON_W,
            flexShrink: 0,
            transition: 'width 0.22s ease',
            borderLeft: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {partnerOpen ? (
              <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {selectedCase ? (
                  <CasePartner
                    caseId={selectedCase.id}
                    caseName={selectedCase.title}
                    onWire={dropWire}
                    wiring={wiring}
                  />
                ) : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🕵️</div>
                    Select a case to talk to your Case Partner.
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', paddingTop: 14, gap: 8,
                background: 'var(--bg-card)',
              }}>
                <button
                  onClick={() => setPartnerOpen(true)}
                  title="Open Case Partner"
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer' }}
                >
                  🕵️
                </button>
                <div style={{ ...mono, fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  Partner
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
