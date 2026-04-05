/**
 * FloatingChat.jsx
 * Persistent floating journal assistant.
 * - Mounted in Shell (App.jsx) — never unmounts, survives page navigation
 * - Context fetched once on first open, cached in state
 * - Messages persist across page nav (component never re-mounts)
 * - AI returns structured JSON: {reply, actions[]}
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const BUBBLE_SIZE = 52

// ── Tiny markdown renderer ────────────────────────────────────────────────────
function MiniMarkdown({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <span>
      {lines.map((line, i) => {
        const isBullet = line.trimStart().startsWith('- ')
        const content  = isBullet ? line.trimStart().slice(2) : line
        const parts    = content.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
        const rendered = parts.map((p, j) => {
          if (p.startsWith('**') && p.endsWith('**')) return <strong key={j}>{p.slice(2, -2)}</strong>
          if (p.startsWith('*')  && p.endsWith('*'))  return <em key={j}>{p.slice(1, -1)}</em>
          return p
        })
        return (
          <span key={i}>
            {isBullet
              ? <span style={{ display: 'block', paddingLeft: 12, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 2, opacity: 0.5 }}>·</span>
                  {rendered}
                </span>
              : rendered
            }
            {!isBullet && i < lines.length - 1 && <br />}
          </span>
        )
      })}
    </span>
  )
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({ action, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={() => onClick(action.route)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display:     'inline-flex',
        alignItems:  'center',
        gap:         5,
        background:  hov ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.07)',
        border:      `1px solid ${hov ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.2)'}`,
        borderRadius: 16,
        padding:     '4px 10px',
        fontSize:    11,
        color:       hov ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.55)',
        cursor:      'pointer',
        transition:  'all 0.15s',
        fontFamily:  'Syne, sans-serif',
        whiteSpace:  'nowrap',
      }}
    >
      <span style={{ fontSize: 12 }}>{action.icon}</span>
      <span>{action.label}</span>
    </button>
  )
}

export default function FloatingChat({ hidden = false, bottomOffset = 24 }) {
  const [open, setOpen]              = useState(false)
  const [minimized, setMinimized]    = useState(false)
  const [messages, setMessages]      = useState([])
  const [input, setInput]            = useState('')
  const [loading, setLoading]        = useState(false)
  const [contextString, setContext]  = useState(null)
  const [contextLoading, setCtxLoad] = useState(false)
  const [contextError, setCtxError]  = useState(null)
  const [unread, setUnread]          = useState(0)
  const bottomRef                    = useRef(null)
  const inputRef                     = useRef(null)
  const navigate                     = useNavigate()

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, loading])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [open])

  const loadContext = useCallback(async () => {
    if (contextString !== null || contextLoading) return
    setCtxLoad(true)
    setCtxError(null)
    try {
      const res = await api.get('/api/floatchat/context')
      setContext(res.data.context_string || '')
    } catch (e) {
      setCtxError('Could not load journal context.')
      setContext('')
    } finally {
      setCtxLoad(false)
    }
  }, [contextString, contextLoading])

  const handleOpen = () => {
    setOpen(true)
    setMinimized(false)
    setUnread(0)
    loadContext()
  }

  const toggleMinimize = (e) => {
    e.stopPropagation()
    setMinimized(m => !m)
    if (minimized) setUnread(0)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg    = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/api/floatchat/message', {
        messages:       nextMessages,
        context_string: contextString || '',
      })
      const assistantMsg = {
        role:    'assistant',
        content: res.data.reply || '',
        actions: res.data.actions || [],
      }
      setMessages(m => [...m, assistantMsg])
      if (!open) setUnread(n => n + 1)
    } catch (e) {
      const errText = e?.response?.data?.detail || 'Something went wrong. Try again.'
      setMessages(m => [...m, { role: 'assistant', content: `⚠ ${errText}`, actions: [] }])
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
    setContext(null)
    setCtxError(null)
  }

  const handleAction = (route) => {
    setOpen(false)
    navigate(route)
  }

  if (hidden) return null

  const s = {
    wrap: {
      position:      'fixed',
      bottom:        bottomOffset,
      right:         24,
      zIndex:        9999,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'flex-end',
      gap:           10,
      fontFamily:    'Syne, sans-serif',
    },
    panel: {
      width:         380,
      height:        minimized ? 'auto' : 540,
      background:    'var(--bg-card, #1a1a2e)',
      border:        '1px solid var(--border, rgba(255,255,255,0.08))',
      borderRadius:  16,
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      boxShadow:     '0 24px 80px rgba(0,0,0,0.6)',
      animation:     'floatIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      transition:    'height 0.2s ease',
    },
    header: {
      padding:        '12px 16px',
      background:     'var(--bg-card, #1a1a2e)',
      borderBottom:   '1px solid var(--border, rgba(255,255,255,0.07))',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      flexShrink:     0,
    },
    headerLeft: {
      display:    'flex',
      alignItems: 'center',
      gap:        8,
    },
    headerIcon: {
      width:          28,
      height:         28,
      borderRadius:   '50%',
      background:     'linear-gradient(135deg, var(--accent, #6366f1), rgba(168,85,247,0.9))',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      fontSize:       13,
      flexShrink:     0,
    },
    headerTitle: {
      fontSize:      13,
      fontWeight:    700,
      color:         'var(--text-primary, #fff)',
      letterSpacing: '0.01em',
    },
    headerSub: {
      fontSize:    10,
      fontFamily:  'IBM Plex Mono, monospace',
      color:       'var(--text-muted, rgba(255,255,255,0.4))',
      marginTop:   1,
    },
    headerBtns: {
      display: 'flex',
      gap:     4,
    },
    iconBtn: {
      background:  'none',
      border:      'none',
      cursor:      'pointer',
      color:       'var(--text-muted, rgba(255,255,255,0.4))',
      padding:     '4px 6px',
      borderRadius: 6,
      fontSize:    13,
      transition:  'color 0.15s, background 0.15s',
      display:     'flex',
      alignItems:  'center',
    },
    contextBadge: {
      fontSize:   9,
      fontFamily: 'IBM Plex Mono, monospace',
      color:      contextString ? 'var(--accent, #6366f1)' : 'var(--text-muted, rgba(255,255,255,0.3))',
      background: contextString ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.04)',
      borderRadius: 4,
      padding:    '2px 5px',
      letterSpacing: '0.04em',
    },
    messages: {
      flex:          1,
      overflowY:     'auto',
      padding:       '14px 14px 6px',
      display:       'flex',
      flexDirection: 'column',
      gap:           12,
    },
    emptyState: {
      flex:           1,
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            10,
      padding:        24,
      textAlign:      'center',
    },
    emptyIcon: {
      fontSize: 32,
      opacity:  0.3,
    },
    emptyText: {
      fontSize:   12,
      color:      'var(--text-muted, rgba(255,255,255,0.35))',
      lineHeight: 1.6,
    },
    pill: {
      fontSize:     11,
      fontFamily:   'IBM Plex Mono, monospace',
      color:        'var(--text-muted, rgba(255,255,255,0.35))',
      background:   'rgba(255,255,255,0.04)',
      border:       '1px solid var(--border, rgba(255,255,255,0.07))',
      borderRadius: 20,
      padding:      '4px 12px',
      cursor:       'pointer',
      transition:   'background 0.15s, color 0.15s',
      whiteSpace:   'nowrap',
    },
    inputRow: {
      padding:    '10px 12px',
      borderTop:  '1px solid var(--border, rgba(255,255,255,0.07))',
      display:    'flex',
      gap:        8,
      alignItems: 'flex-end',
      flexShrink: 0,
      background: 'var(--bg-card, #1a1a2e)',
    },
    textarea: {
      flex:        1,
      background:  'rgba(255,255,255,0.05)',
      border:      '1px solid var(--border, rgba(255,255,255,0.08))',
      borderRadius: 10,
      color:       'var(--text-primary, #fff)',
      fontSize:    13,
      fontFamily:  'Syne, sans-serif',
      padding:     '8px 11px',
      resize:      'none',
      outline:     'none',
      minHeight:   36,
      maxHeight:   100,
      lineHeight:  1.5,
      transition:  'border-color 0.15s',
    },
    sendBtn: {
      width:          36,
      height:         36,
      borderRadius:   10,
      background:     loading || !input.trim()
        ? 'rgba(99,102,241,0.2)'
        : 'linear-gradient(135deg, var(--accent, #6366f1), rgba(168,85,247,0.9))',
      border:         'none',
      cursor:         loading || !input.trim() ? 'not-allowed' : 'pointer',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      color:          '#fff',
      fontSize:       14,
      transition:     'background 0.15s',
      flexShrink:     0,
    },
    fab: {
      width:          BUBBLE_SIZE,
      height:         BUBBLE_SIZE,
      borderRadius:   '50%',
      background:     'linear-gradient(135deg, var(--accent, #6366f1), rgba(168,85,247,0.9))',
      border:         'none',
      cursor:         'pointer',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      boxShadow:      '0 8px 32px rgba(99,102,241,0.45)',
      transition:     'transform 0.15s, box-shadow 0.15s',
      position:       'relative',
      flexShrink:     0,
    },
    badge: {
      position:       'absolute',
      top:            -2,
      right:          -2,
      width:          18,
      height:         18,
      borderRadius:   '50%',
      background:     '#ef4444',
      color:          '#fff',
      fontSize:       10,
      fontWeight:     700,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      border:         '2px solid var(--bg-base, #0f0f1a)',
    },
  }

  const STARTER_PROMPTS = [
    "Where am I in my exit plan right now?",
    "How have I been doing mentally this week?",
    "What patterns keep showing up?",
    "What should my next move be?",
  ]

  const ctxStatus = contextLoading
    ? 'loading…'
    : contextString
    ? 'context loaded ✓'
    : contextString === null
    ? 'ready'
    : 'no context'

  return (
    <div style={s.wrap}>
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
        .floatchat-fab:active { transform: scale(0.96); }
        .floatchat-textarea:focus {
          border-color: rgba(99,102,241,0.4) !important;
        }
      `}</style>

      {open && (
        <div style={s.panel}>
          {/* Header — click to minimize/expand */}
          <div style={{ ...s.header, cursor: 'pointer', userSelect: 'none' }} onClick={toggleMinimize} title={minimized ? 'Expand' : 'Minimize'}>
            <div style={s.headerLeft}>
              <div style={s.headerIcon}>✦</div>
              <div>
                <div style={s.headerTitle}>Journal AI</div>
                <div style={s.headerSub}>Your full history in context</div>
              </div>
              <span style={s.contextBadge}>{ctxStatus}</span>
            </div>
            <div style={s.headerBtns}>
                {minimized && unread > 0 && (
                  <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', marginRight: 4 }}>{unread}</span>
                )}
                <button className="floatchat-iconbtn" style={s.iconBtn} title="Clear chat" onClick={e => { e.stopPropagation(); clearChat() }}>↺</button>
                <button className="floatchat-iconbtn" style={{ ...s.iconBtn, fontSize: 11 }} title={minimized ? 'Expand' : 'Minimize'} onClick={toggleMinimize}>{minimized ? '▲' : '▼'}</button>
                <button className="floatchat-iconbtn" style={s.iconBtn} title="Close" onClick={e => { e.stopPropagation(); setOpen(false) }}>✕</button>
            </div>
          </div>

          {/* Context error banner */}
          {!minimized && contextError && (
            <div style={{
              padding:      '8px 14px',
              background:   'rgba(239,68,68,0.1)',
              borderBottom: '1px solid rgba(239,68,68,0.2)',
              fontSize:     11,
              color:        '#fca5a5',
              fontFamily:   'IBM Plex Mono, monospace',
            }}>
              ⚠ {contextError}
            </div>
          )}

          {/* Messages + Input (hidden when minimized) */}
          {!minimized && <>
          <div style={s.messages}>
            {messages.length === 0 && !loading ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>✦</div>
                <div style={s.emptyText}>
                  {contextLoading
                    ? 'Loading your journal context…'
                    : 'Ask me anything. I have your entries, exit plan, evidence, and patterns.'}
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
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {/* Message bubble */}
                    <div style={{
                      maxWidth:   '85%',
                      background: m.role === 'user'
                        ? 'linear-gradient(135deg, var(--accent, #6366f1), rgba(168,85,247,0.9))'
                        : 'var(--bg-hover, rgba(255,255,255,0.06))',
                      color:        'var(--text-primary, #fff)',
                      padding:      '9px 13px',
                      borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      fontSize:     13,
                      lineHeight:   1.55,
                    }}>
                      <MiniMarkdown text={m.content} />
                    </div>

                    {/* Action buttons (assistant only) */}
                    {m.role === 'assistant' && m.actions?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxWidth: '90%' }}>
                        {m.actions.map((a, ai) => (
                          <ActionBtn key={ai} action={a} onClick={handleAction} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {loading && (
                  <div style={{
                    background:   'var(--bg-hover, rgba(255,255,255,0.06))',
                    borderRadius: '16px 16px 16px 4px',
                    padding:      '10px 14px',
                    display:      'flex',
                    gap:          5,
                    alignItems:   'center',
                    alignSelf:    'flex-start',
                  }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{
                        width:        6,
                        height:       6,
                        borderRadius: '50%',
                        background:   'var(--text-muted, rgba(255,255,255,0.4))',
                        animation:    `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                )}

                <div ref={bottomRef} />
              </>
            )}
          </div>
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
            <button style={s.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()} title="Send">
              {loading ? '…' : '↑'}
            </button>
          </div>
          </>
          }
        </div>
      )}

      {/* FAB */}
      {!open && (
        <button className="floatchat-fab" style={s.fab} onClick={handleOpen} title="Open journal assistant">
          <span style={{ fontSize: 22, color: '#fff', lineHeight: 1 }}>✦</span>
          {unread > 0 && <div style={s.badge}>{unread}</div>}
        </button>
      )}
    </div>
  )
}
