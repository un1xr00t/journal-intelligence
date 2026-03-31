import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const BUCKET_CONFIG = {
  act_now: {
    label: 'Act Now',
    icon: '◈',
    color: '#ef4444',
    glow: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
    description: 'Do today — reduces chaos immediately',
  },
  plan_week: {
    label: 'Plan This Week',
    icon: '◷',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
    description: 'Schedule before Friday — decisions & conversations',
  },
  let_go: {
    label: 'Let Go For Now',
    icon: '〜',
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.12)',
    border: 'rgba(99,102,241,0.3)',
    description: 'Outside your control — stop burning energy here',
  },
}

const TOOL_ICONS = {
  exit_plan:    '🗺',
  decide:       '⊘',
  detective:    '🕵',
  fairness:     '⚖',
  people_intel: '◉',
  ask_journal:  '⌖',
  mental_health:'♥',
  write:        '✎',
  none:         null,
}

function ActionCard({ item, bucketKey, onNavigate }) {
  const cfg = BUCKET_CONFIG[bucketKey]
  const toolIcon = TOOL_ICONS[item.tool] || null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${cfg.border}`,
      borderRadius: 12,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: `0 0 0 0 ${cfg.glow}`,
      transition: 'box-shadow 0.2s',
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 16px 0 ${cfg.glow}`}
    onMouseLeave={e => e.currentTarget.style.boxShadow = `0 0 0 0 ${cfg.glow}`}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.3, flex: 1 }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: cfg.color, whiteSpace: 'nowrap', marginTop: 1 }}>
          {cfg.icon}
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {item.why}
      </div>

      {item.urgency_note && (
        <div style={{
          fontSize: 11,
          fontFamily: 'IBM Plex Mono',
          color: cfg.color,
          background: cfg.glow,
          border: `1px solid ${cfg.border}`,
          borderRadius: 6,
          padding: '5px 10px',
          lineHeight: 1.5,
        }}>
          {item.urgency_note}
        </div>
      )}

      {item.reframe && (
        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          lineHeight: 1.5,
          borderLeft: `2px solid ${cfg.border}`,
          paddingLeft: 10,
        }}>
          {item.reframe}
        </div>
      )}

      {item.tool_route && item.tool !== 'none' && (
        <button
          onClick={() => onNavigate(item.tool_route)}
          style={{
            marginTop: 4,
            background: 'transparent',
            border: `1px solid ${cfg.border}`,
            borderRadius: 7,
            color: cfg.color,
            fontFamily: 'IBM Plex Mono',
            fontSize: 11,
            padding: '6px 14px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = cfg.glow}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {toolIcon && <span>{toolIcon}</span>}
          Open in {item.tool_label}
        </button>
      )}
    </div>
  )
}

function BucketSection({ bucketKey, items, onNavigate }) {
  const cfg = BUCKET_CONFIG[bucketKey]
  if (!items || items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Bucket header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: cfg.glow,
          border: `1px solid ${cfg.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: cfg.color,
        }}>
          {cfg.icon}
        </div>
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 14, color: cfg.color, letterSpacing: '0.04em' }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', marginTop: 1 }}>
            {cfg.description}
          </div>
        </div>
        <div style={{
          marginLeft: 'auto',
          fontSize: 11,
          fontFamily: 'IBM Plex Mono',
          color: cfg.color,
          background: cfg.glow,
          border: `1px solid ${cfg.border}`,
          borderRadius: 20,
          padding: '2px 10px',
        }}>
          {items.length}
        </div>
      </div>

      {/* Cards */}
      {items.map((item, i) => (
        <ActionCard key={i} item={item} bucketKey={bucketKey} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

export default function WarRoom() {
  const navigate = useNavigate()
  const [brainDump, setBrainDump] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleTriage = async () => {
    if (!brainDump.trim() || brainDump.trim().length < 10) {
      setError('Write at least a sentence. Just dump it — no structure needed.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { data } = await api.post('/api/war-room/triage', {
        brain_dump: brainDump,
        include_journal_context: true,
      })
      setResult(data)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Triage failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
    setBrainDump('')
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', fontFamily: 'IBM Plex Mono, monospace' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(99,102,241,0.15)',
            border: '1px solid rgba(99,102,241,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>
            ⚔
          </div>
          <div>
            <h1 style={{ margin: 0, fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
              War Room
            </h1>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              brain dump → strategic triage
            </div>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 580 }}>
          You don't need to be organized. Just dump everything — the decisions, the worries, the people, the logistics.
          The War Room reads your journal history and sorts it all into what to act on, what to plan, and what to release.
        </p>
      </div>

      {/* Input area — only show if no result yet */}
      {!result && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: -6 }}>
            What's swirling in your head right now?
          </div>
          <textarea
            value={brainDump}
            onChange={e => setBrainDump(e.target.value)}
            placeholder="I'm overwhelmed because... I need to figure out... I'm worried about... I don't know what to do about..."
            rows={8}
            style={{
              width: '100%',
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-primary)',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 13,
              lineHeight: 1.65,
              padding: '14px 16px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', fontFamily: 'IBM Plex Mono' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Your journal history is included automatically for context.
            </div>
            <button
              onClick={handleTriage}
              disabled={loading || !brainDump.trim()}
              style={{
                background: loading ? 'var(--bg-surface)' : 'var(--accent)',
                border: 'none',
                borderRadius: 8,
                color: loading ? 'var(--text-muted)' : '#fff',
                fontFamily: 'IBM Plex Mono',
                fontSize: 12,
                fontWeight: 600,
                padding: '10px 22px',
                cursor: loading || !brainDump.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'opacity 0.15s',
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 12 }}>◎</span>
                  triaging...
                </>
              ) : (
                <>⚔ Triage It</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Situation read */}
          {result.situation_read && (
            <div style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: 12,
              padding: '14px 18px',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.65,
              fontStyle: 'italic',
            }}>
              <span style={{ color: 'var(--accent)', fontStyle: 'normal', marginRight: 8 }}>◈</span>
              {result.situation_read}
            </div>
          )}

          {/* Three buckets */}
          <BucketSection bucketKey="act_now"   items={result.act_now}   onNavigate={navigate} />
          <BucketSection bucketKey="plan_week" items={result.plan_week} onNavigate={navigate} />
          <BucketSection bucketKey="let_go"    items={result.let_go}    onNavigate={navigate} />

          {/* Reset */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 24 }}>
            <button
              onClick={handleReset}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                fontFamily: 'IBM Plex Mono',
                fontSize: 11,
                padding: '8px 20px',
                cursor: 'pointer',
              }}
            >
              ↺ Start a new triage
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
