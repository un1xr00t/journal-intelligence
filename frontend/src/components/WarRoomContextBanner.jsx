/**
 * WarRoomContextBanner.jsx — components/WarRoomContextBanner.jsx
 * Shown at the top of tool pages when navigated from War Room.
 * Reads location.state.warRoomItem passed by WarRoom.jsx navigate().
 */
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function WarRoomContextBanner() {
  const location = useLocation()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  const item = location.state?.warRoomItem
  if (!item || dismissed) return null

  const bucketColors = {
    act_now:    { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  label: 'Act Now'          },
    plan_week:  { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', label: 'Plan This Week'   },
    let_go:     { color: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.25)', label: 'Let Go For Now'   },
  }
  const theme = bucketColors[item.bucket] || bucketColors.act_now

  return (
    <div style={{
      background: theme.bg,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10,
              fontFamily: 'IBM Plex Mono',
              color: theme.color,
              background: `${theme.color}22`,
              border: `1px solid ${theme.color}44`,
              borderRadius: 99,
              padding: '2px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              ⚔ War Room · {theme.label}
            </span>
          </div>
          <div style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--text-primary)',
            lineHeight: 1.35,
          }}>
            {item.title}
          </div>
          {item.why && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {item.why}
            </div>
          )}
          {item.urgency_note && (
            <div style={{
              fontSize: 11,
              fontFamily: 'IBM Plex Mono',
              color: theme.color,
              lineHeight: 1.5,
              marginTop: 2,
            }}>
              {item.urgency_note}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-start' }}>
          <button
            onClick={() => navigate('/war-room')}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: 7,
              color: theme.color,
              fontFamily: 'IBM Plex Mono',
              fontSize: 10,
              padding: '5px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ← War Room
          </button>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 14,
              cursor: 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
