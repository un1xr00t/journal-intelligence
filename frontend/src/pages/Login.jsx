import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const { fetchTheme } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      await fetchTheme()
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials')
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
      {/* Grid texture */}
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
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>personal insight system</p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 32,
          boxShadow: '0 0 60px rgba(99,102,241,0.08)',
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Username</label>
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)} required
                autoComplete="username" autoFocus
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                autoComplete="current-password"
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Forgot password link */}
            <div style={{ textAlign: 'right', marginTop: -16, marginBottom: 20 }}>
              <span
                onClick={() => navigate('/forgot-password')}
                style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', cursor: 'pointer', letterSpacing: '0.02em' }}
                onMouseEnter={e => e.target.style.color = 'var(--accent)'}
                onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
              >
                Forgot password?
              </span>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px 0',
              background: loading ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
              fontFamily: 'Syne', letterSpacing: '0.05em', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s',
            }}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'DM Sans', marginBottom: 8 }}>
            Don't have an account?{' '}
            <span
              onClick={() => navigate('/onboarding')}
              style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.textDecoration = 'underline'}
              onMouseLeave={e => e.target.style.textDecoration = 'none'}
            >
              Create one →
            </span>
          </p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>
            local-first · end-to-end secured
          </p>
        </div>
      </div>
    </div>
  )
}
