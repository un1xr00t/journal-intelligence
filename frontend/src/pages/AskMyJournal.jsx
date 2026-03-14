import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

const ALL_SUGGESTED = [
  'When did I last feel this overwhelmed?',
  'What patterns show up when I write about work?',
  'When was the last time I felt genuinely proud?',
  'What do I write about most when I\'m stressed?',
  'When did things start feeling better?',
  'Who do I mention the most in my journal?',
  'What was I worried about a month ago?',
  'When did I last feel at peace?',
  'What situations make me feel the most anxious?',
  'When did I feel the most connected to someone?',
  'What have I been avoiding writing about?',
  'When did I last feel like myself?',
]

const PAGE_SIZE = 4

function getPage(index) {
  const start = (index * PAGE_SIZE) % ALL_SUGGESTED.length
  const result = []
  for (let i = 0; i < PAGE_SIZE; i++) {
    result.push(ALL_SUGGESTED[(start + i) % ALL_SUGGESTED.length])
  }
  return result
}

export default function AskMyJournal() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState(null)
  const [suggPage, setSuggPage] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setSuggPage(p => p + 1)
        setFadeIn(true)
      }, 300)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    api.get('/api/journal/ask/status')
      .then(r => setStatus(r.data))
      .catch(() => {})
  }, [])

  const ask = async (q) => {
    const finalQ = (q || query).trim()
    if (!finalQ) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const r = await api.post('/api/journal/ask', { query: finalQ, top_k: 5 })
      setResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  const scoreColor = (score) => {
    if (score >= 0.8) return 'var(--accent)'
    if (score >= 0.6) return '#f59e0b'
    return 'var(--text-muted)'
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 24, color: 'var(--text-primary)', marginBottom: 6 }}>
          Ask My Journal
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          Ask anything about your own history. Searches by meaning, not keywords.
        </p>
        {status && (
          <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: status.coverage_pct === 100 ? '#22c55e' : status.coverage_pct > 0 ? '#f59e0b' : '#ef4444',
              display: 'inline-block',
            }} />
            {status.indexed_entries} of {status.total_entries} entries indexed ({status.coverage_pct}%)
            {status.coverage_pct < 100 && (
              <span style={{ color: '#f59e0b' }}>— run backfill to index all</span>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
      }}>
        <textarea
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="When did I last feel this way?"
          rows={2}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 15,
            fontFamily: 'inherit',
            resize: 'none',
            lineHeight: 1.6,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enter to search</span>
          <button
            onClick={() => ask()}
            disabled={loading || !query.trim()}
            style={{
              background: loading || !query.trim() ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
              color: loading || !query.trim() ? 'var(--text-muted)' : '#000',
              border: 'none',
              borderRadius: 8,
              padding: '7px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Searching...' : 'Ask'}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      {!result && !loading && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Try asking
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            opacity: fadeIn ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}>
            {getPage(suggPage).map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); ask(s) }}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '6px 14px',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
          <div style={{ fontSize: 24, marginBottom: 12, color: 'var(--accent)', animation: 'pulse 1.5s infinite' }}>✦</div>
          Searching your journal...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          {/* Claude's answer */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 24,
            borderLeft: '3px solid var(--accent)',
          }}>
            <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              Answer
            </div>
            <p style={{ color: 'var(--text-primary)', fontSize: 15, lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>
              {result.answer}
            </p>
          </div>

          {/* Matched entries */}
          {result.matches?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
                Source entries ({result.matches.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.matches.map(m => (
                  <div key={m.entry_id} style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '14px 16px',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                  }}>
                    <div style={{ flexShrink: 0, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {new Date(m.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'IBM Plex Mono', color: scoreColor(m.score), fontWeight: 600 }}>
                        {Math.round(m.score * 100)}%
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                      {m.snippet}{m.snippet.length >= 300 ? '…' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ask again */}
          <button
            onClick={() => { setResult(null); setQuery(''); inputRef.current?.focus() }}
            style={{
              marginTop: 24,
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 16px',
              color: 'var(--text-muted)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ← Ask another question
          </button>
        </div>
      )}
    </div>
  )
}
