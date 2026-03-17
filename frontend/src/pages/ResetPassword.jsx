import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new one.')
    }
  }, [token])

  const handleSubmit = async () => {
    if (!token) return
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/reset-password', { token, new_password: password })
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      width: '100%', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base)',
      backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15), transparent)',
    }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: 380 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12, filter: 'drop-shadow(0 0 20px var(--accent))' }}>✦</div>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: 4 }}>Journal</h1>
          <h1 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 20, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--accent)' }}>Intelligence</h1>
        </div>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 32,
          boxShadow: '0 0 60px rgba(99,102,241,0.08)',
        }}>
          {done ? (
            /* Success state */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Password updated</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                Your password has been reset. All other sessions have been signed out for security.
              </p>
              <button
                onClick={() => navigate('/login')}
                style={{
                  width: '100%', padding: '12px 0',
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Syne', letterSpacing: '0.05em', cursor: 'pointer',
                }}
              >
                Sign In
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Set new password</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                Choose a strong password — at least 12 characters.
              </p>

              {!token && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 16 }}>
                  Invalid reset link. Please request a new one.
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={!token}
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                    transition: 'border-color 0.2s', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  disabled={!token}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                    transition: 'border-color 0.2s', boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {/* Password strength hint */}
              {password.length > 0 && password.length < 12 && (
                <div style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'IBM Plex Mono', marginBottom: 12 }}>
                  {12 - password.length} more characters needed
                </div>
              )}
              {password.length >= 12 && confirm.length > 0 && password !== confirm && (
                <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'IBM Plex Mono', marginBottom: 12 }}>
                  Passwords don't match
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !token || password.length < 12 || password !== confirm}
                style={{
                  width: '100%', padding: '12px 0',
                  background: (loading || !token || password.length < 12 || password !== confirm)
                    ? 'rgba(99,102,241,0.3)'
                    : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Syne', letterSpacing: '0.05em',
                  cursor: (loading || !token || password.length < 12 || password !== confirm) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Updating...' : 'Reset Password'}
              </button>
            </>
          )}
        </div>

        {!done && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span
              onClick={() => navigate('/forgot-password')}
              style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Sans', cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = 'var(--accent)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
            >
              ← Request a new link
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
