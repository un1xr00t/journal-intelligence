import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'

const DISMISS_KEY  = 'crisis_banner_dismissed_at'
const POLL_MS      = 10 * 60 * 1000   // 10 minutes
const REDISMISS_H  = 12               // re-surface after 12 hours even if dismissed

export default function CrisisBanner() {
  const [status, setStatus]   = useState(null)
  const [visible, setVisible] = useState(false)
  const navigate              = useNavigate()
  const location              = useLocation()

  const hiddenPaths = ['/login', '/onboarding']
  if (hiddenPaths.includes(location.pathname)) return null

  const isDismissed = () => {
    const ts = localStorage.getItem(DISMISS_KEY)
    if (!ts) return false
    const ageH = (Date.now() - parseInt(ts, 10)) / 3600000
    return ageH < REDISMISS_H
  }

  const fetchStatus = () => {
    api.get('/api/crisis/status').then(r => {
      const s = r.data
      setStatus(s)
      setVisible(s.active && !isDismissed())
    }).catch(() => {})
  }

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, POLL_MS)
    return () => clearInterval(id)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  if (!visible || !status?.active) return null

  return (
    <div style={{
      position:        'relative',
      zIndex:          500,
      background:      'linear-gradient(90deg, rgba(239,68,68,0.12) 0%, rgba(245,158,11,0.10) 100%)',
      borderBottom:    '1px solid rgba(239,68,68,0.35)',
      padding:         '10px 20px',
      display:         'flex',
      alignItems:      'center',
      gap:             12,
      flexWrap:        'wrap',
    }}>
      {/* Pulse dot */}
      <span style={{
        display:      'inline-block',
        width:        8,
        height:       8,
        borderRadius: '50%',
        background:   '#ef4444',
        flexShrink:   0,
        boxShadow:    '0 0 0 0 rgba(239,68,68,0.6)',
        animation:    'crisisPulse 1.8s ease-in-out infinite',
      }} />

      <span style={{ fontSize: 13, color: 'var(--text-primary, #f1f1f1)', flex: 1, lineHeight: 1.5 }}>
        <strong style={{ fontWeight: 600 }}>Heads up —</strong>{' '}
        your journal shows{' '}
        <strong style={{ fontWeight: 600 }}>{status.days} consecutive days</strong>{' '}
        of high severity (avg {status.avg_severity}/10).{' '}
        Support resources are available if you need them.
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/resources')}
          style={{
            background:   'rgba(239,68,68,0.18)',
            border:       '1px solid rgba(239,68,68,0.45)',
            borderRadius: 6,
            color:        '#fca5a5',
            fontSize:     12,
            fontWeight:   600,
            padding:      '5px 12px',
            cursor:       'pointer',
            fontFamily:   'inherit',
          }}
        >
          View resources
        </button>

        <button
          onClick={dismiss}
          style={{
            background:   'none',
            border:       'none',
            color:        'var(--text-muted, #888)',
            fontSize:     18,
            lineHeight:   1,
            cursor:       'pointer',
            padding:      '2px 4px',
          }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes crisisPulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  )
}
