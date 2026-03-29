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

const EXPORT_TONES = [
  {
    id: 'case_file',
    icon: '\u{1F5C2}',
    label: 'Case File',
    tag: 'INVESTIGATIVE',
    tagColor: '#ef4444',
    tagBg: 'rgba(239,68,68,0.12)',
    tagBorder: 'rgba(239,68,68,0.3)',
    desc: 'Full forensic report. Every entry, wire drop, photo, and AI analysis. Built to document everything, completely.',
    includes: ['Cover page with stats', 'AI intelligence brief', 'Full log with severity badges', 'Wire briefing history', 'Photo evidence + AI analysis', 'Full-res appendix'],
    accent: '#6366f1',
    glow: 'rgba(99,102,241,0.08)',
    border: 'rgba(99,102,241,0.25)',
  },
  {
    id: 'conversation',
    icon: '\u{1F4AC}',
    label: 'The Conversation',
    tag: 'PERSONAL',
    tagColor: '#a855f7',
    tagBg: 'rgba(168,85,247,0.12)',
    tagBorder: 'rgba(168,85,247,0.3)',
    desc: 'From you to her. The pattern, the evidence, your decision \u2014 written as a personal statement for when the talk happens.',
    includes: ['Personal statement cover', 'Pattern summary', 'What you documented', 'Your exchanges', 'Supporting evidence'],
    accent: '#a855f7',
    glow: 'rgba(168,85,247,0.07)',
    border: 'rgba(168,85,247,0.22)',
  },
  {
    id: 'personal_record',
    icon: '\u{1F4CB}',
    label: 'Personal Record',
    tag: 'ARCHIVAL',
    tagColor: '#38bdf8',
    tagBg: 'rgba(56,189,248,0.1)',
    tagBorder: 'rgba(56,189,248,0.25)',
    desc: 'Clean, readable account for therapy, legal consultation, or long-term archives. No forensic badge clutter.',
    includes: ['Neutral cover', 'AI analysis summary', 'Chronological journal record', 'Correspondence log', 'Supporting materials'],
    accent: '#38bdf8',
    glow: 'rgba(56,189,248,0.06)',
    border: 'rgba(56,189,248,0.2)',
  },
]

function ExportTab({ caseId, caseName }) {
  const [tone,      setTone]      = useState('case_file')
  const [exporting, setExporting] = useState(false)
  const [status,    setStatus]    = useState(null)
  const [errorMsg,  setErrorMsg]  = useState('')

  const generate = async () => {
    setExporting(true)
    setStatus('generating')
    setErrorMsg('')
    try {
      const res = await api.post(
        `/api/detective/cases/${caseId}/export?tone=${tone}`,
        {},
        { responseType: 'blob' }
      )
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      const cd   = res.headers['content-disposition'] || ''
      const fnMatch = cd.match(/filename="([^"]+)"/)
      link.href     = url
      link.download = fnMatch ? fnMatch[1] : `case_report_${caseId}_${tone}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      setStatus('done')
    } catch (e) {
      const msg = e.response?.data?.detail
        || (e.response?.data instanceof Blob
            ? await e.response.data.text().then(t => { try { return JSON.parse(t).detail } catch (_) { return t } })
            : null)
        || 'Export failed. Check logs.'
      setErrorMsg(msg)
      setStatus('error')
    }
    setExporting(false)
  }

  const selected = EXPORT_TONES.find(t => t.id === tone)

  return (
    <div style={{ padding: '36px 40px', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>
          Export Report
        </div>
        <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Choose a format &mdash; each produces a different kind of PDF
        </div>
      </div>

      {/* Tone cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {EXPORT_TONES.map(t => {
          const isSel = tone === t.id
          return (
            <div
              key={t.id}
              onClick={() => { setTone(t.id); setStatus(null) }}
              style={{
                background: isSel ? t.glow : 'rgba(255,255,255,0.015)',
                border: `1px solid ${isSel ? t.border : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 12,
                padding: '18px 20px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isSel && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: t.accent, borderRadius: '12px 0 0 12px',
                }} />
              )}

              <div style={{ fontSize: 22, flexShrink: 0, marginTop: 2, opacity: isSel ? 1 : 0.45, transition: 'opacity 0.15s' }}>
                {t.icon}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                  <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 14, color: isSel ? '#fff' : 'rgba(232,234,246,0.8)', transition: 'color 0.15s' }}>
                    {t.label}
                  </span>
                  <span style={{
                    fontFamily: 'IBM Plex Mono', fontSize: 9, letterSpacing: '0.14em',
                    background: t.tagBg, border: `1px solid ${t.tagBorder}`,
                    color: t.tagColor, borderRadius: 4, padding: '2px 7px',
                  }}>
                    {t.tag}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(232,234,246,0.55)', lineHeight: 1.55, marginBottom: isSel ? 12 : 0 }}>
                  {t.desc}
                </div>
                {isSel && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {t.includes.map(item => (
                      <span key={item} style={{
                        fontFamily: 'IBM Plex Mono', fontSize: 9,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4, padding: '3px 7px',
                        color: 'rgba(232,234,246,0.45)',
                      }}>
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{
                width: 17, height: 17, borderRadius: '50%', flexShrink: 0, marginTop: 3,
                border: `2px solid ${isSel ? t.accent : 'rgba(255,255,255,0.18)'}`,
                background: isSel ? t.accent : 'transparent',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSel && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
              </div>
            </div>
          )
        })}
      </div>

      {/* Generate button */}
      <button
        onClick={generate}
        disabled={exporting}
        style={{
          width: '100%',
          padding: '15px 24px',
          background: exporting ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${selected.glow}, rgba(0,0,0,0.15))`,
          border: `1px solid ${exporting ? 'rgba(255,255,255,0.08)' : selected.border}`,
          borderRadius: 10,
          color: exporting ? 'var(--text-muted)' : '#fff',
          fontFamily: 'Syne',
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: exporting ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {exporting ? (
          <span>Generating PDF&hellip;</span>
        ) : (
          <span>{selected.icon}&nbsp;&nbsp;Generate {selected.label}</span>
        )}
      </button>

      {/* Status */}
      {status === 'done' && (
        <div style={{
          padding: '11px 15px', marginBottom: 12,
          background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12, color: '#22c55e',
        }}>
          <span>&#10003;</span>
          <span>Downloaded &mdash; check your downloads folder.</span>
        </div>
      )}

      {status === 'error' && (
        <div style={{
          padding: '11px 15px', marginBottom: 12,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, fontSize: 12, color: '#ef4444', lineHeight: 1.6,
        }}>
          <strong>Export failed:</strong> {errorMsg}
        </div>
      )}

      {/* Tip */}
      <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'rgba(123,130,166,0.55)', lineHeight: 1.6 }}>
          Requires <strong style={{ color: 'rgba(123,130,166,0.85)' }}>weasyprint</strong> on the server.
          &nbsp;If it fails:&nbsp;
          <span style={{ color: 'rgba(99,102,241,0.65)' }}>pip install weasyprint --break-system-packages</span>
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

// ── Search module definitions ─────────────────────────────────────────────────

const SEARCH_MODULES = [
  { key: 'social',   icon: '👤', label: 'Social Media',       desc: 'LinkedIn, Twitter, Facebook, Instagram, TikTok, Reddit' },
  { key: 'court',    icon: '⚖️', label: 'Court & Legal',      desc: 'Criminal history, restraining orders, civil litigation' },
  { key: 'news',     icon: '📰', label: 'News Archive',        desc: 'Local papers, press mentions, archived articles' },
  { key: 'business', icon: '🏢', label: 'Business & LLC',      desc: 'Registrations, UCC filings, corporate officer records' },
  { key: 'licenses', icon: '🪪', label: 'Professional Licenses', desc: 'State license databases, certifications, regulatory filings' },
  { key: 'address',  icon: '📍', label: 'Address History',     desc: 'Voter registration, property tax, public filed addresses' },
  { key: 'phone',    icon: '📞', label: 'Phone Lookup',        desc: 'White pages, reverse directories, public listings' },
]

// ── Photo parser ──────────────────────────────────────────────────────────────

function parsePhotoLines(text) {
  const photos = []
  const lines = text.split('\n')
  for (const line of lines) {
    const m = line.match(/^\[PHOTO_URL\]:\s*(https?:\/\/\S+)\s*\|\s*Source:\s*(.+?)\s*\|\s*Caption:\s*(.+)$/)
    if (m) {
      photos.push({ url: m[1].trim(), source: m[2].trim(), caption: m[3].trim() })
    }
  }
  return photos
}

// ── Strip photo lines from text (so they don't appear in the text body) ───────

function stripPhotoLines(text) {
  return text.split('\n').filter(l => !l.match(/^\[PHOTO_URL\]:/)).join('\n')
}

// ── Photo grid component ──────────────────────────────────────────────────────

function PhotoGrid({ photos }) {
  const [failed, setFailed] = useState({})
  if (!photos.length) return null
  const visible = photos.filter((_, i) => !failed[i])
  if (!visible.length) return null
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
        📸 Possible Matched Photos
        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>— verify manually before relying on any match</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
        {photos.map((p, i) => failed[i] ? null : (
          <div key={i} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <img
              src={p.url}
              alt={p.caption}
              onError={() => setFailed(f => ({ ...f, [i]: true }))}
              style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
            <div style={{ padding: '5px 7px' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: '#a5b4fc', marginBottom: 2 }}>{p.source}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.caption}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResearchModal({ caseId, onClose, onSaved }) {
  const [subject, setSubject]   = useState('')
  const [context, setContext]   = useState('')
  const [focus, setFocus]       = useState([])
  const [identifiers, setIdent] = useState({ location: '', employer: '', relationship: '', age_range: '' })
  const [includePhotos, setIncludePhotos] = useState(true)
  const [searchOpts, setSearchOpts] = useState(['court', 'business', 'social', 'news', 'licenses'])
  const [showAdvanced, setShowAdvanced] = useState(false)
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
      const cleanIdent = Object.fromEntries(Object.entries(identifiers).filter(([, v]) => v.trim()))
      const r = await api.post(`/api/detective/cases/${caseId}/research`, {
        subject: subject.trim(),
        context: context.trim() || null,
        focus: focus.length > 0 ? focus : null,
        identifiers: Object.keys(cleanIdent).length > 0 ? cleanIdent : null,
        include_photos: includePhotos,
        search_options: searchOpts.length > 0 ? searchOpts : null,
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

              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                  🎯 Identity Anchors <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', textTransform: 'none', letterSpacing: 0 }}>— helps the agent find the RIGHT person, not just anyone with this name</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'IBM Plex Mono' }}>City / Location</label>
                    <input
                      value={identifiers.location}
                      onChange={e => setIdent(p => ({ ...p, location: e.target.value }))}
                      placeholder="e.g. Austin, TX"
                      style={{ ...field, fontSize: 12, padding: '7px 10px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'IBM Plex Mono' }}>Employer / Organization</label>
                    <input
                      value={identifiers.employer}
                      onChange={e => setIdent(p => ({ ...p, employer: e.target.value }))}
                      placeholder="e.g. Acme Corp"
                      style={{ ...field, fontSize: 12, padding: '7px 10px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'IBM Plex Mono' }}>Relationship to You</label>
                    <input
                      value={identifiers.relationship}
                      onChange={e => setIdent(p => ({ ...p, relationship: e.target.value }))}
                      placeholder="e.g. ex-partner, coworker"
                      style={{ ...field, fontSize: 12, padding: '7px 10px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'IBM Plex Mono' }}>Approx. Age / Age Range</label>
                    <input
                      value={identifiers.age_range}
                      onChange={e => setIdent(p => ({ ...p, age_range: e.target.value }))}
                      placeholder="e.g. mid-30s, born ~1990"
                      style={{ ...field, fontSize: 12, padding: '7px 10px' }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Additional Context (optional)
                </label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="e.g. involved in incident on 3/10, claims to be a contractor, drives a blue truck"
                  style={{ ...field, minHeight: 60, resize: 'vertical' }}
                  rows={2}
                />
              </div>

              <div>
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <span>⚙️</span>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Search Options</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10 }}>{showAdvanced ? '▲ Hide' : '▼ Configure'}</span>
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: 12, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>

                    {/* Photo toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>📸 Photo Search</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Attempt to find and return profile / identity photos</div>
                      </div>
                      <button
                        onClick={() => setIncludePhotos(v => !v)}
                        style={{ padding: '5px 14px', background: includePhotos ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)', border: `1px solid ${includePhotos ? 'rgba(99,102,241,0.5)' : 'var(--border)'}`, borderRadius: 20, color: includePhotos ? '#a5b4fc' : 'var(--text-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
                      >
                        {includePhotos ? '✓ On' : 'Off'}
                      </button>
                    </div>

                    {/* Search modules */}
                    <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Search Modules</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {SEARCH_MODULES.map(m => {
                        const active = searchOpts.includes(m.key)
                        return (
                          <div
                            key={m.key}
                            onClick={() => setSearchOpts(s => active ? s.filter(k => k !== m.key) : [...s, m.key])}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: active ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.02)', border: `1px solid ${active ? 'rgba(99,102,241,0.35)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}
                          >
                            <span style={{ fontSize: 15, flexShrink: 0 }}>{m.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: active ? '#a5b4fc' : 'var(--text-primary)', fontWeight: 600 }}>{m.label}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{m.desc}</div>
                            </div>
                            <div style={{ width: 16, height: 16, borderRadius: 4, background: active ? 'var(--accent)' : 'transparent', border: `2px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {active && <span style={{ fontSize: 9, color: '#fff', fontWeight: 800 }}>✓</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
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
                {stripPhotoLines(result.report)}
              </div>
              <PhotoGrid photos={parsePhotoLines(result.report)} />
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
                {(() => {
                  const reportText = r.content.replace('[RESEARCH AGENT REPORT]\n', '')
                  const photos = parsePhotoLines(reportText)
                  const cleanText = stripPhotoLines(reportText)
                  return (
                    <>
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
                        {cleanText}
                      </div>
                      {photos.length > 0 && <PhotoGrid photos={photos} />}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


// ── Detective Settings Panel ──────────────────────────────────────────────────

function DetectiveSettings() {
  const [form, setForm] = useState({
    investigator_name: '',
    investigator_pronouns: '',
    background_context: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    api.get('/api/detective/settings')
      .then(r => setForm(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await api.post('/api/detective/settings', form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      alert(e.response?.data?.detail || 'Save failed.')
    }
    setSaving(false)
  }

  const field = {
    width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
    outline: 'none', transition: 'border-color 0.15s',
  }
  const label = {
    fontSize: 11, fontFamily: 'IBM Plex Mono', textTransform: 'uppercase',
    letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6, display: 'block',
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Loading settings…
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)', marginBottom: 6 }}>
        ⚙️ Detective Settings
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.7 }}>
        These settings are injected into all AI photo analyses and case partner conversations so the AI knows who's who.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Investigator real name */}
        <div>
          <label style={label}>Your Real Name</label>
          <input
            type="text"
            value={form.investigator_name}
            onChange={e => setForm(f => ({ ...f, investigator_name: e.target.value }))}
            placeholder="e.g. Alex"
            style={field}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.6 }}>
            Used in photo analysis so the AI knows you are never a participant in screenshots unless explicitly mentioned. Example: "Alex".
          </div>
        </div>

        {/* Pronouns */}
        <div>
          <label style={label}>Your Pronouns (optional)</label>
          <input
            type="text"
            value={form.investigator_pronouns}
            onChange={e => setForm(f => ({ ...f, investigator_pronouns: e.target.value }))}
            placeholder="e.g. he/him"
            style={{ ...field, maxWidth: 200 }}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* Background context */}
        <div>
          <label style={label}>Background Context (optional)</label>
          <textarea
            value={form.background_context}
            onChange={e => setForm(f => ({ ...f, background_context: e.target.value }))}
            placeholder="e.g. I am documenting an abusive relationship. The subject has a history of manipulation and gaslighting."
            style={{ ...field, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }}
            rows={3}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.6 }}>
            Injected into photo analysis and AI chat to provide broader context. Keep it concise.
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 24px',
            background: saving ? 'rgba(99,102,241,0.3)' : saved ? 'rgba(16,185,129,0.3)' : 'var(--accent)',
            border: saved ? '1px solid rgba(16,185,129,0.5)' : 'none',
            borderRadius: 8, color: '#fff',
            fontSize: 13, fontWeight: 700, fontFamily: 'Syne',
            cursor: saving ? 'default' : 'pointer',
            transition: 'all 0.2s', alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
        </button>

      </div>

      <div style={{ marginTop: 36, padding: '16px 18px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
        <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 12, color: 'var(--text-primary)', marginBottom: 8 }}>How this works</div>
        When you attach photos to a log entry and run Combined Analysis, the AI is told exactly who you are, who the case subject is, and how to map iMessage bubbles to real names. Instead of "the gray bubble sender," it will say "[Subject] sent 4 texts between 9:23–9:25 AM accusing [your name] of ignoring her calls" — using the real names you've configured.
      </div>
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
  const [casesOpen,   setCasesOpen]   = useState(false)
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
    { key: 'settings',     label: '⚙️ Settings'      },
  ]

  // Column widths based on open/collapsed state
  const leftW   = casesOpen   ? PANEL_W  : ICON_W
  const rightW  = partnerOpen ? PARTNER_W : ICON_W
  const showPartner = activeTab !== 'gallery' && activeTab !== 'intelligence' && activeTab !== 'wires' && activeTab !== 'export' && activeTab !== 'research' && activeTab !== 'settings'
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
                {activeTab === 'settings' && (
                  <DetectiveSettings />
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
