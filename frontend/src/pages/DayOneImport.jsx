import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(first, last) {
  if (!first) return null
  const fmt = (d) => {
    const [y, m, day] = d.split('-')
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${months[parseInt(m,10)-1]} ${parseInt(day,10)}, ${y}`
  }
  if (!last || first === last) return fmt(first)
  const [fy] = first.split('-')
  const [ly] = last.split('-')
  return fy === ly ? `${fmt(first)} – ${fmt(last)}` : `${fmt(first)} – ${fmt(last)}`
}

function yearsSpanned(first, last) {
  if (!first || !last) return null
  const fy = parseInt(first.split('-')[0], 10)
  const ly = parseInt(last.split('-')[0], 10)
  const diff = ly - fy
  if (diff === 0) return `${fy}`
  return `${diff + 1} years (${fy}–${ly})`
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, pct)}%`,
        background: 'linear-gradient(90deg, var(--accent), var(--accent2, var(--accent)))',
        borderRadius: 2,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function StatCard({ icon, value, label, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'IBM Plex Mono, monospace' }}>{sub}</div>}
    </div>
  )
}

// ── Steps ──────────────────────────────────────────────────────────────────────

function StepUpload({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }, [onFile])

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)
  const handleChange = (e) => { const file = e.target.files?.[0]; if (file) onFile(file) }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Day One Migration
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--text-primary)', margin: '0 0 12px', lineHeight: 1.2 }}>
          Here's what your old journal<br />never told you.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
          Import your Day One export and instantly get patterns, contradictions,
          people intelligence, and emotional analysis on years of entries.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 16,
          padding: '48px 32px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'rgba(var(--accent-rgb, 99,102,241),0.06)' : 'rgba(255,255,255,0.02)',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 16 }}>📥</div>
        <div style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8 }}>
          Drop your Day One export here
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Accepts <code style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--accent)' }}>.zip</code> or <code style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: 'var(--accent)' }}>.json</code> — click to browse
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.json"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* How to export guide */}
      <div style={{ marginTop: 28, padding: '20px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          How to export from Day One
        </div>
        <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            'Open Day One on Mac or iPhone',
            'Go to File → Export → JSON',
            'Select all journals, click Export',
            'Upload the .zip file here',
          ].map((step, i) => (
            <li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function StepProcessing({ jobId, onDone }) {
  const [job, setJob] = useState({ processed: 0, total: 0, inserted: 0, skipped: 0, errors: 0, status: 'queued' })

  useEffect(() => {
    if (!jobId) return
    const poll = setInterval(async () => {
      try {
        const r = await api.get(`/api/import/dayone/status/${jobId}`)
        setJob(r.data)
        if (r.data.status === 'done' || r.data.status === 'error') {
          clearInterval(poll)
          if (r.data.status === 'done') onDone(r.data)
        }
      } catch (err) {
        clearInterval(poll)
      }
    }, 1200)
    return () => clearInterval(poll)
  }, [jobId, onDone])

  const pct = job.total > 0 ? (job.processed / job.total) * 100 : 0
  const phase = job.status === 'queued' ? 'Preparing...' : job.processed < job.total ? 'Importing entries...' : 'Running analysis...'

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 24 }}>⚙️</div>
      <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--text-primary)', margin: '0 0 8px' }}>
        Importing your journal
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 36px' }}>
        This may take a few minutes for large journals. Don't close this tab.
      </p>

      <div style={{ marginBottom: 20 }}>
        <ProgressBar pct={pct} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono, monospace' }}>{phase}</span>
        <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {job.processed} / {job.total}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Imported', value: job.inserted, color: '#10b981' },
          { label: 'Skipped', value: job.skipped, color: 'var(--text-muted)' },
          { label: 'Errors', value: job.errors, color: job.errors > 0 ? '#ef4444' : 'var(--text-muted)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: '14px 0', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'IBM Plex Mono, monospace' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StepReveal({ job, navigate }) {
  const r = job.results || {}
  const span = yearsSpanned(job.date_first, r.date_first || job.date_first, r.date_last || job.date_last)

  const dateRange = formatDateRange(
    r.date_first || job.date_first,
    r.date_last  || job.date_last
  )

  const years = yearsSpanned(r.date_first || job.date_first, r.date_last || job.date_last)

  const stats = [
    { icon: '📖', value: r.total_entries ?? job.inserted, label: 'entries analyzed', sub: dateRange },
    { icon: '👥', value: r.top_people?.length ?? 0, label: 'people in your history', sub: r.top_people?.slice(0, 2).map(p => p.name).join(', ') || null },
    { icon: '⚠️', value: r.pattern_count ?? 0, label: 'patterns detected', sub: 'alerts waiting for review' },
    { icon: '⊕', value: r.contradiction_count ?? 0, label: 'contradictions flagged', sub: 'statements worth examining' },
  ]

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
          Import complete
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: 'Syne, sans-serif', color: 'var(--text-primary)', margin: '0 0 12px', lineHeight: 1.2 }}>
          This is what Day One<br />was hiding from you.
        </h1>
        {years && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            {years} of journal history, now fully analyzed.
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 32 }}>
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* Top people */}
      {r.top_people?.length > 0 && (
        <div style={{ marginBottom: 28, padding: '20px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Most mentioned people in your journal
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {r.top_people.map((p, i) => (
              <div key={i} style={{
                padding: '6px 14px',
                background: 'rgba(var(--accent-rgb, 99,102,241),0.1)',
                border: '1px solid rgba(var(--accent-rgb, 99,102,241),0.2)',
                borderRadius: 99,
                fontSize: 13,
                color: 'var(--accent)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}>
                {p.name}
                <span style={{ color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>×{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mood context */}
      {r.top_mood && (
        <div style={{ marginBottom: 28, padding: '16px 22px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            Your most common emotional tone:{' '}
            <span style={{ color: 'var(--accent)', fontWeight: 600, textTransform: 'capitalize' }}>{r.top_mood}</span>
          </div>
        </div>
      )}

      {/* Import summary */}
      <div style={{ marginBottom: 32, padding: '16px 22px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, display: 'flex', gap: 24 }}>
        {[
          { label: 'Imported', value: job.inserted, color: '#10b981' },
          { label: 'Skipped (dupes)', value: job.skipped, color: 'rgba(255,255,255,0.4)' },
          { label: 'Errors', value: job.errors, color: job.errors > 0 ? '#ef4444' : 'rgba(255,255,255,0.4)' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: 'IBM Plex Mono, monospace' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            flex: 1, padding: '14px 0', borderRadius: 10,
            background: 'var(--accent)',
            border: 'none', color: '#fff', fontWeight: 700,
            fontSize: 14, cursor: 'pointer', minWidth: 160,
          }}
        >
          View Timeline →
        </button>
        {r.pattern_count > 0 && (
          <button
            onClick={() => navigate('/patterns')}
            style={{
              flex: 1, padding: '14px 0', borderRadius: 10,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-primary)', fontWeight: 600,
              fontSize: 14, cursor: 'pointer', minWidth: 160,
            }}
          >
            Review {r.pattern_count} pattern{r.pattern_count !== 1 ? 's' : ''}
          </button>
        )}
        {r.top_people?.length > 0 && (
          <button
            onClick={() => navigate('/people-intel')}
            style={{
              flex: 1, padding: '14px 0', borderRadius: 10,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-primary)', fontWeight: 600,
              fontSize: 14, cursor: 'pointer', minWidth: 160,
            }}
          >
            People Map
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DayOneImport() {
  const navigate = useNavigate()
  const [step, setStep] = useState('upload')   // upload | processing | reveal
  const [jobId, setJobId] = useState(null)
  const [jobData, setJobData] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file) => {
    setError(null)
    setUploading(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const r = await api.post('/api/import/dayone', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      setJobId(r.data.job_id)
      setStep('processing')
    } catch (err) {
      setError(err.response?.data?.detail || 'Upload failed. Make sure this is a valid Day One export.')
    } finally {
      setUploading(false)
    }
  }

  const handleDone = (data) => {
    setJobData(data)
    setStep('reveal')
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 48, justifyContent: 'center' }}>
        {['Upload', 'Processing', 'Reveal'].map((label, i) => {
          const stepKeys = ['upload', 'processing', 'reveal']
          const isCurrent = step === stepKeys[i]
          const isDone = stepKeys.indexOf(step) > i
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: isCurrent ? 1 : isDone ? 0.6 : 0.3,
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: isCurrent ? 'var(--accent)' : isDone ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: isCurrent ? '#fff' : 'rgba(255,255,255,0.6)',
                  fontFamily: 'IBM Plex Mono, monospace',
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, color: isCurrent ? 'var(--text-primary)' : 'rgba(255,255,255,0.4)', fontWeight: isCurrent ? 600 : 400 }}>
                  {label}
                </span>
              </div>
              {i < 2 && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.1)' }} />}
            </div>
          )
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ maxWidth: 560, margin: '0 auto 24px', padding: '12px 18px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* Step content */}
      {step === 'upload' && !uploading && <StepUpload onFile={handleFile} />}
      {step === 'upload' && uploading && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>
          Uploading...
        </div>
      )}
      {step === 'processing' && <StepProcessing jobId={jobId} onDone={handleDone} />}
      {step === 'reveal' && jobData && <StepReveal job={jobData} navigate={navigate} />}
    </div>
  )
}
