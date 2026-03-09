import { useState } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'

const PACKET_TYPES = [
  { value: 'weekly_digest', label: 'Weekly Digest', desc: 'Summary of a week of entries' },
  { value: 'incident_packet', label: 'Incident Packet', desc: 'Focused report on a specific event or period' },
  { value: 'pattern_report', label: 'Pattern Report', desc: 'Full pattern analysis with evidence' },
  { value: 'therapy_summary', label: 'Therapy Summary', desc: 'Clinician-friendly narrative summary' },
  { value: 'chronology', label: 'Facts Chronology', desc: 'Timestamped factual record only' },
]

export default function Exports() {
  const [packetType, setPacketType] = useState('weekly_digest')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [redact, setRedact] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const downloadExport = async (exportId, filename) => {
    try {
      const r = await api.get(`/api/export/${exportId}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `export_${exportId}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError('Download failed — ' + (e.response?.data?.detail || e.message))
    }
  }

  const generate = async () => {
    if (!startDate || !endDate) { setError('Select a date range'); return }
    setGenerating(true)
    setError('')
    setResult(null)
    try {
      const r = await api.post('/api/export/generate', {
        packet_type: packetType,
        date_start: startDate,
        date_end: endDate,
        redact: redact,
      })
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Export generation failed')
    }
    setGenerating(false)
  }

  const selected = PACKET_TYPES.find(p => p.value === packetType)

  return (
    <div>
      <PageHeader title="Exports" subtitle="Generate case files and reports" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 800 }}>
        {/* Left: config */}
        <div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Packet Type</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PACKET_TYPES.map(p => (
                <button key={p.value} onClick={() => setPacketType(p.value)} style={{
                  padding: '10px 14px', textAlign: 'left', borderRadius: 8, cursor: 'pointer',
                  background: packetType === p.value ? 'var(--accent-glow)' : 'var(--bg-card)',
                  border: `1px solid ${packetType === p.value ? 'var(--border-bright)' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: packetType === p.value ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 2 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: date + options */}
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Date Range</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>From</div>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>To</div>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                </div>
              </div>
            </div>

            {/* Redaction toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>Redaction</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Apply name & entity redaction rules</div>
              </div>
              <button onClick={() => setRedact(x => !x)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: redact ? 'var(--accent)' : 'rgba(255,255,255,0.1)', position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  position: 'absolute', top: 3, left: redact ? 22 : 3, width: 18, height: 18,
                  borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
                }} />
              </button>
            </div>

            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>
            )}

            <button onClick={generate} disabled={generating} style={{
              width: '100%', padding: '11px 0',
              background: generating ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: 'Syne', cursor: generating ? 'not-allowed' : 'pointer',
            }}>
              {generating ? 'Generating...' : `⊞ Generate ${selected?.label}`}
            </button>

            {result && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginBottom: 4 }}>Export ready</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{result.message || 'Export generated successfully'}</div>
                {result.export_id && (
                  <button onClick={() => downloadExport(result.export_id, result.filename)} style={{
                    display: 'inline-block', marginTop: 8, fontSize: 11, color: 'var(--accent)',
                    background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0,
                  }}>
                    Download export
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
