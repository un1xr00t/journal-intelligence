/**
 * VoiceMode.jsx
 * Compact Jarvis-style voice overlay — sits above the floating FAB.
 *
 * Flow (continuous):
 *   idle → tap mic → listening (Web Speech API STT)
 *        → processing (POST /api/voice/message)
 *        → speaking (POST /api/voice/speak → Web Audio API + canvas viz)
 *        → listening again (auto-restart) ← continuous loop
 *
 * Audio architecture (no echo):
 *   Mic:  getUserMedia → createMediaStreamSource → analyser   (NEVER → destination)
 *   TTS:  createBufferSource → analyser                       (for viz)
 *                            → audioCtx.destination           (for playback, direct)
 *
 * getUserMedia called ONCE, stream stored in micStreamRef and reused.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import api from '../services/api'

const TONES = [
  { id: 'best_friend', label: 'Best Friend',  symbol: '✦', voice: 'nova'    },
  { id: 'therapist',   label: 'Therapist',    symbol: '◎', voice: 'shimmer' },
  { id: 'hype_coach',  label: 'Hype Coach',   symbol: '⚡', voice: 'fable'   },
  { id: 'unhinged',    label: 'Unhinged 18+', symbol: '✕', voice: 'onyx'    },
  { id: 'midnight',    label: 'Midnight',     symbol: '〜', voice: 'echo'    },
]

const STATE_COL = {
  idle:       [99,  102, 241],
  listening:  [16,  185, 129],
  processing: [245, 158, 11],
  speaking:   [168, 85,  247],
}

const NUM_BARS = 80
const SZ       = 240
const CX       = SZ / 2
const BASE_R   = 52
const MAX_BAR  = 50

function WaveIcon({ color = '#fff', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 14" fill="none" style={{ display: 'block', flexShrink: 0 }}>
      <path d="M1 7 Q3 1 5 7 Q7 13 9 7 Q11 1 13 7 Q15 13 17 7 Q19 1 21 7 Q23 13 25 7 Q27 1 28 7"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MicIcon({ color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <rect x="9" y="2" width="6" height="14" rx="3" fill={color} />
      <path d="M5 10a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function SpinnerIcon({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" strokeDasharray="20 40" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
      </circle>
    </svg>
  )
}

function StopIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color} style={{ display: 'block' }}>
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  )
}

export default function VoiceMode({ onClose, contextString }) {
  const [vs, setVs]            = useState('idle')
  const [transcript, setTx]    = useState('')
  const [lastReply, setReply]  = useState('')
  const [statusMsg, setStatus] = useState('Tap to start')
  const [toneId, setToneId]    = useState('best_friend')
  const [voiceId, setVoiceId]  = useState('nova')
  const [showTones, setShow]   = useState(false)
  const [messages, setMsgs]    = useState([])
  const [error, setError]      = useState('')
  const [continuous, setCont]  = useState(true)
  const [localCtx, setLocalCtx] = useState('')

  const canvasRef    = useRef(null)
  const analyserRef  = useRef(null)
  const audioCtxRef  = useRef(null)
  const sourceRef    = useRef(null)
  const recogRef     = useRef(null)
  const dataRef      = useRef(null)
  const micStreamRef = useRef(null)
  const micSourceRef = useRef(null)
  const vsRef        = useRef('idle')
  const contRef      = useRef(true)
  const msgsRef      = useRef([])
  const toneIdRef    = useRef('best_friend')
  const voiceIdRef   = useRef('nova')
  const localCtxRef  = useRef('')
  const isSpeakingRef = useRef(false)  // true while TTS plays — blocks STT results

  useEffect(() => { vsRef.current    = vs },        [vs])
  useEffect(() => { contRef.current  = continuous }, [continuous])
  useEffect(() => { msgsRef.current  = messages },   [messages])
  useEffect(() => { toneIdRef.current  = toneId },   [toneId])
  useEffect(() => { voiceIdRef.current = voiceId },  [voiceId])
  useEffect(() => { localCtxRef.current = localCtx }, [localCtx])

  // If context wasn't loaded yet when voice opened, fetch it now
  useEffect(() => {
    if (!contextString) {
      api.get('/api/floatchat/context').then(r => {
        setLocalCtx(r.data.context_string || '')
      }).catch(() => {})
    }
  }, [contextString])

  useEffect(() => {
    api.get('/api/voice/settings').then(r => {
      if (r.data.tone_id) {
        setToneId(r.data.tone_id)
        const t = TONES.find(t => t.id === r.data.tone_id)
        if (t) setVoiceId(t.voice)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      try { recogRef.current?.stop() } catch {}
      try { sourceRef.current?.stop() } catch {}
      try { micStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
      try { audioCtxRef.current?.close() } catch {}
    }
  }, [])

  // ── Canvas ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frame

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const state = vsRef.current
      const [cr, cg, cb] = STATE_COL[state] || STATE_COL.idle
      const now = Date.now() / 1000
      ctx.clearRect(0, 0, SZ, SZ)

      let freq = null
      if (analyserRef.current && dataRef.current && (state === 'speaking' || state === 'listening')) {
        analyserRef.current.getByteFrequencyData(dataRef.current)
        freq = dataRef.current
      }

      for (let i = 0; i < NUM_BARS; i++) {
        const angle = (i / NUM_BARS) * Math.PI * 2 - Math.PI / 2
        let h
        if (freq && state === 'speaking') {
          const fi = Math.floor((i / NUM_BARS) * analyserRef.current.frequencyBinCount * 0.75)
          h = Math.max((freq[fi] / 255) * MAX_BAR, 3 + Math.sin(now * 4 + i * 0.25) * 2)
        } else if (freq && state === 'listening') {
          const fi = Math.floor((i / NUM_BARS) * analyserRef.current.frequencyBinCount * 0.5)
          h = Math.max((freq[fi] / 255) * MAX_BAR * 0.55, 2 + Math.sin(now * 3 + i * 0.2) * 1.5)
        } else if (state === 'processing') {
          h = 4 + (Math.sin(now * 7 + (i / NUM_BARS) * Math.PI * 4) * 0.5 + 0.5) * 22
        } else {
          h = 2 + Math.sin(now * 1.2 + (i / NUM_BARS) * Math.PI * 2) * 3.5
        }
        const x1 = CX + Math.cos(angle) * BASE_R
        const y1 = CX + Math.sin(angle) * BASE_R
        const x2 = CX + Math.cos(angle) * (BASE_R + h)
        const y2 = CX + Math.sin(angle) * (BASE_R + h)
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.35 + (h / (MAX_BAR + 10)) * 0.65})`
        ctx.lineWidth   = 2.2
        ctx.lineCap     = 'round'
        ctx.stroke()
      }

      const pulse = 1 + Math.sin(now * (state === 'speaking' ? 5 : 1.4)) * 0.07
      const orbR  = (state === 'speaking' ? 34 : state === 'listening' ? 31 : 28) * pulse
      const grad  = ctx.createRadialGradient(CX, CX, 0, CX, CX, orbR)
      grad.addColorStop(0,    `rgba(${cr},${cg},${cb},0.92)`)
      grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.45)`)
      grad.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`)
      ctx.beginPath()
      ctx.arc(CX, CX, orbR, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      ctx.fillStyle    = 'rgba(255,255,255,0.9)'
      ctx.font         = '500 13px Syne, sans-serif'
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        state === 'listening' ? '●' : state === 'processing' ? '◌' : state === 'speaking' ? '〜' : '✦',
        CX, CX
      )
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [])

  // ── Setup audio + mic (once) ───────────────────────────────────────────────
  const setupAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ac = audioCtxRef.current
    if (ac.state === 'suspended') await ac.resume()

    if (!analyserRef.current) {
      analyserRef.current = ac.createAnalyser()
      analyserRef.current.fftSize = 256
      dataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount)
    }

    // Request mic ONCE — reuse stream on subsequent calls (no repeated prompts)
    if (!micStreamRef.current) {
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
        micSourceRef.current = ac.createMediaStreamSource(micStreamRef.current)
        // Mic → analyser ONLY. Never → destination. This is what prevents echo.
        micSourceRef.current.connect(analyserRef.current)
      } catch { /* permission denied — viz uses math fallback */ }
    }
  }, [])

  // ── TTS playback ───────────────────────────────────────────────────────────
  const playTTS = useCallback(async (text, vid) => {
    try {
      setVs('speaking')
      setStatus('Speaking…')
      isSpeakingRef.current = true
      // Hard-stop any active recognition so AI voice isn't picked up as input
      try { recogRef.current?.abort() } catch {}
      recogRef.current = null

      const resp = await api.post(
        '/api/voice/speak',
        { text, voice_id: vid },
        { responseType: 'arraybuffer' }
      )

      const ac = audioCtxRef.current
      if (ac.state === 'suspended') await ac.resume()

      const buf = await ac.decodeAudioData(resp.data)
      try { sourceRef.current?.disconnect() } catch {}

      const src = ac.createBufferSource()
      src.buffer = buf
      // TTS → analyser (viz) AND → destination (speakers) separately — mic never touches destination
      src.connect(analyserRef.current)
      src.connect(ac.destination)
      src.start(0)
      sourceRef.current = src

      src.onended = () => {
        try { src.disconnect() } catch {}
        isSpeakingRef.current = false
        if (contRef.current) {
          // Small delay so browser mic buffer clears before we listen again
          setTimeout(() => startListeningInner(), 600)
        } else {
          setVs('idle')
          setStatus('Tap to speak')
        }
      }
    } catch (e) {
      isSpeakingRef.current = false
      setError(e?.response?.status === 400 ? 'Check OpenAI key in Settings → Voice' : e?.message || 'Audio playback error')
      setVs('idle')
      setStatus('Tap to speak')
    }
  }, [])

  // ── Core listen loop ───────────────────────────────────────────────────────
  const startListeningInner = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition not supported — use Chrome or Edge')
      setVs('idle')
      return
    }

    const recog          = new SR()
    recog.lang           = 'en-US'
    recog.continuous     = false
    recog.interimResults = false
    recogRef.current     = recog

    recog.onstart = () => { setVs('listening'); setStatus('Listening…'); setError('') }

    recog.onresult = async (e) => {
      // Discard result if TTS is playing — this was the AI's own voice
      if (isSpeakingRef.current) return
      const text = e.results[0][0].transcript
      if (!text.trim()) return
      recog.stop()
      setVs('processing')
      setStatus('Thinking…')
      setTx(text)

      const nextMsgs = [...msgsRef.current, { role: 'user', content: text }]
      setMsgs(nextMsgs)

      try {
        const res = await api.post('/api/voice/message', {
          messages:       nextMsgs,
          context_string: contextString || localCtxRef.current || '',
          tone_id:        toneIdRef.current,
        })
        const reply = (res.data.reply || '').trim()
        if (!reply) {
          setError('AI returned empty reply')
          setVs('idle')
          setStatus('Tap to speak')
          return
        }
        setReply(reply)
        setMsgs(m => [...m, { role: 'assistant', content: reply }])
        await playTTS(reply, voiceIdRef.current)
      } catch (err) {
        setError(err?.response?.data?.detail || 'AI call failed')
        setVs('idle')
        setStatus('Tap to speak')
      }
    }

    recog.onerror = (e) => {
      if (isSpeakingRef.current) return   // ignore errors while AI is talking
      if (e.error === 'no-speech' && contRef.current) {
        startListeningInner()
        return
      }
      if (e.error === 'not-allowed' || e.error === 'aborted') { if (contRef.current) setTimeout(() => startListeningInner(), 800); return } setError(e.error === 'no-speech' ? 'No speech detected' : `Error: ${e.error}`)
      setVs('idle')
      setStatus('Tap to speak')
    }

    recog.onend = () => {
      if (isSpeakingRef.current) return   // TTS is playing, onended will restart
      if (vsRef.current === 'listening') {
        if (contRef.current) startListeningInner()
        else { setVs('idle'); setStatus('Tap to speak') }
      }
    }

    try { recog.start() } catch {}
  }, [contextString, playTTS])

  const startListening = useCallback(async () => {
    if (vsRef.current !== 'idle') return
    setError('')
    contRef.current = continuous
    setStatus('Loading context…')
    await setupAudio()
    // If context isn't loaded yet, fetch it now and wait for it
    if (!contextString && !localCtxRef.current) {
      try {
        const r = await api.get('/api/floatchat/context')
        const ctx = r.data.context_string || ''
        setLocalCtx(ctx)
        localCtxRef.current = ctx
      } catch {}
    }
    startListeningInner()
  }, [setupAudio, startListeningInner, contextString])

  const stopAll = useCallback(() => {
    contRef.current = false
    isSpeakingRef.current = false
    try { recogRef.current?.abort() } catch {}
    try { recogRef.current?.stop() }  catch {}
    recogRef.current = null
    try { sourceRef.current?.stop() } catch {}
    try { micStreamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    micStreamRef.current = null
    micSourceRef.current = null
    analyserRef.current = null
    dataRef.current = null
    setMsgs([])
    setTx('')
    setReply('')
    setError('')
    setVs('idle')
    setStatus('Tap to start')
  }, [])

  const handleTap = () => {
    if (vs === 'idle') startListening()
    else if (vs !== 'processing') stopAll()
  }

  const selectTone = (t) => {
    setToneId(t.id)
    setVoiceId(t.voice)
    setShow(false)
    api.post('/api/voice/settings', { tone_id: t.id, voice_id: t.voice }).catch(() => {})
  }

  const currentTone = TONES.find(t => t.id === toneId) || TONES[0]
  const [cr, cg, cb] = STATE_COL[vs] || STATE_COL.idle
  const col = `rgb(${cr},${cg},${cb})`

  return (
    <div style={{ width: 300, background: 'var(--bg-card, #1a1a2e)', border: '1px solid var(--border, rgba(255,255,255,0.08))', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.65)', animation: 'floatIn 0.22s cubic-bezier(0.34,1.56,0.64,1)', fontFamily: 'Syne, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setShow(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: showTones ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showTones ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '4px 11px 4px 9px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.55)', transition: 'all 0.15s' }}>
          <span style={{ fontSize: 11, color: col }}>{currentTone.symbol}</span>
          {currentTone.label}
          <span style={{ fontSize: 9, opacity: 0.35, marginLeft: 2 }}>▾</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setCont(v => !v)}
            title={continuous ? 'Auto-listen on' : 'Auto-listen off'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: continuous ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${continuous ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '3px 8px', cursor: 'pointer', fontSize: 9, color: continuous ? '#34d399' : 'rgba(255,255,255,0.25)', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.04em', transition: 'all 0.15s' }}
          >
            <span style={{ fontSize: 7 }}>●</span>
            {continuous ? 'AUTO' : 'MANUAL'}
          </button>
          <WaveIcon color={col} size={14} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', fontSize: 14, padding: '2px 4px', lineHeight: 1 }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>✕</button>
        </div>
      </div>

      {/* Tone picker */}
      {showTones && (
        <div style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TONES.map(t => (
            <button key={t.id} onClick={() => selectTone(t)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', background: t.id === toneId ? 'rgba(99,102,241,0.1)' : 'none', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background = t.id === toneId ? 'rgba(99,102,241,0.1)' : 'none'}>
              <span style={{ fontSize: 12, color: t.id === toneId ? col : 'rgba(255,255,255,0.3)', width: 14, flexShrink: 0 }}>{t.symbol}</span>
              <span style={{ fontSize: 12, color: t.id === toneId ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)', fontFamily: 'Syne,sans-serif' }}>{t.label}</span>
              {t.id === 'unhinged' && <span style={{ fontSize: 9, background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 4, padding: '1px 5px', marginLeft: 'auto', flexShrink: 0 }}>18+</span>}
              {t.id === toneId && <span style={{ marginLeft: 'auto', fontSize: 10, color: col }}>✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
        <canvas ref={canvasRef} width={SZ} height={SZ} style={{ width: SZ, height: SZ, display: 'block' }} />
      </div>

      {/* Transcript + reply */}
      {(transcript || lastReply) && (
        <div style={{ margin: '0 14px 10px', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {transcript && <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: 'rgba(255,255,255,0.3)' }}>You: {transcript}</div>}
          {lastReply && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{lastReply.length > 130 ? lastReply.slice(0, 130) + '…' : lastReply}</div>}
        </div>
      )}

      {error && <div style={{ margin: '0 14px 8px', fontSize: 11, color: '#f87171', fontFamily: "'IBM Plex Mono',monospace", textAlign: 'center', lineHeight: 1.4 }}>{error}</div>}

      {/* Controls */}
      <div style={{ padding: '2px 14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: col, letterSpacing: '0.07em', opacity: 0.85 }}>{statusMsg}</div>
        <button onClick={handleTap} disabled={vs === 'processing'} style={{ width: 56, height: 56, borderRadius: '50%', background: `radial-gradient(circle, rgba(${cr},${cg},${cb},0.18), rgba(${cr},${cg},${cb},0.06))`, border: `1.5px solid rgba(${cr},${cg},${cb},0.45)`, cursor: vs === 'processing' ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', boxShadow: (vs === 'listening' || vs === 'speaking') ? `0 0 22px rgba(${cr},${cg},${cb},0.38)` : 'none' }}>
          {vs === 'listening'  && <StopIcon    color={col} />}
          {vs === 'processing' && <SpinnerIcon color={col} />}
          {vs === 'speaking'   && <StopIcon    color={col} />}
          {vs === 'idle'       && <MicIcon     color={`rgba(${cr},${cg},${cb},0.65)`} size={20} />}
        </button>
        {messages.length > 0 && vs === 'idle' && (
          <button onClick={() => { setMsgs([]); setTx(''); setReply(''); setError('') }} style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: 'rgba(255,255,255,0.18)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px' }} onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.18)'}>
            clear conversation
          </button>
        )}
      </div>
    </div>
  )
}
