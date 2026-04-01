import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

// ── Helpers ────────────────────────────────────────────────────────────────────

function wordCount(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

function charCount(text) {
  return text.length
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Animated grain overlay ──────────────────────────────────────────────────────
const GrainStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Mono:wght@300;400;500&family=Playfair+Display:ital,wght@1,400;1,700&display=swap');

    .jw-root {
      --ink: #0a0a0f;
      --parchment: #f7f3ec;
      --gold: #c8a96e;
      --gold-dim: #8a6e3c;
      --rust: #9b4d2e;
      --sage: #4a6741;
      --umber: #3d2b1f;
      --cream: #faf7f2;
      --shadow-heavy: rgba(0,0,0,0.6);
      font-family: 'Cormorant Garamond', Georgia, serif;
    }

    .jw-root * { box-sizing: border-box; }

    .jw-bg {
      position: fixed; inset: 0; z-index: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% 10%, rgba(139,99,50,0.18) 0%, transparent 60%),
        radial-gradient(ellipse 60% 80% at 85% 90%, rgba(74,103,65,0.12) 0%, transparent 60%),
        radial-gradient(ellipse 100% 100% at 50% 50%, #0d0b08 0%, #07070e 100%);
    }

    .jw-grain {
      position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.045;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
      background-size: 180px 180px;
    }

    .jw-frame {
      position: relative; z-index: 2;
      min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column;
      align-items: center; padding: 0 16px 80px;
    }

    /* Header */
    .jw-header {
      width: 100%; max-width: 820px;
      display: flex; align-items: center; justify-content: space-between;
      padding: 28px 0 0;
    }

    .jw-back {
      display: flex; align-items: center; gap: 8px;
      font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.12em;
      color: rgba(200,169,110,0.55); text-transform: uppercase; cursor: pointer;
      border: none; background: none; padding: 6px 0; transition: color 0.2s;
    }
    .jw-back:hover { color: var(--gold); }

    .jw-mode-pills {
      display: flex; background: rgba(255,255,255,0.04);
      border: 1px solid rgba(200,169,110,0.15); border-radius: 100px; padding: 3px; gap: 2px;
    }

    .jw-pill {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em;
      text-transform: uppercase; padding: 5px 16px; border-radius: 100px;
      cursor: pointer; border: none; background: none;
      color: rgba(200,169,110,0.45); transition: all 0.2s;
    }
    .jw-pill.active {
      background: rgba(200,169,110,0.14);
      color: var(--gold);
      box-shadow: 0 0 0 1px rgba(200,169,110,0.3);
    }

    /* Title section */
    .jw-title-block {
      width: 100%; max-width: 820px; margin-top: 52px;
      border-bottom: 1px solid rgba(200,169,110,0.12); padding-bottom: 28px;
    }

    .jw-eyebrow {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
      color: rgba(200,169,110,0.4); text-transform: uppercase; margin-bottom: 14px;
    }

    .jw-main-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: clamp(36px, 6vw, 64px); font-weight: 400; font-style: italic;
      color: #f0e8d8; line-height: 1.1; margin: 0 0 18px;
      letter-spacing: -0.01em;
    }

    .jw-date-row {
      display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
    }

    .jw-date-display {
      font-family: 'Cormorant Garamond', serif; font-size: 14px; font-style: italic;
      color: rgba(200,169,110,0.6); letter-spacing: 0.04em;
    }

    .jw-date-input {
      font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em;
      background: rgba(200,169,110,0.07); border: 1px solid rgba(200,169,110,0.2);
      color: var(--gold); border-radius: 6px; padding: 5px 10px;
      outline: none; cursor: pointer; transition: border-color 0.2s;
    }
    .jw-date-input:hover, .jw-date-input:focus { border-color: rgba(200,169,110,0.5); }

    /* Workspace */
    .jw-workspace {
      width: 100%; max-width: 820px; margin-top: 36px;
      display: flex; flex-direction: column; flex: 1;
    }

    /* Editor */
    .jw-editor-wrap {
      position: relative;
      background: rgba(250,247,242,0.03);
      border: 1px solid rgba(200,169,110,0.1);
      border-radius: 16px; overflow: hidden;
      transition: border-color 0.3s, box-shadow 0.3s;
    }
    .jw-editor-wrap.focused {
      border-color: rgba(200,169,110,0.25);
      box-shadow: 0 0 0 1px rgba(200,169,110,0.08), 0 24px 64px rgba(0,0,0,0.4);
    }

    .jw-editor-inner {
      position: relative; padding: 40px 48px 32px;
    }

    .jw-rule-lines {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
      opacity: 0.025;
    }

    .jw-textarea {
      width: 100%; min-height: 480px;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 20px; font-weight: 400; line-height: 1.85;
      color: #e8dfd0; background: transparent; border: none; outline: none;
      resize: none; letter-spacing: 0.01em;
      caret-color: var(--gold);
    }

    .jw-placeholder-text {
      position: absolute; top: 40px; left: 48px; right: 48px;
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 20px; font-style: italic; font-weight: 300; line-height: 1.85;
      color: rgba(200,169,110,0.22); pointer-events: none;
    }

    .jw-editor-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 48px 20px;
      border-top: 1px solid rgba(200,169,110,0.07);
    }

    .jw-stats {
      display: flex; gap: 24px;
    }
    .jw-stat {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(200,169,110,0.35);
    }
    .jw-stat span { color: rgba(200,169,110,0.65); margin-left: 6px; }

    /* Save button */
    .jw-save-btn {
      display: flex; align-items: center; gap: 10px;
      font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.14em;
      text-transform: uppercase; padding: 11px 28px;
      background: linear-gradient(135deg, rgba(200,169,110,0.18) 0%, rgba(200,169,110,0.1) 100%);
      border: 1px solid rgba(200,169,110,0.35); border-radius: 100px;
      color: var(--gold); cursor: pointer;
      transition: all 0.25s; position: relative; overflow: hidden;
    }
    .jw-save-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, rgba(200,169,110,0.28) 0%, rgba(200,169,110,0.18) 100%);
      border-color: rgba(200,169,110,0.6);
      box-shadow: 0 0 24px rgba(200,169,110,0.15), 0 0 0 1px rgba(200,169,110,0.2);
      transform: translateY(-1px);
    }
    .jw-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .jw-save-btn.saving { animation: pulse-gold 1.2s ease-in-out infinite; }

    @keyframes pulse-gold {
      0%, 100% { box-shadow: 0 0 0 0 rgba(200,169,110,0.4); }
      50% { box-shadow: 0 0 0 8px rgba(200,169,110,0); }
    }

    /* Status messages */
    .jw-status {
      margin-top: 20px; padding: 16px 24px;
      border-radius: 10px; font-family: 'DM Mono', monospace;
      font-size: 11px; letter-spacing: 0.1em;
      display: flex; align-items: center; gap: 12px;
      animation: fadeIn 0.3s ease;
    }
    .jw-status.success {
      background: rgba(74,103,65,0.15); border: 1px solid rgba(74,103,65,0.3);
      color: #7aad6b;
    }
    .jw-status.error {
      background: rgba(155,77,46,0.15); border: 1px solid rgba(155,77,46,0.3);
      color: #d4724a;
    }
    .jw-status.partial {
      background: rgba(200,169,110,0.1); border: 1px solid rgba(200,169,110,0.25);
      color: rgba(200,169,110,0.8);
    }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    /* Success overlay */
    .jw-success-card {
      text-align: center; padding: 60px 40px;
      background: rgba(250,247,242,0.02);
      border: 1px solid rgba(200,169,110,0.15); border-radius: 20px;
      animation: fadeIn 0.5s ease;
    }
    .jw-success-glyph {
      font-size: 48px; margin-bottom: 20px; display: block;
      animation: glyph-in 0.6s cubic-bezier(0.34,1.56,0.64,1);
    }
    @keyframes glyph-in { from { transform: scale(0.5) rotate(-15deg); opacity: 0; } to { transform: none; opacity: 1; } }

    .jw-success-title {
      font-family: 'Playfair Display', serif; font-style: italic;
      font-size: 32px; color: #f0e8d8; margin: 0 0 10px;
    }
    .jw-success-sub {
      font-family: 'Cormorant Garamond', serif; font-size: 16px; font-style: italic;
      color: rgba(200,169,110,0.6); margin: 0 0 32px;
    }
    .jw-success-meta {
      display: flex; gap: 32px; justify-content: center; margin-bottom: 36px;
    }
    .jw-success-chip {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em;
      text-transform: uppercase; color: rgba(200,169,110,0.5);
    }
    .jw-success-chip strong { display: block; font-size: 18px; color: var(--gold); margin-bottom: 4px; font-family: 'Cormorant Garamond', serif; font-weight: 500; }

    .jw-action-row { display: flex; gap: 12px; justify-content: center; }

    .jw-btn-ghost {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em;
      text-transform: uppercase; padding: 9px 22px; border-radius: 100px;
      background: none; border: 1px solid rgba(200,169,110,0.2);
      color: rgba(200,169,110,0.55); cursor: pointer; transition: all 0.2s;
    }
    .jw-btn-ghost:hover { border-color: rgba(200,169,110,0.4); color: var(--gold); }

    .jw-btn-solid {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.14em;
      text-transform: uppercase; padding: 9px 22px; border-radius: 100px;
      background: rgba(200,169,110,0.16); border: 1px solid rgba(200,169,110,0.35);
      color: var(--gold); cursor: pointer; transition: all 0.2s;
    }
    .jw-btn-solid:hover { background: rgba(200,169,110,0.26); }

    /* ── Drop / Upload Mode ── */
    .jw-upload-zone {
      margin-top: 8px; border-radius: 16px;
      border: 2px dashed rgba(200,169,110,0.2);
      transition: all 0.3s; cursor: pointer;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 280px; padding: 48px 32px;
      text-align: center; background: rgba(200,169,110,0.02);
    }
    .jw-upload-zone.drag-over {
      border-color: rgba(200,169,110,0.55);
      background: rgba(200,169,110,0.06);
      box-shadow: 0 0 40px rgba(200,169,110,0.1);
    }
    .jw-upload-glyph {
      font-size: 40px; margin-bottom: 20px; opacity: 0.5;
      transition: transform 0.3s, opacity 0.3s;
    }
    .jw-upload-zone:hover .jw-upload-glyph,
    .jw-upload-zone.drag-over .jw-upload-glyph { transform: translateY(-4px); opacity: 0.8; }

    .jw-upload-headline {
      font-family: 'Playfair Display', serif; font-style: italic;
      font-size: 22px; color: rgba(240,232,216,0.7); margin: 0 0 8px;
    }
    .jw-upload-sub {
      font-family: 'Cormorant Garamond', serif; font-size: 15px;
      color: rgba(200,169,110,0.4); font-style: italic; margin: 0 0 28px;
    }
    .jw-upload-formats {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(200,169,110,0.3);
    }

    .jw-file-list {
      margin-top: 24px; width: 100%;
    }
    .jw-file-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-radius: 8px;
      background: rgba(200,169,110,0.06); border: 1px solid rgba(200,169,110,0.12);
      margin-bottom: 8px; animation: fadeIn 0.2s ease;
    }
    .jw-file-name {
      font-family: 'DM Mono', monospace; font-size: 11px;
      color: rgba(200,169,110,0.7); letter-spacing: 0.06em;
    }
    .jw-file-status {
      font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .jw-file-status.pending { color: rgba(200,169,110,0.4); }
    .jw-file-status.uploading { color: rgba(200,169,110,0.8); animation: blink 1s ease infinite; }
    .jw-file-status.done { color: #7aad6b; }
    .jw-file-status.error { color: #d4724a; }
    .jw-file-status.skipped { color: rgba(200,169,110,0.5); }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }

    .jw-upload-actions {
      margin-top: 28px; display: flex; gap: 12px; justify-content: flex-end;
    }

    /* Ornament divider */
    .jw-ornament {
      text-align: center; margin: 48px 0 0;
      font-family: 'Cormorant Garamond', serif; font-size: 18px;
      color: rgba(200,169,110,0.15); letter-spacing: 0.4em;
    }

    .jw-img-strip { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .jw-img-thumb {
      position: relative; width: 80px; height: 80px;
      border-radius: 8px; overflow: hidden;
      border: 1px solid rgba(200,169,110,0.2);
      background: rgba(200,169,110,0.04); flex-shrink: 0;
    }
    .jw-img-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .jw-img-remove {
      position: absolute; top: 4px; right: 4px;
      width: 18px; height: 18px; border-radius: 50%;
      background: rgba(0,0,0,0.65); border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      color: rgba(200,169,110,0.9); font-size: 10px; line-height: 1;
    }
    .jw-img-remove:hover { background: rgba(155,77,46,0.8); }
    .jw-img-add-btn {
      width: 80px; height: 80px; border-radius: 8px;
      border: 1.5px dashed rgba(200,169,110,0.25);
      background: rgba(200,169,110,0.03);
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 4px; cursor: pointer;
      color: rgba(200,169,110,0.4); font-size: 20px; flex-shrink: 0;
    }
    .jw-img-add-btn:hover { border-color: rgba(200,169,110,0.5); color: rgba(200,169,110,0.75); }
    .jw-img-add-label { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; }

    @media (max-width: 640px) {
      /* Editor layout */
      .jw-editor-inner { padding: 20px 16px 12px; }
      .jw-editor-footer {
        padding: 10px 16px 14px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .jw-placeholder-text { left: 16px; right: 16px; top: 20px; font-size: 18px; }
      .jw-textarea { font-size: 18px; min-height: 300px; }
      .jw-main-title { font-size: 30px; }

      /* Prevent iOS zoom on all inputs — must be >= 16px */
      .jw-date-input { font-size: 16px !important; padding: 8px 12px; }
      .jw-textarea { font-size: 16px !important; }

      /* Title block top margin reduced */
      .jw-title-block { margin-top: 28px; }

      /* Header */
      .jw-header { padding: 16px 0 0; }

      /* Workspace */
      .jw-workspace { margin-top: 20px; }

      /* Frame padding — bottom safe area */
      .jw-frame {
        padding-bottom: calc(80px + env(safe-area-inset-bottom));
        padding-left: 14px;
        padding-right: 14px;
      }

      /* Photo strip larger thumbs on mobile */
      .jw-img-thumb { width: 72px; height: 72px; }
      .jw-img-add-btn { width: 72px; height: 72px; }

      /* Bigger touch targets */
      .jw-save-btn { padding: 13px 24px; min-height: 44px; }

      /* Upload zone */
      .jw-upload-zone { min-height: 200px; padding: 32px 20px; }

      /* Stats wrap on mobile */
      .jw-stats { flex-wrap: wrap; gap: 12px; }
    }
  `}</style>
)

// ── Rule lines background decoration ───────────────────────────────────────────
function RuleLines() {
  const lines = Array.from({ length: 30 })
  return (
    <div className="jw-rule-lines" aria-hidden>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {lines.map((_, i) => (
          <line key={i} x1="0" y1={i * 36 + 18} x2="100%" y2={i * 36 + 18}
            stroke="rgba(200,169,110,1)" strokeWidth="1" />
        ))}
      </svg>
    </div>
  )
}

// ── Mode: Write ─────────────────────────────────────────────────────────────────
function WriteMode({ entryDate, initialText }) {
  const navigate = useNavigate()
  const textareaRef = useRef(null)
  const [text, setText] = useState(initialText || '')
  const [focused, setFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState(null)  // {type, message}
  const [result, setResult] = useState(null)  // saved entry result
  const [journalPrompt, setJournalPrompt] = useState(null)
  const [promptDismissed, setPromptDismissed] = useState(false)
  const [pendingImages, setPendingImages]     = useState([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const imgInputRef = useRef(null)

  const wc = wordCount(text)
  const cc = charCount(text)

  useEffect(() => {
    let cancelled = false
    api.get('/api/journal/prompt')
      .then(r => { if (!cancelled) setJournalPrompt(r.data.prompt || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    setStatus(null)
    try {
      const res = await api.post('/api/journal/write', {
        text: text.trim(),
        entry_date: entryDate,
      })
      const data = res.data
      if (data.status === 'success' || data.status === 'inserted' || data.status === 'partial') {
        if (data.status === 'partial') {
          setStatus({ type: 'partial', message: data.message || 'Saved — AI extraction pending.' })
        }
        setResult(data)
        if (pendingImages.length > 0 && (data.entry_id || data.id)) {
          setUploadingImages(true)
          try {
            for (const img of pendingImages) {
              const fd = new FormData()
              fd.append('file', img.file, img.name)
              await api.post(`/api/entries/${data.entry_id || data.id}/attachments`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
              })
            }
          } catch (imgErr) {
            console.warn('Image upload failed', imgErr)
          } finally {
            setUploadingImages(false)
            setPendingImages([])
          }
        }
      } else if (data.status === 'skipped') {
        setStatus({ type: 'error', message: 'An identical entry for this date already exists.' })
      } else {
        setStatus({ type: 'error', message: data.message || 'Something went wrong.' })
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.message || 'Network error'
      setStatus({ type: 'error', message: detail })
    } finally {
      setSaving(false)
    }
  }

  if (result && (result.status === 'success' || result.status === 'inserted' || result.status === 'partial')) {
    return (
      <div className="jw-success-card">
        <span className="jw-success-glyph">✦</span>
        <h2 className="jw-success-title">Entry recorded</h2>
        <p className="jw-success-sub">{formatDate(result.entry_date || entryDate)}</p>
        <div className="jw-success-meta">
          <div className="jw-success-chip">
            <strong>{result.word_count || wc}</strong>
            words
          </div>
          {result.mood_label && (
            <div className="jw-success-chip">
              <strong>{result.mood_label}</strong>
              mood
            </div>
          )}
          {result.severity != null && (
            <div className="jw-success-chip">
              <strong>{result.severity}/10</strong>
              severity
            </div>
          )}
        </div>
        {result.status === 'partial' && (
          <p style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(200,169,110,0.5)', marginBottom: 24, textTransform: 'uppercase' }}>
            AI extraction queued — summary will appear shortly
          </p>
        )}
        <div className="jw-action-row">
          <button className="jw-btn-ghost" onClick={() => { setResult(null); setText(''); setStatus(null) }}>
            Write another
          </button>
          <button className="jw-btn-solid" onClick={() => navigate('/')}>
            View Timeline →
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {journalPrompt && !promptDismissed && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          background: 'rgba(200,169,110,0.06)',
          border: '1px solid rgba(200,169,110,0.18)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 14, lineHeight: 1, marginTop: 2, flexShrink: 0, color: 'rgba(200,169,110,0.6)' }}>✦</span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: 'rgba(200,169,110,0.7)', lineHeight: 1.6, flex: 1, letterSpacing: '0.02em' }}>
            {journalPrompt}
          </span>
          <button
            onClick={() => setPromptDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(200,169,110,0.35)', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
            title='Dismiss'
          >×</button>
        </div>
      )}
      <div className={`jw-editor-wrap ${focused ? 'focused' : ''}`}>
        <div className="jw-editor-inner">
          <RuleLines />
          {!text && (
            <div className="jw-placeholder-text">
              Begin writing. Let it out. No rules, no structure — just your words…
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="jw-textarea"
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault()
                handleSave()
              }
            }}
            spellCheck
          />
        </div>
        <div className="jw-editor-footer">
          <div className="jw-stats">
            <div className="jw-stat">Words <span>{wc}</span></div>
            <div className="jw-stat">Chars <span>{cc}</span></div>
            {pendingImages.length > 0 && (
              <div className="jw-stat" style={{ color: 'rgba(200,169,110,0.55)' }}>
                📷 <span>{pendingImages.length}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => imgInputRef.current && imgInputRef.current.click()}
              title="Attach images (JPEG, PNG, WEBP, max 8 MB)"
              style={{
                background: 'none', border: '1px solid rgba(200,169,110,0.18)',
                borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
                color: 'rgba(200,169,110,0.45)', fontSize: 16, lineHeight: 1,
                minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >📷</button>
            <button
              className={`jw-save-btn ${saving ? 'saving' : ''}`}
              onClick={handleSave}
              disabled={!text.trim() || saving}
            >
              {saving ? (
                <>
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid rgba(200,169,110,0.3)', borderTopColor: 'var(--gold)', animation: 'spin 0.8s linear infinite' }} />
                  Processing…
                </>
              ) : (
                <>✦ Save Entry</>
              )}
            </button>
          </div>
        </div>
      </div>

      {pendingImages.length > 0 && (
        <div className="jw-img-strip">
          {pendingImages.map((img, i) => (
            <div className="jw-img-thumb" key={img.name + i}>
              <img src={img.objectUrl} alt={img.name} />
              <button
                className="jw-img-remove"
                onClick={() => {
                  URL.revokeObjectURL(img.objectUrl)
                  setPendingImages(prev => prev.filter((_, idx) => idx !== i))
                }}
              >×</button>
            </div>
          ))}
          <button
            className="jw-img-add-btn"
            onClick={() => imgInputRef.current && imgInputRef.current.click()}
          >
            <span>+</span>
            <span className="jw-img-add-label">Add</span>
          </button>
        </div>
      )}
      <input
        ref={imgInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files || [])
          const items = files.map(f => ({ file: f, name: f.name, objectUrl: URL.createObjectURL(f) }))
          setPendingImages(prev => [...prev, ...items])
          e.target.value = ''
        }}
      />

      {status && (
        <div className={`jw-status ${status.type}`}>
          <span>{status.type === 'success' ? '✓' : status.type === 'partial' ? '◌' : '✕'}</span>
          {status.message}
        </div>
      )}

      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.2)', marginTop: 14, textAlign: 'right' }}>
        ⌘S to save
      </div>
    </>
  )
}

// ── Mode: Upload ────────────────────────────────────────────────────────────────
function UploadMode() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([])  // [{name, file, status, result}]
  const [uploading, setUploading] = useState(false)
  const [allDone, setAllDone] = useState(false)

  const addFiles = useCallback((newFiles) => {
    const items = Array.from(newFiles)
      .filter(f => f.name.endsWith('.txt') || f.name.endsWith('.html') || f.name.endsWith('.htm'))
      .map(f => ({ name: f.name, file: f, status: 'pending', result: null }))
    setFiles(prev => {
      const existing = new Set(prev.map(p => p.name))
      return [...prev, ...items.filter(i => !existing.has(i.name))]
    })
    setAllDone(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])

  const removeFile = (name) => {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  async function uploadAll() {
    if (uploading) return
    setUploading(true)

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue

      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'uploading' } : f))

      try {
        const bytes = await files[i].file.arrayBuffer()
        const blob = new Blob([bytes])
        const formData = new FormData()
        formData.append('file', blob, files[i].name)

        // Use the web-upload endpoint that accepts JWT
        const res = await api.post('/api/journal/upload-file', formData, {
          headers: { 'Content-Type': 'multipart/form-data', 'X-Filename': files[i].name },
        })
        const data = res.data
        const st = data.status === 'success' || data.status === 'inserted' ? 'done'
          : data.status === 'skipped' ? 'skipped'
          : data.status === 'partial' ? 'done'
          : 'error'

        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: st, result: data } : f))
      } catch (err) {
        const msg = err.response?.data?.detail || 'Upload failed'
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', result: { message: msg } } : f))
      }

      // Slight delay between files so AI pipeline doesn't get hammered
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 800))
    }

    setUploading(false)
    setAllDone(true)
  }

  const doneCount = files.filter(f => f.status === 'done').length
  const pendingCount = files.filter(f => f.status === 'pending').length

  return (
    <>
      <div
        className={`jw-upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.html,.htm"
          multiple
          style={{ display: 'none' }}
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
        <div className="jw-upload-glyph">⊞</div>
        <h3 className="jw-upload-headline">Drop your journal exports here</h3>
        <p className="jw-upload-sub">or click anywhere in this area to browse</p>
        <p className="jw-upload-formats">Accepts .txt · .html · .htm — multiple files at once</p>
      </div>

      {files.length > 0 && (
        <div className="jw-file-list">
          {files.map(f => (
            <div className="jw-file-item" key={f.name}>
              <span className="jw-file-name">{f.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {f.result?.mood_label && (
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.5)' }}>
                    {f.result.mood_label}
                  </span>
                )}
                <span className={`jw-file-status ${f.status}`}>
                  {f.status === 'pending' && '○ Queued'}
                  {f.status === 'uploading' && '◌ Processing'}
                  {f.status === 'done' && '✓ Saved'}
                  {f.status === 'skipped' && '— Duplicate'}
                  {f.status === 'error' && '✕ Failed'}
                </span>
                {f.status === 'pending' && (
                  <span
                    onClick={e => { e.stopPropagation(); removeFile(f.name) }}
                    style={{ cursor: 'pointer', color: 'rgba(200,169,110,0.3)', fontSize: 12 }}
                  >✕</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="jw-upload-actions">
          {allDone && doneCount > 0 && (
            <button className="jw-btn-ghost" onClick={() => navigate('/')}>
              View Timeline →
            </button>
          )}
          {pendingCount > 0 && (
            <button className="jw-btn-solid" onClick={uploadAll} disabled={uploading}>
              {uploading ? `Processing ${files.find(f=>f.status==='uploading')?.name || '…'}` : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────────
export default function JournalWrite() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('write')  // 'write' | 'upload'
  const [entryDate, setEntryDate] = useState(today())
  // War Room: pre-fill textarea with item.why if navigated here from War Room
  const warRoomInitialText = window.history.state?.usr?.warRoomItem?.why || ''

  return (
    <div className="jw-root">
      <GrainStyle />
      <div className="jw-bg" />
      <div className="jw-grain" />

      <div className="jw-frame">
        {/* Header */}
        <header className="jw-header">
          <button className="jw-back" onClick={() => navigate('/')}>
            ← Timeline
          </button>
          <div className="jw-mode-pills">
            <button className={`jw-pill ${mode === 'write' ? 'active' : ''}`} onClick={() => setMode('write')}>
              ✦ Write
            </button>
            <button className={`jw-pill ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>
              ⊞ Import
            </button>
          </div>
        </header>

        {/* Title block */}
        <div className="jw-title-block">
          <div className="jw-eyebrow">
            {mode === 'write' ? 'Journal Workspace' : 'Entry Import'}
          </div>
          <h1 className="jw-main-title">
            {mode === 'write' ? 'Write freely.' : 'Bring your words home.'}
          </h1>
          <div className="jw-date-row">
            {mode === 'write' ? (
              <>
                <span className="jw-date-display">{formatDate(entryDate)}</span>
                <input
                  type="date"
                  className="jw-date-input"
                  value={entryDate}
                  max={today()}
                  onChange={e => setEntryDate(e.target.value)}
                />
              </>
            ) : (
              <span className="jw-date-display">
                Dates are read from each file's name or content — no need to set them manually.
              </span>
            )}
          </div>
        </div>

        {/* Workspace */}
        <div className="jw-workspace">
          {mode === 'write' ? (
            <WriteMode entryDate={entryDate} initialText={warRoomInitialText} />
          ) : (
            <UploadMode />
          )}
        </div>

        <div className="jw-ornament">· · · ✦ · · ·</div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
