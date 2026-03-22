/**
 * DetectiveBanner.jsx — components/DetectiveBanner.jsx
 * Premium noir banner shown on Timeline when user has detective access + active cases.
 * Links to /detective/full. Dismissable per session.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function DetectiveBanner() {
  const [state, setState]     = useState(null) // null=loading, false=hidden, {cases}=show
  const [dismissed, setDism]  = useState(false)
  const navigate              = useNavigate()

  useEffect(() => {
    // Check session dismiss flag
    if (sessionStorage.getItem('detective_banner_dismissed') === '1') {
      setDism(true)
      return
    }
    const check = async () => {
      try {
        const access = await api.get('/api/detective/access')
        if (!access.data.has_access) { setState(false); return }
        const cases = await api.get('/api/detective/cases')
        const active = (cases.data || []).filter(c => c.status === 'active')
        if (active.length === 0) { setState(false); return }
        setState({ cases: active, total: cases.data.length })
      } catch {
        setState(false)
      }
    }
    check()
  }, [])

  const dismiss = () => {
    sessionStorage.setItem('detective_banner_dismissed', '1')
    setDism(true)
  }

  if (dismissed || state === null || state === false) return null

  const primaryCase = state.cases[0]

  return (
    <div style={{
      position: 'relative',
      marginBottom: 14,
      borderRadius: 12,
      overflow: 'hidden',
      border: '1px solid rgba(99,102,241,0.25)',
      background: 'linear-gradient(135deg, rgba(5,5,18,0.95) 0%, rgba(20,14,48,0.95) 50%, rgba(8,6,22,0.95) 100%)',
      boxShadow: '0 0 30px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Top gradient line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #6366f1)', backgroundSize: '200% 100%' }} />

      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.25))',
          border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>
          🕵
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontFamily: 'IBM Plex Mono', fontSize: 9, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'rgba(168,85,247,0.8)',
            }}>
              ● Active Investigation
            </span>
            <span style={{
              fontFamily: 'IBM Plex Mono', fontSize: 9,
              color: 'rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, padding: '1px 6px',
            }}>
              {state.total} case{state.total !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{
            fontFamily: 'Syne', fontWeight: 700, fontSize: 13,
            color: 'rgba(255,255,255,0.9)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {primaryCase.title}
            {state.cases.length > 1 && (
              <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.4)', fontSize: 11, marginLeft: 8 }}>
                + {state.cases.length - 1} more active
              </span>
            )}
          </div>
        </div>

        {/* CTA button */}
        <button
          onClick={() => navigate('/detective/full')}
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 8,
            color: '#c7d2fe',
            fontSize: 11, fontFamily: 'IBM Plex Mono', fontWeight: 600,
            padding: '7px 14px',
            cursor: 'pointer',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.45), rgba(168,85,247,0.45))'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))'; e.currentTarget.style.color = '#c7d2fe' }}
        >
          Open Workspace →
        </button>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          title="Dismiss"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', fontSize: 14, cursor: 'pointer', padding: '2px 4px', flexShrink: 0, lineHeight: 1, transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
        >
          ×
        </button>
      </div>
    </div>
  )
}
