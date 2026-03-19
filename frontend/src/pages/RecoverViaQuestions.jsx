/**
 * RecoverViaQuestions.jsx — frontend/src/pages/RecoverViaQuestions.jsx
 * Offline password recovery via security questions.
 * Step 1: enter username → fetch questions.
 * Step 2: answer all 3 → receive reset token → redirect to /reset-password.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const inputStyle = {
  width: '100%', padding: '10px 14px',
  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  transition: 'border-color 0.2s', boxSizing: 'border-box',
  fontFamily: "'DM Sans', sans-serif",
}
const labelStyle = {
  display: 'block', fontSize: 10, fontFamily: 'IBM Plex Mono',
  letterSpacing: '0.1em', color: 'var(--text-muted)',
  textTransform: 'uppercase', marginBottom: 6,
}
const primaryBtn = (disabled) => ({
  width: '100%', padding: '12px 0',
  background: disabled
    ? 'rgba(99,102,241,0.3)'
    : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
  border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600,
  fontFamily: 'Syne', letterSpacing: '0.05em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'opacity 0.2s',
})
const errorBox = {
  padding: '10px 14px',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.2)',
  borderRadius: 8, color: '#ef4444', fontSize: 12, marginBottom: 16,
}

export default function RecoverViaQuestions() {
  const navigate = useNavigate()

  const [step, setStep]           = useState('username') // 'username' | 'questions' | 'done'
  const [username, setUsername]   = useState('')
  const [questions, setQuestions] = useState({ q1: '', q2: '', q3: '' })
  const [answers, setAnswers]     = useState({ a1: '', a2: '', a3: '' })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  // ── Step 1: look up username ──────────────────────────────────────────────
  const handleFetchQuestions = async () => {
    if (!username.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/auth/security-questions/fetch', {
        params: { username: username.trim() },
      })
      setQuestions({ q1: res.data.question_1, q2: res.data.question_2, q3: res.data.question_3 })
      setStep('questions')
    } catch (err) {
      setError(
        err.response?.status === 404
          ? 'No security questions found for that username.'
          : err.response?.data?.detail || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: verify answers ────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!answers.a1.trim() || !answers.a2.trim() || !answers.a3.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/security-questions/verify', {
        username: username.trim(),
        answer_1: answers.a1,
        answer_2: answers.a2,
        answer_3: answers.a3,
      })
      // Token returned — bounce to reset-password page
      navigate(`/reset-password?token=${res.data.reset_token}`)
    } catch (err) {
      setError(
        err.response?.status === 429
          ? 'Too many attempts. Please wait 15 minutes before trying again.'
          : err.response?.data?.detail || 'One or more answers are incorrect.'
      )
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
      {/* Grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px', pointerEvents: 'none',
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

          {/* ── Step 1: username ── */}
          {step === 'username' && (
            <>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Account recovery
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                Answer your security questions to reset your password without email access.
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFetchQuestions()}
                  autoFocus
                  placeholder="your username"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {error && <div style={errorBox}>{error}</div>}

              <button
                onClick={handleFetchQuestions}
                disabled={loading || !username.trim()}
                style={primaryBtn(loading || !username.trim())}
              >
                {loading ? 'Looking up account…' : 'Continue →'}
              </button>
            </>
          )}

          {/* ── Step 2: answer questions ── */}
          {step === 'questions' && (
            <>
              <h2 style={{ fontSize: 16, fontFamily: 'Syne', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Answer your questions
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                Answer all three exactly as you entered them during setup. Capitalisation doesn't matter.
              </p>

              {[
                { q: questions.q1, a: answers.a1, key: 'a1' },
                { q: questions.q2, a: answers.a2, key: 'a2' },
                { q: questions.q3, a: answers.a3, key: 'a3' },
              ].map((item, i) => (
                <div key={i} style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Question {i + 1}</label>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8,
                    padding: '8px 12px', background: 'rgba(99,102,241,0.06)',
                    border: '1px solid rgba(99,102,241,0.15)', borderRadius: 6,
                    lineHeight: 1.5,
                  }}>
                    {item.q}
                  </div>
                  <input
                    type="text"
                    value={item.a}
                    onChange={e => setAnswers(prev => ({ ...prev, [item.key]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && i === 2 && handleVerify()}
                    placeholder="Your answer"
                    style={inputStyle}
                    onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
              ))}

              {error && <div style={errorBox}>{error}</div>}

              <button
                onClick={handleVerify}
                disabled={loading || !answers.a1.trim() || !answers.a2.trim() || !answers.a3.trim()}
                style={primaryBtn(loading || !answers.a1.trim() || !answers.a2.trim() || !answers.a3.trim())}
              >
                {loading ? 'Verifying…' : 'Verify and reset password'}
              </button>

              <button
                onClick={() => { setStep('username'); setError('') }}
                style={{
                  marginTop: 10, width: '100%', padding: '8px 0',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)',
                }}
              >
                ← Use a different username
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span
            onClick={() => navigate('/forgot-password')}
            style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Sans', cursor: 'pointer' }}
            onMouseEnter={e => e.target.style.color = 'var(--accent)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
          >
            ← Send email reset instead
          </span>
          <span style={{ margin: '0 10px', color: 'var(--text-muted)', fontSize: 12 }}>·</span>
          <span
            onClick={() => navigate('/login')}
            style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Sans', cursor: 'pointer' }}
            onMouseEnter={e => e.target.style.color = 'var(--accent)'}
            onMouseLeave={e => e.target.style.color = 'var(--text-muted)'}
          >
            Back to Sign In
          </span>
        </div>
      </div>
    </div>
  )
}
