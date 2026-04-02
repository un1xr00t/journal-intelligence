/**
 * FloatingChat.jsx
 * Persistent floating journal assistant.
 * - Mounted in Shell (App.jsx) — never unmounts, survives page navigation
 * - Context fetched once on first open, cached in state
 * - Messages persist across page nav (component never re-mounts)
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../services/api'

const BUBBLE_SIZE = 52

// ── Tiny markdown renderer (bold + line breaks only) ─────────────────────────
function MiniMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => {
        // Bold: **text** or *text*
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
        return (
          <span key={i}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={j}>{p.slice(2, -2)}</strong>
              }
              if (p.startsWith('*') && p.endsWith('*')) {
                return <em key={j}>{p.slice(1, -1)}</em>
              }
              return p
            })}
            {i < lines.length - 1 && <br />}
          </span>
        )
      })}
    </span>
  )
}

export default function FloatingChat({ hidden = false }) {
  const [open, setOpen]               = useState(false)
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [contextString, setContext]   = useState(null)
  const [contextLoading, setCtxLoad] = useState(false)
  const [contextError, setCtxError]  = useState(null)
  const [unread, setUnread]           = useState(0)
  const bottomRef                     = useRef(null)
  const inputRef                      = useRef(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, loading])

  // Focus input when opening
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  // Load context once on first open
  const loadContext = useCallback(async () => {
    if (contextString !== null || contextLoading) return
    setCtxLoad(true)
    setCtxError(null)
    try {
      const res = await api.get('/api/floatchat/context')
      setContext(res.data.context_string || '')
    } catch (e) {
      setCtxError('Could not load journal context. Check your connection.')
      setContext('')  // allow chatting even without context
    } finally {
      setCtxLoad(false)
    }
  }, [contextString, contextLoading])

  const handleOpen = () => {
    setOpen(true)
    setUnread(0)
    loadContext()
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/api/floatchat/message', {
        messages: nextMessages,
        context_string: contextString || '',
      })
      const assistantMsg = { role: 'assistant', content: res.data.reply }
      setMessages(m => [...m, assistantMsg])
      if (!open) setUnread(n => n + 1)
    } catch (e) {
      const errText = e?.response?.data?.detail || 'Something went wrong. Try again.'
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${errText}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setContext(null)  // allow re-loading fresh context
    setCtxError(null)
  }

  if (hidden) return null

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = {
    wrap: {
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: 10,
      fontFamily: 'Syne, sans-serif',
    },
    panel: {
      width: 380,
      height: 520,
      background: 'var(--bg-card, #1a1a2e)',
      border: '1px solid var(--border, rgba(255,255,255,0.08))',
      borderRadius: 16,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      animation: 'floatIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
    },
    header: {
      padding: '12px 16px',
      background: 'var(--bg-card, #1a1a2e)',
      borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
    headerLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    headerIcon: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--accent, #6366f1), var(--accent-2, #8b5cf6))',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 13,
      flexShrink: 0,
    },
    headerTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: 'var(--text-primary, #fff)',
      letterSpacing: '0.01em',
    },
    headerSub: {
      fontSize: 10,
      fontFamily: 'IBM Plex Mono, monospace',
      color: 'var(--text-muted, rgba(255,255,255,0.4))',
      marginTop: 1,
    },
    headerBtns: {
      display: 'flex',
      gap: 4,
    },
    iconBtn: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: 'var(--text-muted, rgba(255,255,255,0.4))',
      padding: '4px 6px',
      borderRadius: 6,
      fontSize: 13,
      transition: 'color 0.15s, background 0.15s',
      display: 'flex',
      alignItems: 'center',
    },
    contextBadge: {
      fontSize: 9,
      fontFamily: 'IBM Plex Mono, monospace',
      color: contextString ? 'var(--accent, #6366f1)' : 'var(--text-muted, rgba(255,255,255,0.3))',
      background: contextString ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
      borderRadius: 4,
      padding: '2px 5px',
      letterSpacing: '0.04em',
    },
    messages: {
      flex: 1,
      overflowY: 'auto',
      padding: '14px 14px 6px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: 24,
      textAlign: 'center',
    },
    emptyIcon: {
      fontSize: 32,
      opacity: 0.3,
    },
    emptyText: {
      fontSize: 12,
      color: 'var(--text-muted, rgba(255,255,255,0.35))',
      lineHeight: 1.6,
    },
    pill: {
      fontSize: 11,
      fontFamily: 'IBM Plex Mono, monospace',
      color: 'var(--text-muted, rgba(255,255,255,0.35))',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid var(--border, rgba(255,255,255,0.07))',
      borderRadius: 20,
      padding: '4px 12px',
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
      whiteSpace: 'nowrap',
    },
    bubble: (role) => ({
      maxWidth: '85%',
      alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
      background: role === 'user'
        ? 'linear-gradient(135deg, var(--accent, #6366f1), var(--accent-2, #8b5cf6))'
        : 'var(--bg-hover, rgba(255,255,255,0.06))',
      color: 'var(--text-primary, #fff)',
      padding: '9px 13px',
      borderRadius: role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
      fontSize: 13,
      lineHeight: 1.55,
    }),
    thinkingDots: {
      alignSelf: 'flex-start',
      display: 'flex',
      gap: 4,
      padding: '10px 14px',
      background: 'var(--bg-hover, rgba(255,255,255,0.06))',
      borderRadius: '16px 16px 16px 4px',
    },
    dot: (i) => ({
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--text-muted, rgba(255,255,255,0.4))',
      animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
    }),
    inputRow: {
      padding: '10px 12px',
      borderTop: '1px solid var(--border, rgba(255,255,255,0.07))',
      display: 'flex',
      gap: 8,
      alignItems: 'flex-end',
      flexShrink: 0,
      background: 'var(--bg-card, #1a1a2e)',
    },
    textarea: {
      flex: 1,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid var(--border, rgba(255,255,255,0.08))',
      borderRadius: 10,
      color: 'var(--text-primary, #fff)',
      fontSize: 13,
      fontFamily: 'Syne, sans-serif',
      padding: '8px 11px',
      resize: 'none',
      outline: 'none',
      minHeight: 36,
      maxHeight: 100,
      lineHeight: 1.5,
      transition: 'border-color 0.15s',
    },
    sendBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      background: loading || !input.trim()
        ? 'rgba(99,102,241,0.2)'
        : 'linear-gradient(135deg, var(--accent, #6366f1), var(--accent-2, #8b5cf6))',
      border: 'none',
      cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 14,
      transition: 'background 0.15s',
      flexShrink: 0,
    },
    fab: {
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--accent, #6366f1), var(--accent-2, #8b5cf6))',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 8px 32px rgba(99,102,241,0.45)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      position: 'relative',
      flexShrink: 0,
    },
    fabIcon: {
      fontSize: 22,
      color: '#fff',
      lineHeight: 1,
      transition: 'transform 0.2s',
    },
    badge: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#ef4444',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--bg-base, #0f0f1a)',
    },
  }

  const STARTER_PROMPTS = [
    "How have I been doing lately?",
    "What patterns keep coming up?",
    "Who's been on my mind most?",
    "What should I be paying attention to?",
  ]

  const ctxStatus = contextLoading
    ? 'loading context…'
    : contextString
    ? 'context loaded ✓'
    : contextString === null
    ? 'ready'
    : 'no context'

  return (
    <div style={s.wrap}>
      {/* ── Keyframes injected once ───────────────────────────────────────── */}
      <style>{`
        @keyframes floatIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);     }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-5px); }
        }
        .floatchat-pill:hover {
          background: rgba(99,102,241,0.12) !important;
          color: var(--accent, #6366f1) !important;
          border-color: rgba(99,102,241,0.3) !important;
        }
        .floatchat-iconbtn:hover {
          background: rgba(255,255,255,0.07) !important;
          color: var(--text-primary, #fff) !important;
        }
        .floatchat-fab:hover {
          transform: scale(1.07);
          box-shadow: 0 12px 40px rgba(99,102,241,0.6) !important;
        }
        .floatchat-fab:active {
          transform: scale(0.96);
        }
        .floatchat-textarea:focus {
          border-color: rgba(99,102,241,0.4) !important;
        }
      `}</style>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerLeft}>
              <div style={s.headerIcon}>✦</div>
              <div>
                <div style={s.headerTitle}>Journal AI</div>
                <div style={s.headerSub}>Ask anything about your journal</div>
              </div>
              <span style={s.contextBadge}>{ctxStatus}</span>
            </div>
            <div style={s.headerBtns}>
              <button
                className="floatchat-iconbtn"
                style={s.iconBtn}
                title="Clear chat"
                onClick={clearChat}
              >↺</button>
              <button
                className="floatchat-iconbtn"
                style={s.iconBtn}
                title="Close"
                onClick={() => setOpen(false)}
              >✕</button>
            </div>
          </div>

          {/* Context error banner */}
          {contextError && (
            <div style={{
              padding: '8px 14px',
              background: 'rgba(239,68,68,0.1)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              fontSize: 11,
              color: '#fca5a5',
              fontFamily: 'IBM Plex Mono, monospace',
            }}>
              ⚠ {contextError}
            </div>
          )}

          {/* Messages */}
          <div style={s.messages}>
            {messages.length === 0 && !loading ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>✦</div>
                <div style={s.emptyText}>
                  {contextLoading
                    ? 'Loading your journal context…'
                    : 'Ask me anything about your journal. I have context from all your entries.'}
                </div>
                {!contextLoading && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                    {STARTER_PROMPTS.map(p => (
                      <button
                        key={p}
                        className="floatchat-pill"
                        style={s.pill}
                        onClick={() => { setInput(p); setTimeout(() => inputRef.current?.focus(), 50) }}
                      >{p}</button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <div key={i} style={s.bubble(m.role)}>
                    <MiniMarkdown text={m.content} />
                  </div>
                ))}
                {loading && (
                  <div style={s.thinkingDots}>
                    <div style={s.dot(0)} />
                    <div style={s.dot(1)} />
                    <div style={s.dot(2)} />
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input row */}
          <div style={s.inputRow}>
            <textarea
              ref={inputRef}
              className="floatchat-textarea"
              style={s.textarea}
              placeholder="Ask your journal…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={contextLoading}
            />
            <button
              style={s.sendBtn}
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              title="Send"
            >
              {loading ? '…' : '↑'}
            </button>
          </div>
        </div>
      )}

      {/* ── FAB button ────────────────────────────────────────────────────── */}
      {!open && (
        <button
          className="floatchat-fab"
          style={s.fab}
          onClick={handleOpen}
          title="Open journal assistant"
        >
          <span style={s.fabIcon}>✦</span>
          {unread > 0 && <div style={s.badge}>{unread}</div>}
        </button>
      )}
    </div>
  )
}
