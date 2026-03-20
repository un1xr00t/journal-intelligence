import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const NAV_GROUPS = [
  {
    links: [
      { to: '/',     icon: '◈', label: 'Timeline'       },
      { to: '/write', icon: '✎', label: 'Write'          },
      { to: '/ask',   icon: '⌖', label: 'Ask My Journal' },
      { to: '/decide', icon: '⊘', label: 'Help Me Choose'  },
    ]
  },
  {
    label: 'Insights',
    links: [
      { to: '/patterns',      icon: '⬡', label: 'Patterns'       },
      { to: '/early-warning', icon: '◬', label: 'Early Warning'  },
      { to: '/nervous',       icon: '〜', label: 'Nervous System' },
    ]
  },
  {
    label: 'People',
    links: [
      { to: '/people',       icon: '◎', label: 'People & Topics' },
      { to: '/people-intel', icon: '◉', label: 'People Map'      },
    ]
  },
  {
    label: 'Case Building',
    links: [
      { to: '/evidence',       icon: '◷', label: 'Evidence Vault' },
      { to: '/contradictions', icon: '⊕', label: 'Contradictions' },
      { to: '/exit-plan',      icon: '🗺', label: 'Exit Plan'      },
      { to: '/exports',        icon: '⊞', label: 'Exports'        },
    ]
  },
  {
    label: 'System',
    links: [
      { to: '/resources', icon: '✦', label: 'Resources' },
      { to: '/settings',  icon: '⚙', label: 'Settings'  },
      { to: '/admin',     icon: '⊙', label: 'Admin', ownerOnly: true },
    ]
  },
]

export default function Sidebar({ filters, onFilterChange, alerts = [], onRefresh, isMobile = false, isOpen = false, onClose }) {
  const { user, logout } = useAuth()
  const { theme, sidebarPhoto } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const criticalCount = alerts.filter(a => a.priority_score >= 8).length
  const activeCount = alerts.filter(a => a.priority_score >= 6 && a.priority_score < 8).length

  // Mobile: fixed overlay drawer; Desktop: static sidebar (unchanged)
  const mobileStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    width: 280,
    zIndex: 300,
    transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  const desktopStyle = {
    width: 248,
    flexShrink: 0,
    position: 'relative',
  }

  return (
    <aside
      className="sidebar"
      style={{
        ...(isMobile ? mobileStyle : desktopStyle),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Mood photo layer */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: sidebarPhoto ? `url(${sidebarPhoto})` : 'none',
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'saturate(0.4) brightness(0.3)',
      }} />
      {/* Gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(180deg, var(--bg-sidebar, rgba(7,7,15,0.97)) 0%, var(--bg-sidebar, rgba(7,7,15,0.92)) 100%)',
      }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 0', overflowY: 'auto' }}>
        {/* Brand + close button row */}
        <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.15em', color: 'var(--accent)', textTransform: 'uppercase' }}>✦ Journal</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.15em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Intelligence</div>
          </div>
          {/* Close button — mobile only */}
          {isMobile && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: 20, lineHeight: 1,
                padding: '0 0 0 8px', marginTop: 2,
              }}
              aria-label="Close menu"
            >
              ✕
            </button>
          )}
        </div>

        {/* User chip — clicking navigates to settings */}
        <NavLink to="/settings" style={{ textDecoration: 'none' }}>
          <div style={{ margin: '0 12px 20px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.username}</div>
              {user?.role === 'owner' && <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin</div>}
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5 }}>⚙</span>
          </div>
        </NavLink>

        {/* Nav */}
        <nav style={{ padding: '0 12px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div style={{
                  margin: '6px 4px',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  paddingTop: 6,
                }}>
                  {group.label && (
                    <div style={{
                      fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.12em',
                      color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase',
                      paddingLeft: 6, marginBottom: 4,
                    }}>
                      {group.label}
                    </div>
                  )}
                </div>
              )}
              {group.links.filter(l => !l.ownerOnly || user?.role === 'owner').map(link => (
                <NavLink key={link.to} to={link.to} end={link.to === '/'} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 10px' : '7px 10px', borderRadius: 6,
                  marginBottom: 2, textDecoration: 'none', fontSize: 13, fontWeight: 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                  transition: 'all 0.15s',
                })}>
                  <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.9, fontFamily: 'monospace' }}>{link.icon}</span>
                  {link.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Filters */}
        <div style={{ padding: '16px 16px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>— Filters —</div>
          <input
            type="text"
            placeholder="Search entries..."
            value={filters?.search || ''}
            onChange={e => onFilterChange?.({ search: e.target.value })}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 11,
              outline: 'none', marginBottom: 6,
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input
              type="date"
              value={filters?.start_date || ''}
              onChange={e => onFilterChange?.({ start_date: e.target.value })}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 6px', color: 'var(--text-secondary)', fontSize: 10, outline: 'none', width: '100%' }}
            />
            <input
              type="date"
              value={filters?.end_date || ''}
              onChange={e => onFilterChange?.({ end_date: e.target.value })}
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 6px', color: 'var(--text-secondary)', fontSize: 10, outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        {/* Alerts summary */}
        {(criticalCount > 0 || activeCount > 0) && (
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>— Alerts —</div>
            {criticalCount > 0 && (
              <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 2 }}>● {criticalCount} critical</div>
            )}
            {activeCount > 0 && (
              <div style={{ fontSize: 11, color: '#f59e0b' }}>◐ {activeCount} active</div>
            )}
          </div>
        )}

        {/* Theme badge */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>— Theme —</div>
          <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'Syne', fontWeight: 600, textTransform: 'capitalize' }}>{theme.moodName || 'neutral'}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{theme.moodDescription || 'mood adaptive'}</div>
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8 }}>
          <button onClick={onRefresh} style={{
            flex: 1, padding: '7px 0', background: 'rgba(99,102,241,0.1)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans',
          }}>
            ↺ Refresh
          </button>
          <button onClick={handleLogout} style={{
            flex: 1, padding: '7px 0', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 6, color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'DM Sans',
          }}>
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}