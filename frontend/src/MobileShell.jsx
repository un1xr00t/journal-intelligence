import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import api from './services/api'

// Page imports
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import RecoverViaQuestions from './pages/RecoverViaQuestions'
import Onboarding from './pages/Onboarding'
import Timeline from './pages/Timeline'
import Patterns from './pages/Patterns'
import PeopleTopics from './pages/PeopleTopics'
import PeopleIntelligence from './pages/PeopleIntelligence'
import NervousSystem from './pages/NervousSystem'
import Evidence from './pages/Evidence'
import Contradictions from './pages/Contradictions'
import Exports from './pages/Exports'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Resources from './pages/Resources'
import ExitPlan from './pages/ExitPlan'
import ExitPlanFull from './pages/ExitPlanFull'
import ExitPlanShareView from './pages/ExitPlanShareView'
import JournalWrite from './pages/JournalWrite'
import AskMyJournal from './pages/AskMyJournal'
import EarlyWarning from './pages/EarlyWarning'
import DayOneImport from './pages/DayOneImport'
import DecisionAssistant from './pages/DecisionAssistant'
import WarRoom from './pages/WarRoom'
import Detective from './pages/Detective'
import DetectiveFull from './pages/DetectiveFull'
import MentalHealth from './pages/MentalHealth'
import InviteAccess from './pages/InviteAccess'
import EarlyWarningBanner from './components/EarlyWarningBanner'
import CrisisBanner from './components/CrisisBanner'

// ── Bottom tab config ─────────────────────────────────────────────────────────
const BOTTOM_TABS = [
  { to: '/',       icon: '◈', label: 'Timeline' },
  { to: '/write',  icon: '✎', label: 'Write'    },
  { to: '/ask',    icon: '⌖', label: 'Ask'      },
  { to: '/patterns', icon: '⬡', label: 'Patterns' },
  { to: '/__more', icon: '☰', label: 'More'     },
]

// ── Full nav for the drawer ───────────────────────────────────────────────────
const DRAWER_GROUPS = [
  {
    links: [
      { to: '/',             icon: '◈', label: 'Timeline'       },
      { to: '/write',        icon: '✎', label: 'Write'          },
      { to: '/ask',          icon: '⌖', label: 'Ask My Journal' },
      { to: '/war-room',     icon: '⚔', label: 'War Room'      },
      { to: '/decide',       icon: '⊘', label: 'Help Me Choose' },
    ]
  },
  {
    label: 'Insights',
    links: [
      { to: '/patterns',      icon: '⬡', label: 'Patterns'      },
      { to: '/early-warning', icon: '◬', label: 'Early Warning' },
      { to: '/nervous',       icon: '〜', label: 'Nervous System'},
    ]
  },
  {
    label: 'People',
    links: [
      { to: '/people',        icon: '◎', label: 'People & Topics' },
      { to: '/people-intel',  icon: '◉', label: 'People Map'      },
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
        label: 'Premium',
    links: [
      { to: '/detective',    icon: '🕵', label: 'Detective Mode', detectiveOnly: true },
      { to: '/mental-health',icon: '♥', label: 'My Mental Health'                   },
      { to: '/my-story',     icon: '✦',  label: 'My Story'                          },
      { to: '/war-room',     icon: '⚔',  label: 'War Room'                          },
    ]
  },
  {
    label: 'System',
    links: [
      { to: '/resources', icon: '✦', label: 'Resources'                    },
      { to: '/settings',  icon: '⚙', label: 'Settings'                     },
      { to: '/admin',     icon: '⊙', label: 'Admin', ownerOnly: true        },
    ]
  },
]

// ── Page title map ─────────────────────────────────────────────────────────────
const PAGE_TITLES = {
  '/':               'Timeline',
  '/write':          'Write',
  '/ask':            'Ask My Journal',
  '/war-room':       'War Room',
  '/decide':         'Help Me Choose',
  '/patterns':       'Patterns',
  '/early-warning':  'Early Warning',
  '/nervous':        'Nervous System',
  '/people':         'People & Topics',
  '/people-intel':   'People Map',
  '/evidence':       'Evidence Vault',
  '/contradictions': 'Contradictions',
  '/exit-plan':      'Exit Plan',
  '/exports':        'Exports',
  '/detective':      'Detective Mode',
  '/resources':      'Resources',
  '/settings':       'Settings',
  '/admin':          'Admin',
}

function LoadingScreen() {
  return (
    <div style={{ width: '100%', height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 12, color: 'var(--accent)' }}>✦</div>
        <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>authenticating...</div>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, ownerOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (ownerOnly && user.role !== 'owner') return <Navigate to="/" replace />
  return children
}

// ── Drawer ────────────────────────────────────────────────────────────────────
function Drawer({ open, onClose, user, alerts, onLogout, detectiveAccess }) {
  const criticalCount = alerts.filter(a => a.priority_score >= 8).length
  const activeCount   = alerts.filter(a => a.priority_score >= 6 && a.priority_score < 8).length

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* Drawer panel — slides from right */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '80vw', maxWidth: 300,
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        zIndex: 500,
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 12, letterSpacing: '0.15em', color: 'var(--accent)', textTransform: 'uppercase' }}>
            ✦ Journal Intelligence
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', padding: '4px 0 4px 12px', lineHeight: 1 }}>✕</button>
        </div>

        {/* User chip */}
        <div style={{ margin: '0 14px 16px', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.username}</div>
            {user?.role === 'owner' && <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Admin</div>}
          </div>
        </div>

        {/* Alerts */}
        {(criticalCount > 0 || activeCount > 0) && (
          <div style={{ margin: '0 14px 14px', padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
            {criticalCount > 0 && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 2 }}>● {criticalCount} critical alert{criticalCount > 1 ? 's' : ''}</div>}
            {activeCount   > 0 && <div style={{ fontSize: 12, color: '#f59e0b' }}>◐ {activeCount} active alert{activeCount > 1 ? 's' : ''}</div>}
          </div>
        )}

        {/* Nav groups */}
        <nav style={{ padding: '0 10px', flex: 1 }}>
          {DRAWER_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && (
                <div style={{ margin: '8px 6px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
                  {group.label && (
                    <div style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', paddingLeft: 8, marginBottom: 4 }}>
                      {group.label}
                    </div>
                  )}
                </div>
              )}
              {group.links
                .filter(l => (!l.ownerOnly || user?.role === 'owner') && (!l.detectiveOnly || detectiveAccess))
                .map(link => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    onClick={onClose}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 12px',
                      borderRadius: 8, marginBottom: 2,
                      textDecoration: 'none', fontSize: 14, fontWeight: 500,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                      minHeight: 44,
                    })}
                  >
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'monospace', width: 18, textAlign: 'center' }}>{link.icon}</span>
                    {link.label}
                  </NavLink>
                ))
              }
            </div>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: '12px 14px 8px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onLogout}
            style={{ width: '100%', padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans' }}
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}

// ── Bottom tab bar ─────────────────────────────────────────────────────────────
function BottomNav({ onMoreClick, alerts }) {
  const location = useLocation()
  const hasAlert = alerts.some(a => a.priority_score >= 6)
  const hasCritical = alerts.some(a => a.priority_score >= 8)

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(56px + env(safe-area-inset-bottom))', flexShrink: 0,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'stretch',
      zIndex: 200,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {BOTTOM_TABS.map(tab => {
        if (tab.to === '/__more') {
          return (
            <button
              key="more"
              onClick={onMoreClick}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', position: 'relative',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1, fontFamily: 'monospace' }}>{tab.icon}</span>
              <span style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tab.label}</span>
              {hasAlert && (
                <span style={{
                  position: 'absolute', top: 6, right: 'calc(50% - 18px)',
                  width: 7, height: 7, borderRadius: '50%',
                  background: hasCritical ? '#ef4444' : '#f59e0b',
                }} />
              )}
            </button>
          )
        }

        const isActive = tab.to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(tab.to)

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1, fontFamily: 'monospace' }}>{tab.icon}</span>
            <span style={{ fontSize: 9, fontFamily: 'IBM Plex Mono', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tab.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

// ── Top bar ────────────────────────────────────────────────────────────────────
function TopBar({ onMenuClick, alerts }) {
  const location = useLocation()
  const title = PAGE_TITLES[location.pathname] || 'Journal Intelligence'
  const hasAlert = alerts.some(a => a.priority_score >= 6)
  const hasCritical = alerts.some(a => a.priority_score >= 8)

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      paddingTop: 'env(safe-area-inset-top)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 11, letterSpacing: '0.15em', color: 'var(--accent)', textTransform: 'uppercase', flexShrink: 0 }}>✦</div>
        <div style={{ flex: 1, fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {hasAlert && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasCritical ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
        )}
        <button
          onClick={onMenuClick}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 5, padding: '4px', flexShrink: 0 }}
          aria-label="Open menu"
        >
          <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
          <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
        </button>
      </div>
    </div>
  )
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export default function MobileShell() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [detectiveAccess, setDetectiveAccess] = useState(false)

  // Pages that get full-screen treatment (no top bar, no bottom nav)
  const isPublicPage = ['/login', '/onboarding', '/forgot-password', '/reset-password', '/recover-via-questions'].includes(location.pathname)
    || location.pathname.startsWith('/share/')
    || location.pathname.startsWith('/invite/')
  const isFullscreen = location.pathname === '/exitplan-full' || location.pathname === '/detective/full'
  const isWritePage  = location.pathname === '/write'
  const hideChrome   = isPublicPage || isFullscreen

  // Write page gets top bar but no bottom nav (full-screen editor feel)
  const hideBottomNav = hideChrome || isWritePage

  useEffect(() => {
    if (user) {
      api.get('/api/patterns/alerts')
        .then(r => setAlerts((r.data.alerts || []).filter(a => !a.acknowledged)))
        .catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    if (user.role === 'owner') { setDetectiveAccess(true); return }
    api.get('/api/detective/access').then(r => setDetectiveAccess(r.data.has_access)).catch(() => {})
  }, [user])

  // Close drawer on nav
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  if (loading) return <LoadingScreen />

  // Safe-area heights
  // Top bar: 52px + safe-area-inset-top
  // Bottom nav: 56px + safe-area-inset-bottom
  const topOffset    = hideChrome   ? '0px' : 'calc(52px + env(safe-area-inset-top))'
  const bottomOffset = hideBottomNav ? '0px' : 'calc(56px + env(safe-area-inset-bottom))'

  return (
    <div style={{
      width: '100%',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-base)',
      overflow: 'hidden',
    }}>
      {/* Banners — flex-shrink:0 so they don't steal scroll space */}
      {user && <div style={{ flexShrink: 0 }}><CrisisBanner /></div>}
      {user && <div style={{ flexShrink: 0 }}><EarlyWarningBanner /></div>}

      {/* Top bar — flex-shrink:0 */}
      {!hideChrome && user && (
        <div style={{ flexShrink: 0 }}>
          <TopBar onMenuClick={() => setDrawerOpen(true)} alerts={alerts} />
        </div>
      )}

      {/* Scrollable content — flex:1 + min-height:0 is the key combo */}
      <div style={{
        flex: 1,
        minHeight: 0,
        paddingTop: 'calc(52px + env(safe-area-inset-top))',
        paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{ padding: hideChrome || isFullscreen || isWritePage ? 0 : '20px 14px 24px' }}>
          <Routes>
            <Route path="/login"                  element={<Login />} />
            <Route path="/forgot-password"        element={<ForgotPassword />} />
            <Route path="/reset-password"         element={<ResetPassword />} />
            <Route path="/recover-via-questions"  element={<RecoverViaQuestions />} />
            <Route path="/onboarding"             element={<Onboarding />} />
            <Route path="/"                       element={<ProtectedRoute><Timeline filters={{}} /></ProtectedRoute>} />
            <Route path="/patterns"               element={<ProtectedRoute><Patterns /></ProtectedRoute>} />
            <Route path="/people"                 element={<ProtectedRoute><PeopleTopics /></ProtectedRoute>} />
            <Route path="/people-intel"           element={<ProtectedRoute><PeopleIntelligence /></ProtectedRoute>} />
            <Route path="/nervous"                element={<ProtectedRoute><NervousSystem /></ProtectedRoute>} />
            <Route path="/evidence"               element={<ProtectedRoute><Evidence /></ProtectedRoute>} />
            <Route path="/contradictions"         element={<ProtectedRoute><Contradictions /></ProtectedRoute>} />
            <Route path="/exports"                element={<ProtectedRoute><Exports /></ProtectedRoute>} />
            <Route path="/admin"                  element={<ProtectedRoute ownerOnly><Admin /></ProtectedRoute>} />
            <Route path="/settings"               element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/resources"              element={<ProtectedRoute><Resources /></ProtectedRoute>} />
            <Route path="/exit-plan"              element={<ProtectedRoute><ExitPlan /></ProtectedRoute>} />
            <Route path="/exitplan-full"          element={<ProtectedRoute><ExitPlanFull /></ProtectedRoute>} />
            <Route path="/write"                  element={<ProtectedRoute><JournalWrite /></ProtectedRoute>} />
            <Route path="/ask"                    element={<ProtectedRoute><AskMyJournal /></ProtectedRoute>} />
            <Route path="/early-warning"          element={<ProtectedRoute><EarlyWarning /></ProtectedRoute>} />
            <Route path="/import/dayone"          element={<ProtectedRoute><DayOneImport /></ProtectedRoute>} />
            <Route path="/decide"                 element={<ProtectedRoute><DecisionAssistant /></ProtectedRoute>} />
            <Route path="/war-room"               element={<ProtectedRoute><WarRoom /></ProtectedRoute>} />
            <Route path="/detective"              element={<ProtectedRoute><Detective /></ProtectedRoute>} />
            <Route path="/detective/full"         element={<ProtectedRoute><DetectiveFull /></ProtectedRoute>} />
            <Route path="/mental-health"          element={<ProtectedRoute><MentalHealth /></ProtectedRoute>} />
            <Route path="/share/plan/:token"      element={<ExitPlanShareView />} />
            <Route path="/invite/:token"          element={<InviteAccess />} />
            <Route path="*"                       element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {/* Bottom nav — flex-shrink:0 */}
      {!hideBottomNav && user && (
        <div style={{ flexShrink: 0 }}>
          <BottomNav onMoreClick={() => setDrawerOpen(true)} alerts={alerts} />
        </div>
      )}

      {/* Drawer */}
      {user && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          user={user}
          alerts={alerts}
          onLogout={handleLogout}
          detectiveAccess={detectiveAccess}
        />
      )}
    </div>
  )
}
