/**
 * ProofVault.jsx — pages/ProofVault.jsx
 * Folder-organized evidence of your contributions.
 * Create folders (Medical, School, Daily Care, etc.), add dated items
 * with notes and photos, then generate AI summaries per folder or overall.
 */

import { useState, useEffect, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import api from '../services/api'

// ── Constants ──────────────────────────────────────────────────────────────────

const FOLDER_ICONS  = ['📁','🏥','🏫','🍽','💊','📚','🎨','⚽','🚗','💰','📞','📧','🎵','🛁','🌙','❤️','🧸','📸','🎒','🧾']
const FOLDER_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899']

const SUGGESTED_FOLDERS = [
  { name: 'Medical & Health',   icon: '🏥', color: '#ef4444' },
  { name: 'School & Education', icon: '🏫', color: '#6366f1' },
  { name: 'Daily Care',         icon: '🧸', color: '#10b981' },
  { name: 'Financial Support',  icon: '💰', color: '#f59e0b' },
  { name: 'Activities',         icon: '⚽', color: '#8b5cf6' },
  { name: 'Communications',     icon: '📞', color: '#06b6d4' },
]

const QUICK_ENTRIES = [
  { label: 'Morning meds',    icon: '💊', title: 'Gave Wyatt his morning medication (mixed in yogurt)',            folder_hint: 'Daily Care'         },
  { label: 'Pull-up change',  icon: '🔄', title: 'Changed Wyatt\'s pull-up',                                       folder_hint: 'Daily Care'         },
  { label: 'Got him ready',   icon: '🎒', title: 'Got Wyatt dressed and ready for the day',                        folder_hint: 'Daily Care'         },
  { label: 'Put on bus',      icon: '🚌', title: 'Put Wyatt on school bus',                                        folder_hint: 'School & Education' },
  { label: 'Got off bus',     icon: '🏠', title: 'Got Wyatt off bus and gave him after-school snacks',             folder_hint: 'Daily Care'         },
  { label: 'Fed Wyatt',       icon: '🍽️', title: 'Fed Wyatt dinner',                                              folder_hint: 'Daily Care'         },
  { label: 'Bath time',       icon: '🛁', title: 'Gave Wyatt his bath',                                            folder_hint: 'Daily Care'         },
  { label: 'Brushed teeth',   icon: '🦷', title: "Brushed Wyatt's teeth",                                         folder_hint: 'Daily Care'         },
  { label: 'Bedtime routine', icon: '🌙', title: 'Put Wyatt to bed with stuffed animals and made sure he had enough water in his sippy cup', folder_hint: 'Daily Care' },
  { label: 'Nighttime meds', icon: '💊', title: 'Gave Wyatt his nighttime medication',                                                       folder_hint: 'Daily Care' },
  { label: 'Evening walk',    icon: '🐕', title: 'Took Wyatt and Dasher on evening walk',                          folder_hint: 'Activities'         },
  { label: 'Park trip',       icon: '🌳', title: 'Took Wyatt to the park',                                         folder_hint: 'Activities'         },
  { label: 'Store outing',    icon: '🛒', title: 'Took Wyatt on store/errand outing',                              folder_hint: 'Activities'         },
]

// ── Shared styles ──────────────────────────────────────────────────────────────

const mono  = { fontFamily: 'IBM Plex Mono' }
const syne  = { fontFamily: 'Syne' }

const card = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border)',
  borderRadius: 12,
}

const btn = (variant = 'default', disabled = false) => ({
  padding: '7px 14px',
  background: disabled ? 'rgba(255,255,255,0.03)'
    : variant === 'primary' ? 'rgba(99,102,241,0.2)'
    : variant === 'danger'  ? 'rgba(239,68,68,0.15)'
    : variant === 'success' ? 'rgba(16,185,129,0.15)'
    : 'rgba(255,255,255,0.06)',
  border: `1px solid ${
      disabled            ? 'rgba(255,255,255,0.06)'
    : variant === 'primary' ? 'rgba(99,102,241,0.45)'
    : variant === 'danger'  ? 'rgba(239,68,68,0.35)'
    : variant === 'success' ? 'rgba(16,185,129,0.35)'
    : 'rgba(255,255,255,0.1)'}`,
  borderRadius: 7,
  color: disabled            ? 'rgba(255,255,255,0.25)'
    : variant === 'primary' ? '#a5b4fc'
    : variant === 'danger'  ? '#f87171'
    : variant === 'success' ? '#6ee7b7'
    : 'rgba(255,255,255,0.7)',
  fontSize: 11, fontFamily: 'IBM Plex Mono',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s', whiteSpace: 'nowrap',
  opacity: disabled ? 0.6 : 1,
})

const fieldSty = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)',
  padding: '9px 12px', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
}

const lbl = {
  fontSize: 10, ...mono, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-muted)',
  marginBottom: 5, display: 'block',
}

// ── Modal helper ───────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, maxWidth = 480 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...card, width: '100%', maxWidth, padding: 26, display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 30px 90px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ ...syne, fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── New Folder Modal ───────────────────────────────────────────────────────────

function NewFolderModal({ onSave, onClose }) {
  const [form, setForm]   = useState({ name: '', icon: '📁', color: '#6366f1', description: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal title="New Folder" onClose={onClose} maxWidth={500}>
      {/* Suggested folders */}
      <div>
        <label style={lbl}>Quick start</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SUGGESTED_FOLDERS.map(s => (
            <button key={s.name} onClick={() => setForm(f => ({ ...f, name: s.name, icon: s.icon, color: s.color }))}
              style={{ ...btn(), padding: '5px 12px', fontSize: 12 }}>
              {s.icon} {s.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={lbl}>Folder name</label>
        <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. Medical & Health" style={fieldSty} />
      </div>

      <div>
        <label style={lbl}>Icon</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FOLDER_ICONS.map(ic => (
            <button key={ic} onClick={() => setForm(f => ({ ...f, icon: ic }))}
              style={{ ...btn(), padding: '4px 8px', fontSize: 16, background: form.icon === ic ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)', borderColor: form.icon === ic ? 'rgba(99,102,241,0.5)' : 'var(--border)' }}>
              {ic}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={lbl}>Color</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FOLDER_COLORS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${form.color === c ? '#fff' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }} />
          ))}
        </div>
      </div>

      <div>
        <label style={lbl}>Description (optional)</label>
        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="What goes in this folder?" style={fieldSty} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn()}>Cancel</button>
        <button onClick={submit} disabled={saving || !form.name.trim()} style={btn('primary', saving || !form.name.trim())}>
          {saving ? 'Creating…' : 'Create Folder'}
        </button>
      </div>
    </Modal>
  )
}

// ── New Item Modal ─────────────────────────────────────────────────────────────

function NewItemModal({ onSave, onClose }) {
  const [form, setForm]     = useState({ title: '', notes: '', item_date: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal title="Add Entry" onClose={onClose}>
      <div>
        <label style={lbl}>What did you do?</label>
        <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. Took to pediatrician, Picked up from school, Made dinner"
          style={fieldSty} />
      </div>
      <div>
        <label style={lbl}>Date</label>
        <input type="date" value={form.item_date} onChange={e => setForm(f => ({ ...f, item_date: e.target.value }))} style={{ ...fieldSty, maxWidth: 200 }} />
      </div>
      <div>
        <label style={lbl}>Notes (optional)</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3} style={{ ...fieldSty, resize: 'vertical', lineHeight: 1.6 }}
          placeholder="Any details worth documenting…" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn()}>Cancel</button>
        <button onClick={submit} disabled={saving || !form.title.trim()} style={btn('primary', saving || !form.title.trim())}>
          {saving ? 'Adding…' : 'Add Entry'}
        </button>
      </div>
    </Modal>
  )
}

// ── Quick Entry Modal ──────────────────────────────────────────────────────────

function QuickEntryModal({ preset, folders, onSave, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const guessFolder = folders.find(f => f.name === preset.folder_hint) || folders[0] || null
  const [folderId,  setFolderId]  = useState(guessFolder?.id ?? '')
  const [title,     setTitle]     = useState(preset.title)
  const [notes,     setNotes]     = useState('')
  const [itemDate,  setItemDate]  = useState(today)
  const [saving,    setSaving]    = useState(false)

  const submit = async () => {
    if (!title.trim() || !folderId) return
    setSaving(true)
    await onSave(Number(folderId), { title: title.trim(), notes: notes || null, item_date: itemDate })
    setSaving(false)
  }

  return (
    <Modal title={`${preset.icon} Quick Log`} onClose={onClose}>
      <div>
        <label style={lbl}>Folder</label>
        <select value={folderId} onChange={e => setFolderId(e.target.value)}
          style={{ ...fieldSty, cursor: 'pointer' }}>
          {folders.length === 0 && <option value="">No folders yet — create one first</option>}
          {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
      </div>
      <div>
        <label style={lbl}>Entry title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={fieldSty} />
      </div>
      <div>
        <label style={lbl}>Date</label>
        <input type="date" value={itemDate} onChange={e => setItemDate(e.target.value)}
          style={{ ...fieldSty, maxWidth: 200 }} />
      </div>
      <div>
        <label style={lbl}>Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={2} placeholder="Any extra detail…"
          style={{ ...fieldSty, resize: 'vertical', lineHeight: 1.6 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn()}>Cancel</button>
        <button onClick={submit} disabled={saving || !title.trim() || !folderId}
          style={btn('primary', saving || !title.trim() || !folderId)}>
          {saving ? 'Logging…' : 'Log It'}
        </button>
      </div>
    </Modal>
  )
}

// ── Edit Item Modal ────────────────────────────────────────────────────────────

function EditItemModal({ item, onSave, onClose }) {
  const [form, setForm]     = useState({ title: item.title || '', notes: item.notes || '', item_date: item.item_date || new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(item.id, form)
    setSaving(false)
  }

  return (
    <Modal title="Edit Entry" onClose={onClose}>
      <div>
        <label style={lbl}>What did you do?</label>
        <input autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="e.g. Took to pediatrician, Picked up from school, Made dinner"
          style={fieldSty} />
      </div>
      <div>
        <label style={lbl}>Date</label>
        <input type="date" value={form.item_date} onChange={e => setForm(f => ({ ...f, item_date: e.target.value }))} style={{ ...fieldSty, maxWidth: 200 }} />
      </div>
      <div>
        <label style={lbl}>Notes (optional)</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3} style={{ ...fieldSty, resize: 'vertical', lineHeight: 1.6 }}
          placeholder="Any details worth documenting…" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btn()}>Cancel</button>
        <button onClick={submit} disabled={saving || !form.title.trim()} style={btn('primary', saving || !form.title.trim())}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </Modal>
  )
}

// ── AI Summary Modal ───────────────────────────────────────────────────────────

function SummaryModal({ summary, meta, onClose }) {
  return (
    <Modal title="AI Summary" onClose={onClose} maxWidth={600}>
      {meta && (
        <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
          {meta.folder_count && <div style={{ textAlign: 'center' }}><div style={{ ...mono, fontSize: 18, color: '#a5b4fc', fontWeight: 700 }}>{meta.folder_count}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>folders</div></div>}
          <div style={{ textAlign: 'center' }}><div style={{ ...mono, fontSize: 18, color: '#a5b4fc', fontWeight: 700 }}>{meta.item_count}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>entries</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ ...mono, fontSize: 18, color: '#a5b4fc', fontWeight: 700 }}>{meta.photo_count}</div><div style={{ fontSize: 10, color: 'var(--text-muted)' }}>photos</div></div>
        </div>
      )}
      <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16 }}>
        {summary}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => { navigator.clipboard.writeText(summary) }} style={btn()}>📋 Copy</button>
        <button onClick={onClose} style={btn('primary')}>Done</button>
      </div>
    </Modal>
  )
}

// ── Photo thumbnail ────────────────────────────────────────────────────────────

function PhotoThumb({ itemId, photo, onDelete }) {
  const [confirmed, setConfirmed] = useState(false)
  const [blobUrl,   setBlobUrl]   = useState(null)
  const [lightbox,  setLightbox]  = useState(false)

  useEffect(() => {
    let url = null
    api.get(`/api/vault/items/${itemId}/photos/${photo.id}/image`, { responseType: 'blob' })
      .then(r => {
        url = URL.createObjectURL(r.data)
        setBlobUrl(url)
      })
      .catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [itemId, photo.id])

  return (
    <>
      {lightbox && blobUrl && (
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img src={blobUrl} alt={photo.original_filename}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 20px 80px rgba(0,0,0,0.8)' }} />
          <button onClick={() => setLightbox(false)}
            style={{ position: 'absolute', top: 20, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div
        style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', cursor: 'pointer' }}
        title={photo.original_filename}
        onClick={() => blobUrl && setLightbox(true)}>
        {blobUrl
          ? <img src={blobUrl} alt={photo.original_filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.3 }}>📷</div>
        }
        <button
          onClick={e => {
            e.stopPropagation()
            if (!confirmed) { setConfirmed(true); setTimeout(() => setConfirmed(false), 2500); return }
            onDelete(photo.id)
          }}
          style={{ position: 'absolute', top: 3, right: 3, background: confirmed ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, cursor: 'pointer', padding: '2px 5px', lineHeight: 1.4 }}>
          {confirmed ? '✓' : '✕'}
        </button>
      </div>
    </>
  )
}

// ── Item card ──────────────────────────────────────────────────────────────────

function ItemCard({ item, onDelete, onEdit, onPhotoUpload, onPhotoDelete }) {
  const fileRef      = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded]   = useState(false)

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    setExpanded(true)
    for (const file of files) {
      await onPhotoUpload(item.id, file)
    }
    setUploading(false)
    e.target.value = ''
  }

  const hasPhotos = item.photos && item.photos.length > 0

  return (
    <div style={{ ...card, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>{item.title}</div>
          {item.item_date && (
            <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>{item.item_date}</div>
          )}
          {item.notes && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.6 }}>{item.notes}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="Upload photo"
            style={{ ...btn('default', uploading), padding: '5px 10px', fontSize: 12 }}>
            {uploading ? '…' : '📷'}
          </button>
          <button onClick={() => onEdit(item)} style={{ ...btn(), padding: '5px 10px', fontSize: 12 }} title="Edit entry">
            ✏️
          </button>
          <button onClick={() => onDelete(item.id)} style={{ ...btn('danger'), padding: '5px 10px', fontSize: 12 }} title="Delete entry">
            🗑
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
      </div>

      {/* Photo strip */}
      {hasPhotos && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ ...mono, fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {item.photos.length} photo{item.photos.length !== 1 ? 's' : ''}
            </span>
            {item.photos.length > 3 && (
              <button onClick={() => setExpanded(x => !x)} style={{ ...btn(), padding: '2px 8px', fontSize: 10 }}>
                {expanded ? 'Show less' : `Show all ${item.photos.length}`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(expanded ? item.photos : item.photos.slice(0, 4)).map(p => (
              <PhotoThumb key={p.id} itemId={item.id} photo={p} onDelete={(pid) => onPhotoDelete(item.id, pid)} />
            ))}
            {!expanded && item.photos.length > 4 && (
              <div
                onClick={() => setExpanded(true)}
                style={{ width: 80, height: 80, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, color: '#a5b4fc', flexShrink: 0 }}>
                +{item.photos.length - 4}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Folder panel (right side) ─────────────────────────────────────────────────

function FolderPanel({ folder, onBack, onItemCountChange }) {
  const [items,        setItems]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [addOpen,      setAddOpen]      = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  const [cachedMeta,   setCachedMeta]   = useState(null)
  const [summarizing,  setSummarizing]  = useState(false)
  const [summary,      setSummary]      = useState(null)
  const [summaryMeta,  setSummaryMeta]  = useState(null)
  const [error,        setError]        = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/vault/folders/${folder.id}/items`)
      setItems(r.data)
    } catch {}
    setLoading(false)
  }


  const loadCached = async () => {
    try {
      const r = await api.get(`/api/vault/folders/${folder.id}/summary/cached`)
      if (r.data.cached) setCachedMeta(r.data)
    } catch {}
  }

  useEffect(() => { load(); loadCached() }, [folder.id])

  const handleAddItem = async (form) => {
    try {
      const r = await api.post(`/api/vault/folders/${folder.id}/items`, form)
      setItems(is => { const updated = [r.data, ...is]; onItemCountChange?.(folder.id, updated.length); return updated })
      setAddOpen(false)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to add entry.') }
  }

  const handleEditItem = async (id, form) => {
    try {
      const r = await api.put(`/api/vault/items/${id}`, form)
      setItems(is => is.map(i => i.id === id ? { ...r.data, photos: i.photos } : i))
      setEditItem(null)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to save changes.') }
  }

  const handleDeleteItem = async (id) => {
    if (!confirm('Delete this entry and its photos?')) return
    try {
      await api.delete(`/api/vault/items/${id}`)
      setItems(is => { const updated = is.filter(i => i.id !== id); onItemCountChange?.(folder.id, updated.length); return updated })
    } catch {}
  }

  const handlePhotoUpload = async (itemId, file) => {
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post(`/api/vault/items/${itemId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setItems(is => is.map(i => i.id === itemId ? { ...i, photos: [...(i.photos || []), r.data] } : i))
    } catch (e) { alert(e.response?.data?.detail || 'Upload failed.') }
  }

  const handlePhotoDelete = async (itemId, photoId) => {
    try {
      await api.delete(`/api/vault/items/${itemId}/photos/${photoId}`)
      setItems(is => is.map(i => i.id === itemId ? { ...i, photos: (i.photos || []).filter(p => p.id !== photoId) } : i))
    } catch {}
  }

  const handleSummary = async (force = false) => {
    setSummarizing(true)
    setError(null)
    try {
      const r = await api.post(`/api/vault/folders/${folder.id}/summary?force=${force}`)
      const meta = { summary: r.data.summary, item_count: r.data.item_count ?? items.length, photo_count: r.data.photo_count, generated_at: r.data.generated_at }
      setSummary(r.data.summary)
      setSummaryMeta(meta)
      setCachedMeta(meta)
    } catch (e) { setError(e.response?.data?.detail || 'Summary failed.') }
    setSummarizing(false)
  }

  const totalPhotos = items.reduce((acc, i) => acc + (i.photos?.length || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {addOpen && <NewItemModal onSave={handleAddItem} onClose={() => setAddOpen(false)} />}
      {editItem && <EditItemModal item={editItem} onSave={handleEditItem} onClose={() => setEditItem(null)} />}
      {summary && <SummaryModal summary={summary} meta={summaryMeta} onClose={() => setSummary(null)} />}

      {/* Folder header */}
      <div style={{ ...card, padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onBack} style={{ ...btn(), padding: '5px 10px', fontSize: 12 }}>← Back</button>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: `${folder.color}22`, border: `2px solid ${folder.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
            {folder.icon}
          </div>
          <div>
            <div style={{ ...syne, fontWeight: 700, fontSize: 17, color: 'var(--text-primary)' }}>{folder.name}</div>
            {folder.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{folder.description}</div>}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>{items.length} entries · {totalPhotos} photos</span>
            {cachedMeta ? (
              <>
                <button onClick={() => { setSummary(cachedMeta.summary); setSummaryMeta(cachedMeta) }} style={btn('success')}>
                  View Summary
                </button>
                <button onClick={() => handleSummary(true)} disabled={summarizing} style={{ ...btn('default', summarizing), padding: '7px 10px' }} title="Regenerate">
                  {summarizing ? '...' : 'Regen'}
                </button>
              </>
            ) : (
              <button onClick={() => handleSummary(false)} disabled={summarizing || items.length === 0} style={btn('success', summarizing || items.length === 0)}>
                {summarizing ? '🧠 Generating…' : '🧠 AI Summary'}
              </button>
            )}
            <button onClick={() => setAddOpen(true)} style={btn('primary')}>+ Add Entry</button>
          </div>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: '#f87171', ...mono }}>{error}</div>}
      </div>

      {/* Items */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{folder.icon}</div>
          <div style={{ ...syne, fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>No entries yet</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.7 }}>
            Add entries to document what you do. Each entry can have a date, notes, and photos as proof.
          </div>
          <button onClick={() => setAddOpen(true)} style={{ ...btn('primary'), fontSize: 13, padding: '9px 20px' }}>+ Add First Entry</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onDelete={handleDeleteItem}
              onEdit={setEditItem}
              onPhotoUpload={handlePhotoUpload}
              onPhotoDelete={handlePhotoDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Vault Summary Panel ────────────────────────────────────────────────────────

const SUMMARY_KEY = 'vault_summary_cache'
const SUMMARY_TTL = 24 * 60 * 60 * 1000   // 24 hours in ms

function VaultSummaryPanel({ totalItems }) {
  const [cached,      setCached]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(SUMMARY_KEY)) } catch { return null }
  })
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [expanded,    setExpanded]    = useState(false)

  const isStale = !cached || (Date.now() - cached.ts > SUMMARY_TTL)
  const age     = cached ? Math.round((Date.now() - cached.ts) / (1000 * 60 * 60)) : null

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.post(`/api/vault/summary?force=${force}`)
      const next = { ...r.data, ts: Date.now() }
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(next))
      setCached(next)
      setExpanded(true)
    } catch (e) { setError(e.response?.data?.detail || 'Summary failed.') }
    setLoading(false)
  }

  // Auto-refresh if stale and there are entries
  useEffect(() => {
    if (isStale && totalItems > 0 && !loading) refresh()
  }, [totalItems])

  if (!cached && !loading && !error) return null

  return (
    <div style={{ ...card, marginBottom: 20, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: expanded ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
        onClick={() => setExpanded(x => !x)}>
        <div style={{ fontSize: 18 }}>🧠</div>
        <div style={{ flex: 1 }}>
          <div style={{ ...syne, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Your Vault Summary</div>
          {cached && (
            <div style={{ ...mono, fontSize: 10, color: isStale ? '#f59e0b' : 'var(--text-muted)', marginTop: 2 }}>
              {age === 0 ? 'Updated just now' : age != null ? `Updated ${age}h ago${isStale ? ' · outdated' : ''}` : ''}
              {cached.folder_count != null && ` · ${cached.folder_count} folders, ${cached.item_count} entries, ${cached.photo_count} photos`}
            </div>
          )}
        </div>
        <button onClick={e => { e.stopPropagation(); refresh() }} disabled={loading}
          style={{ ...btn('success', loading), padding: '5px 12px', fontSize: 11 }}>
          {loading ? '🧠 Generating…' : '↺ Refresh'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div style={{ padding: '16px 18px' }}>
          {error && (
            <div style={{ ...mono, fontSize: 11, color: '#f87171', marginBottom: 10 }}>{error}</div>
          )}
          {cached?.summary && (
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.85, whiteSpace: 'pre-wrap', background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: '14px 16px' }}>
              {cached.summary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProofVault() {
  const [folders,         setFolders]         = useState([])
  const [loading,         setLoading]         = useState(true)
  const [selectedFolder,  setSelectedFolder]  = useState(null)
  const [newFolderOpen,   setNewFolderOpen]   = useState(false)
  const [quickEntry,      setQuickEntry]      = useState(null)
  const [fullSummarizing, setFullSummarizing] = useState(false)
  const [fullSummary,     setFullSummary]     = useState(null)
  const [fullMeta,        setFullMeta]        = useState(null)
  const [cachedFullMeta,  setCachedFullMeta]  = useState(null)
  const [summaryError,    setSummaryError]    = useState(null)

  const loadFolders = async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/vault/folders')
      setFolders(r.data)
    } catch {}
    setLoading(false)
  }


  const loadCachedFull = async () => {
    try {
      const r = await api.get('/api/vault/summary/cached')
      if (r.data.cached) setCachedFullMeta(r.data)
    } catch {}
  }

  useEffect(() => { loadFolders(); loadCachedFull() }, [])

  const handleQuickEntry = async (folderId, form) => {
    try {
      const r = await api.post(`/api/vault/folders/${folderId}/items`, form)
      setFolders(fs => fs.map(f => f.id === folderId ? { ...f, item_count: (f.item_count || 0) + 1 } : f))
      setQuickEntry(null)
      // Invalidate summary cache so it regenerates on next view
      localStorage.removeItem(SUMMARY_KEY)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to log entry.') }
  }

  const handleCreateFolder = async (form) => {
    try {
      const r = await api.post('/api/vault/folders', { name: form.name.trim(), icon: form.icon, color: form.color, description: form.description?.trim() || null })
      setFolders(fs => [...fs, r.data])
      setNewFolderOpen(false)
    } catch (e) { alert(e.response?.data?.detail || 'Failed to create folder.') }
  }

  const handleDeleteFolder = async (id) => {
    if (!confirm('Delete this folder and all its contents? This cannot be undone.')) return
    try {
      await api.delete(`/api/vault/folders/${id}`)
      setFolders(fs => fs.filter(f => f.id !== id))
      if (selectedFolder?.id === id) setSelectedFolder(null)
    } catch {}
  }

  const handleFullSummary = async (force = false) => {
    setFullSummarizing(true)
    setSummaryError(null)
    try {
      const r = await api.post(`/api/vault/summary?force=${force}`)
      setFullSummary(r.data.summary)
      setFullMeta(r.data)
      setCachedFullMeta(r.data)
    } catch (e) { setSummaryError(e.response?.data?.detail || 'Summary failed.') }
    setFullSummarizing(false)
  }

  const totalItems  = folders.reduce((a, f) => a + (f.item_count || 0), 0)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {newFolderOpen && <NewFolderModal onSave={handleCreateFolder} onClose={() => setNewFolderOpen(false)} />}
      {quickEntry    && <QuickEntryModal preset={quickEntry} folders={folders} onSave={handleQuickEntry} onClose={() => setQuickEntry(null)} />}
      {fullSummary   && <SummaryModal summary={fullSummary} meta={fullMeta} onClose={() => setFullSummary(null)} />}

      <PageHeader
        title="Proof Vault"
        subtitle="Document what you do — folder by folder, with photos and dates as evidence."
        icon="🗂"
      />

      {selectedFolder ? (
        <FolderPanel
          folder={selectedFolder}
          onBack={() => { setSelectedFolder(null); loadFolders() }}
          onItemCountChange={(folderId, count) => setFolders(fs => fs.map(f => f.id === folderId ? { ...f, item_count: count } : f))}
        />
      ) : (
        <>
          {/* Vault Summary */}
          {totalItems > 0 && <VaultSummaryPanel totalItems={totalItems} />}

          {/* Quick Log */}
          {folders.length > 0 && (
            <div style={{ ...card, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 12 }}>
                ⚡ Quick Log
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {QUICK_ENTRIES.map(q => (
                  <button key={q.label} onClick={() => setQuickEntry(q)}
                    style={{ ...btn(), padding: '7px 13px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{q.icon}</span>
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Action bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {folders.length > 0 && (
                <>
                  <span style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>{folders.length} folders · {totalItems} entries</span>
                  {cachedFullMeta ? (
                    <>
                      <button onClick={() => { setFullSummary(cachedFullMeta.summary); setFullMeta(cachedFullMeta) }} style={btn('success')}>
                        Full Summary
                      </button>
                      <button onClick={() => handleFullSummary(true)} disabled={fullSummarizing} style={{ ...btn('default', fullSummarizing), padding: '7px 10px' }} title="Regenerate">
                        {fullSummarizing ? '...' : 'Regen'}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleFullSummary(false)} disabled={fullSummarizing || totalItems === 0} style={btn('success', fullSummarizing || totalItems === 0)}>
                      {fullSummarizing ? '🧠 Generating…' : '🧠 Full Summary'}
                    </button>
                  )}
                </>
              )}
            </div>
            <button onClick={() => setNewFolderOpen(true)} style={{ ...btn('primary'), fontSize: 12, padding: '8px 16px' }}>
              + New Folder
            </button>
          </div>

          {summaryError && (
            <div style={{ ...mono, fontSize: 11, color: '#f87171', marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
              {summaryError}
            </div>
          )}

          {/* Folder grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : folders.length === 0 ? (
            <div style={{ ...card, padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🗂</div>
              <div style={{ ...syne, fontWeight: 700, fontSize: 20, color: 'var(--text-primary)', marginBottom: 10 }}>
                Start Building Your Record
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.8, maxWidth: 440, margin: '0 auto 28px' }}>
                Create folders for each category of contribution — Medical, School, Daily Care, Financial — then add dated entries with photos as proof.
              </div>
              <button onClick={() => setNewFolderOpen(true)} style={{ ...btn('primary'), fontSize: 14, padding: '12px 28px' }}>
                Create Your First Folder
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {folders.map(folder => (
                <div key={folder.id} style={{ ...card, padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = folder.color + '55'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>

                  {/* Color accent strip */}
                  <div style={{ height: 4, background: folder.color, opacity: 0.8 }} />

                  <div style={{ padding: '16px 18px' }} onClick={() => setSelectedFolder(folder)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: `${folder.color}18`, border: `1.5px solid ${folder.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                        {folder.icon}
                      </div>
                      <div>
                        <div style={{ ...syne, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{folder.name}</div>
                        {folder.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{folder.description}</div>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: folder.color }}>{folder.item_count || 0}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>entries</div>
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>
                        Open →
                      </div>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                    style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 5, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#f87171' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0' }}
                    title="Delete folder">
                    🗑
                  </button>
                </div>
              ))}

              {/* Add folder card */}
              <div onClick={() => setNewFolderOpen(true)} style={{ ...card, padding: '20px', cursor: 'pointer', border: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 120, transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)' }}>
                <div style={{ fontSize: 24, opacity: 0.4 }}>+</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>New Folder</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
