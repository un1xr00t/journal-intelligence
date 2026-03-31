import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const PURPOSES = [
  { key: 'general',   label: 'General',    icon: '◎', desc: 'For anyone who needs to understand' },
  { key: 'therapist', label: 'Therapist',  icon: '⊕', desc: 'Clinical context, patterns & impact' },
  { key: 'lawyer',    label: 'Lawyer',     icon: '⊞', desc: 'Evidence-grounded, factual brief' },
  { key: 'family',    label: 'Family',     icon: '◉', desc: 'Warm, accessible, honest' },
  { key: 'friend',    label: 'Friend',     icon: '◌', desc: 'Real and direct, no softening' },
  { key: 'court',     label: 'Court',      icon: '◈', desc: 'Documented facts & conduct patterns' },
]

const STYLES = [
  { key: 'advocate', label: 'Advocate',  desc: 'Third person — someone in your corner explaining everything' },
  { key: 'personal', label: 'First Person', desc: 'Written as if you finally found the words yourself' },
  { key: 'clinical', label: 'Clinical',  desc: 'Structured sections, precise language' },
  { key: 'timeline', label: 'Timeline',  desc: 'Chronological arc showing how things progressed' },
]

const JOURNAL_COUNTS = [5, 10, 20, 30, 50]

// ── Helpers ────────────────────────────────────────────────────────────────────

function purposeColor(key) {
  const map = {
    general:   '#6366f1',
    therapist: '#22c55e',
    lawyer:    '#f59e0b',
    family:    '#ec4899',
    friend:    '#06b6d4',
    court:     '#ef4444',
  }
  return map[key] || '#6366f1'
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
  } else {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontFamily: 'IBM Plex Mono',
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 24px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function PurposeButton({ p, selected, onClick }) {
  const color = purposeColor(p.key)
  return (
    <button
      onClick={() => onClick(p.key)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '12px 14px',
        background: selected ? `${color}15` : 'var(--surface)',
        border: `1.5px solid ${selected ? color : 'var(--border)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        flex: '1 1 calc(33% - 8px)',
        minWidth: 120,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: selected ? color : 'var(--text)',
        fontFamily: 'IBM Plex Mono',
      }}>
        {p.label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {p.desc}
      </span>
    </button>
  )
}

function StyleButton({ s, selected, onClick }) {
  return (
    <button
      onClick={() => onClick(s.key)}
      style={{
        padding: '10px 14px',
        background: selected ? 'var(--accent)' : 'var(--surface)',
        border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        flex: '1 1 calc(50% - 6px)',
      }}
    >
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: selected ? 'var(--bg)' : 'var(--text)',
        fontFamily: 'IBM Plex Mono',
        marginBottom: 2,
      }}>
        {s.label}
      </div>
      <div style={{ fontSize: 11, color: selected ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>
        {s.desc}
      </div>
    </button>
  )
}

function CaseCheckbox({ c, checked, onChange }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      padding: '10px 12px',
      background: checked ? 'var(--accent)11' : 'var(--surface)',
      border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 8,
      cursor: 'pointer',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'IBM Plex Mono' }}>
          {c.title}
        </div>
        {c.description && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.description}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontFamily: 'IBM Plex Mono' }}>
          {c.entry_count} log {c.entry_count === 1 ? 'entry' : 'entries'} · {c.status}
        </div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(c.id, e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 18, height: 18, flexShrink: 0, cursor: 'pointer' }}
      />
    </label>
  )
}

function NarrativeResult({ narrative, onSave, onCopy, onExport, saved, copying, saving, exporting }) {
  const accentColor = '#6366f1'
  return (
    <div style={{
      background: 'var(--card)',
      border: `1px solid ${accentColor}40`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        background: `${accentColor}12`,
        borderBottom: `1px solid ${accentColor}30`,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>✦</span>
          <span style={{
            fontSize: 12,
            fontFamily: 'IBM Plex Mono',
            fontWeight: 600,
            color: accentColor,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Your Story
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCopy}
            style={{
              padding: '5px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              color: copying ? '#22c55e' : 'var(--text)',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
            }}
          >
            {copying ? '✓ Copied' : 'Copy'}
          </button>
          <button
            onClick={onExport}
            disabled={exporting}
            style={{
              padding: '5px 14px',
              background: exporting ? 'rgba(99,102,241,0.5)' : '#6366f1',
              border: '1px solid transparent',
              borderRadius: 6,
              fontSize: 12,
              color: '#fff',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontWeight: 600,
            }}
          >
            {exporting ? '...' : 'Export'}
          </button>
          <span style={{
            padding: '5px 14px',
            fontSize: 12,
            fontFamily: 'IBM Plex Mono',
            color: '#22c55e',
          }}>
            ✓ Auto-saved
          </span>
        </div>
      </div>

      {/* Narrative text */}
      <div style={{
        padding: '28px 28px',
        lineHeight: 1.85,
        fontSize: 15,
        color: 'var(--text)',
        whiteSpace: 'pre-wrap',
        fontFamily: 'Georgia, serif',
      }}>
        {narrative}
      </div>
    </div>
  )
}

function DraftCard({ draft, onLoad, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  const purposeLabel = PURPOSES.find(p => p.key === draft.output_purpose)?.label || draft.output_purpose
  const color = purposeColor(draft.output_purpose)

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {draft.title}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 10,
            fontFamily: 'IBM Plex Mono',
            color: color,
            background: `${color}18`,
            padding: '2px 7px',
            borderRadius: 4,
            textTransform: 'uppercase',
          }}>
            {purposeLabel}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
            {(draft.created_at || '').slice(0, 10)}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onLoad(draft)}
          style={{
            padding: '5px 12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 11,
            color: 'var(--text)',
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono',
          }}
        >
          Load
        </button>
        {confirming ? (
          <button
            onClick={() => onDelete(draft.id)}
            style={{
              padding: '5px 12px',
              background: '#ef444420',
              border: '1px solid #ef4444',
              borderRadius: 6,
              fontSize: 11,
              color: '#ef4444',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
            }}
          >
            Confirm
          </button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            style={{
              padding: '5px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MyStory() {
  const [cases, setCases]             = useState([])
  const [hasDetective, setHasDetective] = useState(false)
  const [selectedCases, setSelectedCases] = useState([])
  const [includeJournal, setIncludeJournal] = useState(true)
  const [journalCount, setJournalCount] = useState(20)
  const [manualContext, setManualContext] = useState('')
  const [includeFairness, setIncludeFairness] = useState(false)
  const [purpose, setPurpose]         = useState('general')
  const [style, setStyle]             = useState('advocate')
  const [narrative, setNarrative]     = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [copied, setCopied]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [saving, setSaving]           = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [exportError, setExportError] = useState('')
  const [drafts, setDrafts]           = useState([])
  const [draftsLoading, setDraftsLoading] = useState(true)
  const [draftTitle, setDraftTitle]   = useState('')
  const [showDrafts, setShowDrafts]   = useState(false)
  const [activeTab, setActiveTab]     = useState('build') // build | drafts
  const resultRef = useRef(null)

  useEffect(() => {
    api.get('/api/my-story/cases').then(r => {
      setCases(r.data.cases || [])
      setHasDetective(r.data.has_detective_access || false)
    }).catch(() => {})

    api.get('/api/my-story/drafts').then(r => {
      setDrafts(r.data || [])
    }).catch(() => {}).finally(() => setDraftsLoading(false))
  }, [])

  function toggleCase(id, checked) {
    setSelectedCases(prev =>
      checked ? [...prev, id] : prev.filter(x => x !== id)
    )
  }

  async function generate() {
    setError('')
    setNarrative('')
    setSaved(false)

    if (!includeJournal && selectedCases.length === 0 && !manualContext.trim()) {
      setError('Please select at least one data source.')
      return
    }

    setLoading(true)
    try {
      const resp = await api.post('/api/my-story/generate', {
        case_ids: selectedCases,
        include_journal: includeJournal,
        journal_entry_count: journalCount,
        manual_context: manualContext,
        include_fairness: includeFairness,
        output_purpose: purpose,
        output_style: style,
      })
      const generatedNarrative = resp.data.narrative
      const title = `My Story — ${PURPOSES.find(p => p.key === purpose)?.label || purpose}`
      setNarrative(generatedNarrative)
      setDraftTitle(title)

      // Auto-save
      try {
        const sourcesParts = []
        if (includeJournal) sourcesParts.push(`${journalCount} journal entries`)
        if (selectedCases.length) sourcesParts.push(`${selectedCases.length} case(s)`)
        if (manualContext.trim()) sourcesParts.push('manual context')
        await api.post('/api/my-story/drafts', {
          title,
          generated_text: generatedNarrative,
          manual_context: manualContext,
          output_purpose: purpose,
          sources_summary: sourcesParts.join(', '),
        })
        setSaved(true)
        const r = await api.get('/api/my-story/drafts')
        setDrafts(r.data || [])
      } catch (_) {}

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Something went wrong generating your story.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!narrative || saving || saved) return
    setSaving(true)
    try {
      const title = draftTitle || `My Story — ${new Date().toLocaleDateString()}`
      const sourcesParts = []
      if (includeJournal) sourcesParts.push(`${journalCount} journal entries`)
      if (selectedCases.length) sourcesParts.push(`${selectedCases.length} case(s)`)
      if (manualContext.trim()) sourcesParts.push('manual context')

      await api.post('/api/my-story/drafts', {
        title,
        generated_text: narrative,
        manual_context: manualContext,
        output_purpose: purpose,
        sources_summary: sourcesParts.join(', '),
      })
      setSaved(true)
      // Refresh drafts
      const r = await api.get('/api/my-story/drafts')
      setDrafts(r.data || [])
    } catch (e) {
      setError('Failed to save draft.')
    } finally {
      setSaving(false)
    }
  }

  function handleCopy() {
    copyToClipboard(narrative)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleExport() {
    if (!narrative || exporting) return
    setExporting(true)
    setExportError('')
    try {
      const sources = {
        journal_entries: includeJournal,
        case_ids: selectedCases,
        has_manual_context: !!manualContext.trim(),
        include_fairness: includeFairness,
      }
      const resp = await api.post('/api/my-story/export-pdf', {
        narrative,
        display_name: narrative.split(' ')[0] || 'Author',
        purpose,
        style,
        sources,
      }, { responseType: 'blob' })

      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `my_story_${purpose}_${new Date().toISOString().slice(0,10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError('Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  function loadDraft(draft) {
    api.get(`/api/my-story/drafts/${draft.id}`).then(r => {
      setNarrative(r.data.generated_text || '')
      setManualContext(r.data.manual_context || '')
      setPurpose(r.data.output_purpose || 'general')
      setSaved(true)
      setActiveTab('build')
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }).catch(() => setError('Failed to load draft.'))
  }

  async function deleteDraft(id) {
    await api.delete(`/api/my-story/drafts/${id}`)
    setDrafts(prev => prev.filter(d => d.id !== id))
  }

  const canGenerate = includeJournal || selectedCases.length > 0 || manualContext.trim()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 0 60px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 24 }}>✦</span>
          <h1 style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            fontFamily: 'IBM Plex Mono',
            color: 'var(--text)',
          }}>
            My Story
          </h1>
        </div>
        <p style={{
          margin: 0,
          fontSize: 14,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          maxWidth: 560,
        }}>
          Let AI help you explain what you've been going through — pulling from your journal,
          your cases, and anything you add here. Written in your corner.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        background: 'var(--surface)',
        borderRadius: 10,
        padding: 4,
        width: 'fit-content',
      }}>
        {[
          { key: 'build', label: 'Build' },
          { key: 'drafts', label: `Drafts${drafts.length ? ` (${drafts.length})` : ''}` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '7px 20px',
              background: activeTab === tab.key ? 'var(--card)' : 'transparent',
              border: 'none',
              borderRadius: 7,
              cursor: 'pointer',
              fontSize: 13,
              fontFamily: 'IBM Plex Mono',
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── BUILD TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'build' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Data Sources */}
          <Card>
            <SectionHeader>1 — Data Sources</SectionHeader>

            {/* Journal toggle */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              background: includeJournal ? 'var(--accent)11' : 'var(--surface)',
              border: `1px solid ${includeJournal ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10,
              cursor: 'pointer',
              marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'IBM Plex Mono' }}>
                    Journal Entries
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Your personal journal logs — moods, events, thoughts
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {includeJournal && (
                  <select
                    value={journalCount}
                    onChange={e => setJournalCount(Number(e.target.value))}
                    onClick={e => e.stopPropagation()}
                    style={{
                      padding: '4px 8px',
                      background: 'var(--card)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12,
                      color: 'var(--text)',
                      fontFamily: 'IBM Plex Mono',
                      cursor: 'pointer',
                    }}
                  >
                    {JOURNAL_COUNTS.map(n => (
                      <option key={n} value={n}>Last {n} entries</option>
                    ))}
                  </select>
                )}
                <input
                  type="checkbox"
                  checked={includeJournal}
                  onChange={e => setIncludeJournal(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
              </div>
            </label>

            {/* Detective cases */}
            {hasDetective && cases.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'IBM Plex Mono' }}>
                  DETECTIVE CASES — select to include
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cases.map(c => (
                    <CaseCheckbox
                      key={c.id}
                      c={c}
                      checked={selectedCases.includes(c.id)}
                      onChange={toggleCase}
                    />
                  ))}
                </div>
              </div>
            )}


            {/* Fairness Ledger toggle */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              background: includeFairness ? 'var(--accent)11' : 'var(--surface)',
              border: `1px solid ${includeFairness ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 10,
              cursor: 'pointer',
              marginTop: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚖</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'IBM Plex Mono' }}>
                    Fairness Ledger
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Who does what — contributions, task logs, AI fairness summary
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={includeFairness}
                onChange={e => setIncludeFairness(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </label>

            {!hasDetective && (
              <div style={{
                padding: '10px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}>
                🕵 Detective Mode not activated — case data won't be available.
              </div>
            )}
          </Card>

          {/* Manual context */}
          <Card>
            <SectionHeader>2 — Add Context</SectionHeader>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Add anything the AI doesn't have — specific incidents, patterns you've noticed,
              things you want it to understand that aren't in your journal yet.
            </p>
            <textarea
              value={manualContext}
              onChange={e => setManualContext(e.target.value)}
              placeholder="e.g. She's been showing people a curated version of herself for years — posting photos with our son to make her family think she does everything. She tells her mom I'm absent when I'm the one who shows up. I've been documenting this but I need someone to help me explain how it all adds up..."
              rows={6}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                color: 'var(--text)',
                resize: 'vertical',
                lineHeight: 1.65,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </Card>

          {/* Purpose */}
          <Card>
            <SectionHeader>3 — Who Is This For?</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PURPOSES.map(p => (
                <PurposeButton
                  key={p.key}
                  p={p}
                  selected={purpose === p.key}
                  onClick={setPurpose}
                />
              ))}
            </div>
          </Card>

          {/* Style */}
          <Card>
            <SectionHeader>4 — Writing Style</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {STYLES.map(s => (
                <StyleButton
                  key={s.key}
                  s={s}
                  selected={style === s.key}
                  onClick={setStyle}
                />
              ))}
            </div>
          </Card>

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || !canGenerate}
            style={{
              width: '100%',
              padding: '16px 24px',
              background: loading || !canGenerate ? 'var(--surface)' : 'var(--accent)',
              border: `1px solid ${loading || !canGenerate ? 'var(--border)' : 'transparent'}`,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'IBM Plex Mono',
              color: loading || !canGenerate ? 'var(--text-muted)' : 'var(--bg)',
              cursor: loading || !canGenerate ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              letterSpacing: '0.04em',
            }}
          >
            {loading ? '✦ Writing your story…' : '✦ Write My Story'}
          </button>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: '#ef444420',
              border: '1px solid #ef4444',
              borderRadius: 8,
              fontSize: 13,
              color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          {/* Result */}
          {narrative && (
            <div ref={resultRef}>
              <NarrativeResult
                narrative={narrative}
                onSave={handleSave}
                onCopy={handleCopy}
                onExport={handleExport}
                saved={saved}
                copying={copied}
                saving={saving}
                exporting={exporting}
              />
            </div>
          )}
        </div>
      )}

      {/* ── DRAFTS TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'drafts' && (
        <div>
          {draftsLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
              Loading drafts…
            </div>
          ) : drafts.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                  No saved drafts yet. Generate your story and save it.
                </div>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {drafts.map(d => (
                <DraftCard key={d.id} draft={d} onLoad={loadDraft} onDelete={deleteDraft} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
