import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const mono = { fontFamily: 'IBM Plex Mono, monospace' }

export default function InviteAccess() {
  const { token }    = useParams()
  const navigate     = useNavigate()

  const [status, setStatus]       = useState(null)   // invite metadata
  const [loading, setLoading]     = useState(true)
  const [passphrase, setPassphrase] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError]         = useState('')
  const [granted, setGranted]     = useState(false)

  useEffect(() => {
    axios.get(`/api/invite/${token}/status`)
      .then(r => setStatus(r.data))
      .catch(err => {
        if (err.response?.status === 404) setStatus({ notFound: true })
        else setStatus({ error: true })
      })
      .finally(() => setLoading(false))
  }, [token])

  const verify = async () => {
    if (!passphrase.trim()) return
    setVerifying(true)
    setError('')
    try {
      const res = await axios.post(`/api/invite/${token}/verify`, { passphrase: passphrase.trim() })
      // Store invite access token — api.js sends it as X-Invite-Token on every request.
      // Format: "{token_id}:{hmac_hex}" parsed by /internal/ip-check.
      // This makes access IP-independent — mobile IP rotation no longer breaks access.
      if (res.data.invite_access_token) {
        // We need the token_id to prefix the hmac. Fetch it from the status endpoint
        // which we already loaded — but simplest is to store the full opaque string
        // and have the server parse it. We store as-is since server returns token_id separately.
        // Actually server returns invite_access_token as plain hmac — we need token_id too.
        // The status endpoint gave us the token but not id. Re-fetch status to get id.
        // Simpler: server should return token_id in verify response. We patch that too.
        // For now store as "{token_id}:{hmac}" using the id from the URL token status.
        // Since we don't have token_id here, store a lookup key the server can resolve.
        // UPDATED: server now returns token_id in verify response.
        const { invite_access_token, token_id } = res.data
        if (invite_access_token && token_id) {
          localStorage.setItem('invite_access_token', `${token_id}:${invite_access_token}`)
        }
      }
      setGranted(true)
      // Brief pause so they see the success state, then forward to registration
      setTimeout(() => navigate('/onboarding'), 1800)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Something went wrong.'
      setError(msg)
    } finally {
      setVerifying(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') verify()
  }

  // ── Shared shell ─────────────────────────────────────────────────────────
  const Shell = ({ children }) => (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base, #07070f)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--bg-card, rgba(255,255,255,0.04))',
        border: '1px solid var(--border, rgba(255,255,255,0.08))',
        borderRadius: 14,
        padding: '40px 36px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, color: 'var(--accent, #6366f1)', marginBottom: 12 }}>✦</div>
        <div style={{
          fontFamily: 'Syne, sans-serif',
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: '0.18em',
          color: 'var(--text-primary, #fff)',
          textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          Journal Intelligence
        </div>
        {children}
      </div>
    </div>
  )

  // ── States ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Shell>
        <p style={{ ...mono, fontSize: 12, color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
          checking invite...
        </p>
      </Shell>
    )
  }

  if (!status || status.notFound || status.error) {
    return (
      <Shell>
        <p style={{ ...mono, fontSize: 13, color: '#ef4444', marginBottom: 8 }}>Link not found.</p>
        <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
          This invite link doesn't exist or has been removed.
        </p>
      </Shell>
    )
  }

  if (status.expired) {
    return (
      <Shell>
        <p style={{ ...mono, fontSize: 13, color: '#f59e0b', marginBottom: 8 }}>Invite expired.</p>
        <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
          This invite link is no longer valid. Ask for a new one.
        </p>
      </Shell>
    )
  }

  if (status.revoked) {
    return (
      <Shell>
        <p style={{ ...mono, fontSize: 13, color: '#ef4444', marginBottom: 8 }}>Invite revoked.</p>
        <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
          This invite link has been revoked by the admin.
        </p>
      </Shell>
    )
  }

  if (status.invalidated) {
    return (
      <Shell>
        <p style={{ ...mono, fontSize: 13, color: '#ef4444', marginBottom: 8 }}>Invite invalidated.</p>
        <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))', lineHeight: 1.6 }}>
          This link was accessed from another location and has been permanently invalidated for security reasons.
        </p>
        {status.claimed_by_me && (
          <p style={{ ...mono, fontSize: 11, color: 'var(--accent, #6366f1)', marginTop: 12 }}>
            If you're the original recipient, your access is still active — go to the app directly.
          </p>
        )}
      </Shell>
    )
  }

  if (granted) {
    return (
      <Shell>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <p style={{ ...mono, fontSize: 13, color: '#10b981', marginBottom: 8 }}>Access granted.</p>
        <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))' }}>
          Taking you to registration...
        </p>
      </Shell>
    )
  }

  // ── Main passphrase gate ─────────────────────────────────────────────────
  return (
    <Shell>
      <p style={{
        ...mono,
        fontSize: 11,
        color: 'var(--text-muted, rgba(255,255,255,0.4))',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
      }}>
        You've been invited
      </p>
      {status.label && (
        <p style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary, #fff)',
          marginBottom: 24,
        }}>
          {status.label}
        </p>
      )}
      {!status.label && <div style={{ marginBottom: 24 }} />}

      <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted, rgba(255,255,255,0.4))', marginBottom: 16, lineHeight: 1.6 }}>
        Enter the passphrase you were given to unlock access and create your account.
      </p>

      <input
        type="text"
        placeholder="word-word-word-1234"
        value={passphrase}
        onChange={e => setPassphrase(e.target.value)}
        onKeyDown={handleKey}
        autoFocus
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: 8,
          padding: '10px 14px',
          color: 'var(--text-primary, #fff)',
          ...mono,
          fontSize: 13,
          outline: 'none',
          marginBottom: error ? 8 : 16,
          letterSpacing: '0.05em',
        }}
      />

      {error && (
        <p style={{ ...mono, fontSize: 11, color: '#ef4444', marginBottom: 12, textAlign: 'left' }}>
          {error}
        </p>
      )}

      <button
        onClick={verify}
        disabled={verifying || !passphrase.trim()}
        style={{
          width: '100%',
          padding: '11px 0',
          background: verifying || !passphrase.trim() ? 'rgba(99,102,241,0.3)' : 'var(--accent, #6366f1)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: verifying || !passphrase.trim() ? 'not-allowed' : 'pointer',
          fontFamily: 'Syne, sans-serif',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          transition: 'background 0.2s',
        }}
      >
        {verifying ? 'Verifying...' : 'Unlock Access'}
      </button>

      <p style={{ ...mono, fontSize: 10, color: 'var(--text-muted, rgba(255,255,255,0.25))', marginTop: 20, lineHeight: 1.5 }}>
        This is a private app. Access is by invite only.
      </p>
    </Shell>
  )
}
