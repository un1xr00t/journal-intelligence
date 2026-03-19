import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'

const DISMISS_KEY  = 'early_warning_dismissed_at'
const POLL_MS      = 30 * 60 * 1000  // 30 min — less urgent than crisis
const REDISMISS_H  = 24

export default function EarlyWarningBanner() {
  const [status,  setStatus]  = useState(null)
  const [visible, setVisible] = useState(false)
  const navigate  = useNavigate()
  const location  = useLocation()

  const isDismissed = () => {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (!ts) return false
    return (Date.now() - parseInt(ts, 10)) / 3600000 < REDISMISS_H
  }

  const fetchStatus = () => {
    api.get('/api/early-warning/status').then(r => {
      const s = r.data
      setStatus(s)
      setVisible(!!s.active && !isDismissed())
    }).catch(() => {})
  }

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(id)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    api.post('/api/early-warning/dismiss').catch(() => {})
    setVisible(false)
  }

  // Only show on Timeline
  if (location.pathname !== '/') return null
  if (!visible || !status?.active) return null

  const pct = status.confidence ? Math.round(status.confidence * 100) : null

  return (
    <div style={{
      position:     'relative',
      zIndex:       490,
      background:   'linear-gradient(90deg, rgba(245,158,11,0.10) 0%, rgba(249,115,22,0.07) 100%)',
      borderBottom: '1px solid rgba(245,158,11,0.30)',
      padding:      '9px 20px',
      display:      'flex',
      alignItems:   'center',
      gap:          12,
      flexWrap:     'wrap',
    }}>
      <span style={{
        display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
        background: '#f59e0b', flexShrink: 0,
        animation: 'ewPulse 2.4s ease-in-out infinite',
      }} />

      <span style={{ fontSize: 13, color: 'var(--text-primary, #f1f1f1)', flex: 1, lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 600 }}>Pattern detected —</strong>{' '}
        signals in your last 3 days match patterns that preceded past difficult periods
        {status.matched_count >= 2 && (
          <> ({status.matched_count} historical matches)</>
        )}
        {pct && pct >= 50 && (
          <span style={{ color: '#f59e0b', fontWeight: 500 }}> · {pct}% signal overlap</span>
        )}
        .
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={() => navigate('/early-warning')} style={{
          background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.40)',
          borderRadius: 6, color: '#fcd34d', fontSize: 12, fontWeight: 600,
          padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          See details
        </button>
        <button onClick={dismiss} style={{
          background: 'none', border: 'none', color: 'var(--text-muted, #888)',
          fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '2px 4px',
        }} aria-label="Dismiss">
          ×
        </button>
      </div>

      <style>{`
        @keyframes ewPulse {
          0%   { box-shadow: 0 0 0 0 rgba(245,158,11,0.6); }
          70%  { box-shadow: 0 0 0 5px rgba(245,158,11,0); }
          100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        }
      `}</style>
    </div>
  )
}
