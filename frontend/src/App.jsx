import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Sidebar from './components/Sidebar'
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
import FairnessLedger from './pages/FairnessLedger'
import MentalHealth from './pages/MentalHealth'
import DetectiveFull from './pages/DetectiveFull'
import ProofVault from './pages/ProofVault'
import MyStory from './pages/MyStory'
import Today from './pages/Today'
import InviteAccess from './pages/InviteAccess'
import BudgetPlanner from './pages/BudgetPlanner'
import EarlyWarningBanner from './components/EarlyWarningBanner'
import CrisisBanner from './components/CrisisBanner'
import api from './services/api'
import MobileShell from './MobileShell'
import FloatingChat from './components/FloatingChat'

function LoadingScreen() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 12, display: 'inline-block', color: 'var(--accent)' }}>✦</div>
        <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', display: 'block' }}>authenticating...</div>
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

function Shell() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [filters, setFilters] = useState({})
  const [alerts, setAlerts] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [edgePeek, setEdgePeek] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)

  // Pages with no sidebar and no padding — either public or full-screen tool pages
  const isPublicPage     = location.pathname === '/login' || location.pathname === '/onboarding' || location.pathname === '/forgot-password' || location.pathname === '/reset-password' || location.pathname === '/recover-via-questions' || location.pathname.startsWith('/share/') || location.pathname.startsWith('/invite/')
  const isFullscreenPage = location.pathname === '/exitplan-full' || location.pathname === '/detective/full'
  const isWritePage      = location.pathname === '/write'
  const hideSidebar      = isPublicPage || isFullscreenPage || isWritePage

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (user) {
      api.get('/api/patterns/alerts').then(r => setAlerts((r.data.alerts || []).filter(a => !a.acknowledged))).catch(() => {})
    }
  }, [user])

  if (loading) return <LoadingScreen />

  const handleFilterChange = (changes) => setFilters(f => ({ ...f, ...changes }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100dvh', minHeight: '100vh', overflow: 'hidden' }}>
      {user && <CrisisBanner />}
      {user && <EarlyWarningBanner />}
      {/* Mobile top bar */}
      {isMobile && !hideSidebar && user && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(52px + env(safe-area-inset-top))',
          flexShrink: 0,
          background: 'var(--bg-sidebar, rgba(7,7,15,0.97))',
          borderBottom: '1px solid var(--border)',
          zIndex: 100, position: 'relative',
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 4, padding: 4,
            }}
            aria-label="Open menu"
          >
            <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: 'var(--text-secondary)', borderRadius: 2 }} />
          </button>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: '0.15em', color: 'var(--accent)', textTransform: 'uppercase' }}>
            ✦ Journal Intelligence
          </div>
          {/* Alert dot */}
          {alerts.filter(a => a.priority_score >= 6).length > 0 && (
            <div style={{
              marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
              background: alerts.some(a => a.priority_score >= 8) ? '#ef4444' : '#f59e0b',
            }} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Backdrop overlay on mobile when sidebar open */}
        {isMobile && sidebarOpen && !hideSidebar && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(2px)',
            }}
          />
        )}

        {/* Normal sidebar — visible pages */}
        {!hideSidebar && user && (
          <Sidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            alerts={alerts}
            onRefresh={() => window.location.reload()}
            isMobile={isMobile}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        )}

        {/* Edge-peek sidebar — /write page */}
        {isWritePage && user && (
          <>
            {/* Invisible hover trigger strip on left edge */}
            <div
              onMouseEnter={() => setEdgePeek(true)}
              style={{
                position: 'fixed', left: 0, top: 0, bottom: 0,
                width: 14, zIndex: 290, cursor: 'default',
              }}
            />
            {/* Dim backdrop */}
            {edgePeek && (
              <div
                onClick={() => setEdgePeek(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 291,
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(2px)',
                  transition: 'opacity 0.25s',
                }}
              />
            )}
            {/* Sidebar as overlay — reuses isMobile drawer mode */}
            <div
              onMouseLeave={() => setEdgePeek(false)}
              style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 292 }}
            >
              <Sidebar
                filters={filters}
                onFilterChange={handleFilterChange}
                alerts={alerts}
                onRefresh={() => window.location.reload()}
                isMobile={true}
                isOpen={edgePeek}
                onClose={() => setEdgePeek(false)}
              />
            </div>
          </>
        )}

        <main style={{
          flex: 1,
          overflow: 'auto',
          overflowX: 'hidden',
          background: 'var(--bg-base)',
          padding: hideSidebar ? 0 : isMobile ? '16px 14px' : '28px 32px',
          paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom))' : '28px',
        }}>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/recover-via-questions" element={<RecoverViaQuestions />} />
            <Route path="/onboarding"      element={<Onboarding />} />
            <Route path="/"                element={<ProtectedRoute><Today /></ProtectedRoute>} />
            <Route path="/timeline"          element={<ProtectedRoute><Timeline filters={filters} /></ProtectedRoute>} />
            <Route path="/patterns"        element={<ProtectedRoute><Patterns /></ProtectedRoute>} />
            <Route path="/people"          element={<ProtectedRoute><PeopleTopics /></ProtectedRoute>} />
            <Route path="/people-intel"   element={<ProtectedRoute><PeopleIntelligence /></ProtectedRoute>} />
            <Route path="/nervous"         element={<ProtectedRoute><NervousSystem /></ProtectedRoute>} />
            <Route path="/evidence"        element={<ProtectedRoute><Evidence /></ProtectedRoute>} />
            <Route path="/contradictions"  element={<ProtectedRoute><Contradictions /></ProtectedRoute>} />
            <Route path="/exports"         element={<ProtectedRoute><Exports /></ProtectedRoute>} />
            <Route path="/admin"           element={<ProtectedRoute ownerOnly><Admin /></ProtectedRoute>} />
            <Route path="/settings"        element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/resources"       element={<ProtectedRoute><Resources /></ProtectedRoute>} />
            <Route path="/exit-plan"       element={<ProtectedRoute><ExitPlan /></ProtectedRoute>} />
            <Route path="/exitplan-full"   element={<ProtectedRoute><ExitPlanFull /></ProtectedRoute>} />
            <Route path="/write" element={<ProtectedRoute><JournalWrite /></ProtectedRoute>} />
            <Route path="/ask" element={<ProtectedRoute><AskMyJournal /></ProtectedRoute>} />
            <Route path="/early-warning" element={<ProtectedRoute><EarlyWarning /></ProtectedRoute>} />
            <Route path="/import/dayone" element={<ProtectedRoute><DayOneImport /></ProtectedRoute>} />
            <Route path="/decide" element={<ProtectedRoute><DecisionAssistant /></ProtectedRoute>} />
            <Route path="/war-room" element={<ProtectedRoute><WarRoom /></ProtectedRoute>} />
            <Route path="/detective" element={<ProtectedRoute><Detective /></ProtectedRoute>} />
            <Route path="/fairness" element={<ProtectedRoute><FairnessLedger /></ProtectedRoute>} />
            <Route path="/detective/full" element={<ProtectedRoute><DetectiveFull /></ProtectedRoute>} />
            <Route path="/proof-vault" element={<ProtectedRoute><ProofVault /></ProtectedRoute>} />
            <Route path="/mental-health" element={<ProtectedRoute><MentalHealth /></ProtectedRoute>} />
            <Route path="/my-story" element={<ProtectedRoute><MyStory /></ProtectedRoute>} />
            <Route path="/today" element={<ProtectedRoute><Today /></ProtectedRoute>} />
            <Route path="/share/plan/:token" element={<ExitPlanShareView />} />
            <Route path="/invite/:token" element={<InviteAccess />} />
            <Route path="/budget-planner" element={<ProtectedRoute><BudgetPlanner /></ProtectedRoute>} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {user && !isPublicPage && !isFullscreenPage && (
          <FloatingChat />
        )}
      </div>
    </div>
  )
}

function AppInner() {
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth < 768)
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile ? <MobileShell /> : <Shell />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}