import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(true)
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
          {sent ? (
            /* Success state */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Check your email</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                If that email is registered, you'll receive a reset link within a few minutes.
                The link expires in 1 hour.
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', marginBottom: 24 }}>
                Don't see it? Check your spam folder.
              </p>
              <button
                onClick={() => navigate('/login')}
                style={{
                  width: '100%', padding: '11px 0',
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Syne', cursor: 'pointer',
                }}
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Forgot your password?</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                Enter your email address and we'll send you a reset link.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoFocus
                  placeholder="you@example.com"
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

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading || !email.trim()}
                style={{
                  width: '100%', padding: '12px 0',
                  background: loading || !email.trim() ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
                  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Syne', letterSpacing: '0.05em',
                  cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </>
          )}
        </div>

        {!sent && (
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span
              onClick={() => navigate('/login')}
              style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Sans', cursor: 'pointer' }}
              onMouseEnter={e => e.target.style.color = 'var(--accent)'}
              onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
            >
              ← Back to Sign In
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
