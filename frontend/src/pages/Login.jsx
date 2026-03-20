import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { setAccessToken } from '../services/api'
import api from '../services/api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // 2FA step state
  const [totpRequired, setTotpRequired] = useState(false)
  const [partialToken, setPartialToken] = useState('')
  const [totpCode, setTotpCode]         = useState('')
  const [backupMode, setBackupMode]     = useState(false)
  const [backupCode, setBackupCode]     = useState('')

  const { login, completeLogin } = useAuth()
  const { fetchTheme } = useTheme()
  const navigate = useNavigate()

  // ── WebAuthn helpers ────────────────────────────────────────────────────────
  function b64url(buffer) {
    const bytes = new Uint8Array(buffer)
    let str = ''
    bytes.forEach(b => str += String.fromCharCode(b))
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  function fromB64url(str) {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4)
    const binary = atob(padded)
    const buf = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    return buf.buffer
  }

  // ── Passkey sign-in ──────────────────────────────────────────────────────────
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  const handlePasskeyLogin = async () => {
    if (!window.PublicKeyCredential) {
      setError('This browser does not support passkeys.')
      return
    }
    setPasskeyLoading(true)
    setError('')
    try {
      const beginRes = await api.post('/auth/passkey/authenticate-begin', {})
      const opts = beginRes.data
      const challengeId = opts.challenge_id

      const pkOpts = {
        ...opts,
        challenge: fromB64url(opts.challenge),
        allowCredentials: (opts.allowCredentials || []).map(c => ({
          ...c, id: fromB64url(c.id),
        })),
      }

      let credential
      try {
        credential = await navigator.credentials.get({ publicKey: pkOpts })
      } catch (e) {
        if (e.name === 'NotAllowedError') { setError('Passkey sign-in was cancelled.'); return }
        throw e
      }

      const serialised = {
        id: credential.id,
        rawId: b64url(credential.rawId),
        type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        response: {
          clientDataJSON:    b64url(credential.response.clientDataJSON),
          authenticatorData: b64url(credential.response.authenticatorData),
          signature:         b64url(credential.response.signature),
          userHandle: credential.response.userHandle ? b64url(credential.response.userHandle) : null,
        },
      }

      const { data } = await api.post('/auth/passkey/authenticate-complete', {
        challenge_id: challengeId,
        credential: serialised,
      })
      setAccessToken(data.access_token)
      completeLogin(data)
      await fetchTheme()
      navigate('/')
    } catch (e) {
      setError(e.response?.data?.detail || 'Passkey sign-in failed. Try again.')
    } finally { setPasskeyLoading(false) }
  }

  // ── Step 1: username + password ──────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(username, password)
      if (data?.requires_2fa) {
        setPartialToken(data.partial_token)
        setTotpRequired(true)
        return
      }
      await fetchTheme()
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2a: TOTP code ────────────────────────────────────────────────────────
  const handleTotpSubmit = async (e) => {
    e.preventDefault()
    const code = totpCode.replace(/\s/g, '')
    if (code.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/2fa/verify-login', {
        partial_token: partialToken,
        totp_code: code,
      })
      setAccessToken(data.access_token)
      completeLogin(data)
      await fetchTheme()
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2b: backup code ──────────────────────────────────────────────────────
  const handleBackupSubmit = async (e) => {
    e.preventDefault()
    if (!backupCode.trim()) { setError('Enter a backup code'); return }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/2fa/use-backup', {
        partial_token: partialToken,
        backup_code: backupCode.trim(),
      })
      setAccessToken(data.access_token)
      completeLogin(data)
      await fetchTheme()
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or already-used backup code.')
    } finally {
      setLoading(false)
    }
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
    transition: 'border-color 0.2s', boxSizing: 'border-box',
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

          {/* ── Normal login form ── */}
          {!totpRequired && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Username</label>
                <input
                  type="text" value={username} onChange={e => setUsername(e.target.value)} required
                  autoComplete="username" autoFocus style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  autoComplete="current-password" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
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
          )}


          {/* ── Passkey sign-in ── */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              style={{
                width: '100%', padding: '10px 0',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: 'rgba(255,255,255,0.5)',
                fontSize: 12, fontWeight: 600,
                fontFamily: 'Syne', letterSpacing: '0.04em',
                cursor: passkeyLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
                opacity: passkeyLoading ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!passkeyLoading) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)' }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            >
              {passkeyLoading ? 'Waiting for passkey…' : '◈ Sign in with passkey'}
            </button>
          </div>
          {/* ── 2FA step ── */}
          {totpRequired && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 22, marginBottom: 8, color: 'var(--accent)' }}>◉</div>
                <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: 'Syne', margin: 0 }}>Two-factor authentication</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', marginTop: 6 }}>
                  {backupMode ? 'Enter a backup code' : 'Enter the code from your authenticator app'}
                </p>
              </div>

              {!backupMode ? (
                <form onSubmit={handleTotpSubmit}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>6-Digit Code</label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      value={totpCode}
                      onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      autoFocus maxLength={6}
                      style={{ ...inputStyle, letterSpacing: '0.3em', fontSize: 20, textAlign: 'center' }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
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
                  }}>
                    {loading ? 'Verifying...' : 'Verify →'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleBackupSubmit}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Backup Code</label>
                    <input
                      type="text" value={backupCode}
                      onChange={e => setBackupCode(e.target.value.toUpperCase())}
                      placeholder="XXXXXXXX-XXXXXXXX"
                      autoFocus
                      style={{ ...inputStyle, letterSpacing: '0.1em', fontFamily: 'IBM Plex Mono', fontSize: 13 }}
                      onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
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
                  }}>
                    {loading ? 'Verifying...' : 'Use Backup Code →'}
                  </button>
                </form>
              )}

              {/* Toggle between code / backup */}
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <span
                  onClick={() => { setBackupMode(!backupMode); setError(''); setTotpCode(''); setBackupCode('') }}
                  style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', cursor: 'pointer' }}
                  onMouseEnter={e => e.target.style.color = 'var(--accent)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
                >
                  {backupMode ? '← Use authenticator app' : 'Use a backup code instead'}
                </span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <span
                  onClick={() => { setTotpRequired(false); setPartialToken(''); setError(''); setTotpCode(''); setBackupCode('') }}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'IBM Plex Mono', cursor: 'pointer' }}
                  onMouseEnter={e => e.target.style.color = 'var(--text-muted)'}
                  onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.2)'}
                >
                  ← Back to login
                </span>
              </div>
            </div>
          )}
        </div>

        {!totpRequired && (
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
        )}
      </div>
    </div>
  )
}
