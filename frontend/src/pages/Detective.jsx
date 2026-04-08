import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import WarRoomContextBanner from '../components/WarRoomContextBanner'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import PageHeader from '../components/PageHeader'

// ── Shared style tokens ──────────────────────────────────────────────────────
export const card = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
}
export const mono = { fontFamily: 'IBM Plex Mono', fontSize: 11 }
export const SEVERITY_COLORS = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#f59e0b',
  low:      '#6366f1',
  info:     '#22c55e',
}
export const ENTRY_TYPES = ['note', 'observation', 'statement', 'admission', 'contradiction', 'timeline']

// ── Sub-components ───────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <div style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>Detective Mode</div>
      <div style={{ color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.6 }}>
        This feature requires access granted by your admin. Ask them to enable it for your account from Admin → Detective Access.
      </div>
    </div>
  )
}

export function CaseList({ cases, selected, onSelect, onCreate, creating }) {
  const [newTitle, setNewTitle] = useState('')
  const [showNew, setShowNew] = useState(false)

  const submit = async () => {
    if (!newTitle.trim()) return
    await onCreate(newTitle.trim())
    setNewTitle('')
    setShowNew(false)
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>— Cases —</span>
        <button
          onClick={() => setShowNew(s => !s)}
          style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, color: 'var(--accent)', fontSize: 12, padding: '3px 10px', cursor: 'pointer' }}
        >
          + New
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, overflow: 'hidden' }}>
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Case name..."
            style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
          />
          <button
            onClick={submit}
            disabled={creating}
            style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, padding: '6px 12px', cursor: 'pointer', opacity: creating ? 0.5 : 1 }}
          >
            {creating ? '…' : 'Create'}
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {cases.length === 0 && (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
            No cases yet. Create one to start investigating.
          </div>
        )}
        {cases.map(c => (
          <div
            key={c.id}
            onClick={() => onSelect(c)}
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              cursor: 'pointer',
              background: selected?.id === c.id ? 'rgba(99,102,241,0.1)' : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (selected?.id !== c.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={e => { if (selected?.id !== c.id) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: c.status === 'active' ? '#22c55e' : 'var(--text-muted)' }}>●</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
            </div>
            <div style={{ ...mono, color: 'var(--text-muted)', marginTop: 3, paddingLeft: 18 }}>
              {c.status} · {c.created_at?.slice(0, 10)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function InvestigationLog({ caseId, entries, onAdd, onDelete, onAttachmentUpdate, onPhotosUpdate, loading, initialContent }) {
  const [content, setContent] = useState(initialContent || '')
  const [type, setType] = useState('note')
  const [severity, setSeverity] = useState('medium')
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploadingFor, setUploadingFor] = useState(null)
  const [lightboxEntry, setLightboxEntry] = useState(null)
  const [lightboxPhotoIdx, setLightboxPhotoIdx] = useState(0)
  const [synthesizing, setSynthesizing] = useState(null)
  const [expandedStrips, setExpandedStrips] = useState({})
  const [editingEntry, setEditingEntry] = useState(null) // { id, content, entry_type, severity }
  const [saving, setSaving] = useState(false)
  const attachRef = useRef(null)
  const perEntryRef = useRef({})

  const submit = async () => {
    if (!content.trim()) return
    // Capture pending files immediately so async work uses a stable snapshot
    const filesToUpload = [...pendingFiles]
    setAdding(true)
    try {
      const entry = await onAdd({ content: content.trim(), entry_type: type, severity })
      if (filesToUpload.length > 0 && entry?.id) {
        await uploadPhotosAndSynthesize(entry.id, filesToUpload)
      }
      setContent('')
    } finally {
      // Always clear pending chips whether upload succeeded, failed, or was skipped
      setPendingFiles([])
      setAdding(false)
    }
  }

  const uploadPhoto = async (entryId, file) => {
    setUploadingFor(entryId)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post(
        `/api/detective/cases/${caseId}/entries/${entryId}/photos`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      if (onPhotosUpdate) onPhotosUpdate(entryId, r.data, 'add')
      return r.data
    } catch (e) {
      alert(e.response?.data?.detail || 'Photo upload failed.')
    } finally {
      setUploadingFor(null)
    }
  }

  const uploadPhotosAndSynthesize = async (entryId, files) => {
    for (const f of files) {
      await uploadPhoto(entryId, f)
    }
    // After all uploads, run combined synthesis
    await synthesize(entryId)
  }

  const deletePhoto = async (entryId, photoId, e) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await api.delete(`/api/detective/cases/${caseId}/entries/${entryId}/photos/${photoId}`)
      if (onPhotosUpdate) onPhotosUpdate(entryId, { id: photoId }, 'delete')
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete photo. Try refreshing.')
    }
  }

  const synthesize = async (entryId) => {
    setSynthesizing(entryId)
    try {
      const r = await api.post(
        `/api/detective/cases/${caseId}/entries/${entryId}/photos/synthesize`
      )
      if (onAttachmentUpdate) onAttachmentUpdate(entryId, { multi_photo_analysis: r.data.synthesis })
    } catch (e) {
      alert(e.response?.data?.detail || 'Synthesis failed. Check your API key in Settings.')
    } finally {
      setSynthesizing(null)
    }
  }

  const deleteAttachment = async (entryId, e) => {
    e.stopPropagation()
    try {
      await api.delete(`/api/detective/cases/${caseId}/entries/${entryId}/attachment`)
      if (onAttachmentUpdate) onAttachmentUpdate(entryId, { attachment_filename: null, attachment_analysis: null, attachment_status: 'none' })
    } catch {}
  }

  const saveEdit = async () => {
    if (!editingEntry) return
    setSaving(true)
    try {
      await api.put(
        `/api/detective/cases/${caseId}/entries/${editingEntry.id}`,
        { content: editingEntry.content, entry_type: editingEntry.entry_type, severity: editingEntry.severity }
      )
      if (onAttachmentUpdate) onAttachmentUpdate(editingEntry.id, {
        content: editingEntry.content,
        entry_type: editingEntry.entry_type,
        severity: editingEntry.severity,
      })
      setEditingEntry(null)
    } catch (e) {
      alert(e.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Add entry */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>— Log Entry —</div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="What did you observe, hear, or find? Be specific."
          rows={3}
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13,
            outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
          }}
        />

        {/* Pending files preview strip */}
        {pendingFiles.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pendingFiles.map((f, i) => (
              <div key={i} style={{
                padding: '4px 8px', background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6,
                display: 'flex', alignItems: 'center', gap: 6, maxWidth: 200,
              }}>
                <span style={{ fontSize: 12 }}>📎</span>
                <span style={{ ...mono, fontSize: 9, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <button
                  onClick={() => setPendingFiles(pf => pf.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            style={{ ...mono, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
          >
            {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            style={{ ...mono, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: SEVERITY_COLORS[severity] || 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
          >
            {Object.keys(SEVERITY_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Attach photos button (multi-select) */}
          <button
            onClick={() => attachRef.current?.click()}
            title="Attach photos (multiple allowed)"
            style={{
              background: pendingFiles.length > 0 ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${pendingFiles.length > 0 ? 'rgba(99,102,241,0.45)' : 'var(--border)'}`,
              borderRadius: 6, color: pendingFiles.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 13, padding: '4px 10px', cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span>📎</span>
            {pendingFiles.length > 0 && <span style={{ ...mono, fontSize: 9 }}>{pendingFiles.length}</span>}
          </button>
          <input
            ref={attachRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files?.length) {
                setPendingFiles(pf => [...pf, ...Array.from(e.target.files)])
                e.target.value = ''
              }
            }}
          />

          <div style={{ flex: 1 }} />
          <button
            onClick={submit}
            disabled={adding || !content.trim()}
            style={{
              background: adding || !content.trim() ? 'rgba(99,102,241,0.2)' : 'var(--accent)',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600,
              padding: '7px 20px', cursor: adding || !content.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {adding ? (pendingFiles.length > 0 ? `Logging + ${pendingFiles.length} photo${pendingFiles.length > 1 ? 's' : ''}…` : 'Adding…') : 'Log it'}
          </button>
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>Loading log…</div>
      ) : entries.length === 0 ? (
        <div style={{ ...card, padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          Nothing logged yet. Start building the record.
        </div>
      ) : entries.map(e => {
        const hasAttachment = e.attachment_status && e.attachment_status !== 'none'
        const photos = e.photos || []
        const isUploading = uploadingFor === e.id
        const isExpanded = expanded === e.id
        const isSynthesizing = synthesizing === e.id
        const isEditing = editingEntry?.id === e.id

        return (
          <div
            key={e.id}
            style={{ ...card, padding: '12px 16px', borderLeft: `3px solid ${SEVERITY_COLORS[e.severity] || 'var(--border)'}` }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ ...mono, fontSize: 10, background: 'rgba(255,255,255,0.07)', borderRadius: 4, padding: '2px 6px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{e.entry_type}</span>
              <span style={{ ...mono, fontSize: 10, color: SEVERITY_COLORS[e.severity] || 'var(--text-muted)', textTransform: 'uppercase' }}>{e.severity}</span>
              {photos.length > 0 && (
                <span style={{ ...mono, fontSize: 9, color: '#22c55e', textTransform: 'uppercase' }}>
                  📎 {photos.length} photo{photos.length !== 1 ? 's' : ''}
                </span>
              )}
              {hasAttachment && photos.length === 0 && (
                <span style={{ ...mono, fontSize: 9, color: e.attachment_status === 'done' ? '#22c55e' : e.attachment_status === 'failed' ? '#ef4444' : '#f59e0b', textTransform: 'uppercase' }}>
                  📎 {e.attachment_status === 'done' ? 'evidence' : e.attachment_status === 'failed' ? 'attach failed' : '… analyzing'}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <span style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>{e.created_at?.slice(0, 16).replace('T', ' ')}</span>

              {/* Per-entry add photo button */}
              {!isUploading ? (
                <button
                  onClick={ev => { ev.stopPropagation(); perEntryRef.current[e.id]?.click() }}
                  title="Add photos to this entry"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '0 4px', opacity: 0.6 }}
                >📎</button>
              ) : (
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              )}
              <input
                ref={el => { perEntryRef.current[e.id] = el }}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={async ev => {
                  if (!ev.target.files?.length) return
                  const files = Array.from(ev.target.files)
                  ev.target.value = ''
                  await uploadPhotosAndSynthesize(e.id, files)
                }}
              />

              <button
                onClick={() => setEditingEntry(isEditing ? null : { id: e.id, content: e.content, entry_type: e.entry_type, severity: e.severity })}
                title={isEditing ? 'Cancel edit' : 'Edit entry'}
                style={{ background: 'none', border: 'none', color: isEditing ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '0 4px', opacity: isEditing ? 1 : 0.6 }}
              >✎</button>
              <button
                onClick={() => onDelete(e.id)}
                style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', fontSize: 12, padding: '0 4px' }}
                title="Delete entry"
              >✕</button>
            </div>

            {/* Content / Edit form */}
            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <textarea
                  autoFocus
                  value={editingEntry.content}
                  onChange={ev => setEditingEntry(ed => ({ ...ed, content: ev.target.value }))}
                  rows={4}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--accent)',
                    borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13,
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={editingEntry.entry_type}
                    onChange={ev => setEditingEntry(ed => ({ ...ed, entry_type: ev.target.value }))}
                    style={{ ...mono, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                  >
                    {ENTRY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={editingEntry.severity}
                    onChange={ev => setEditingEntry(ed => ({ ...ed, severity: ev.target.value }))}
                    style={{ ...mono, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', color: SEVERITY_COLORS[editingEntry.severity] || 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                  >
                    {Object.keys(SEVERITY_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setEditingEntry(null)}
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '4px 12px', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={saveEdit}
                    disabled={saving || !editingEntry.content.trim()}
                    style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 14px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setExpanded(isExpanded ? null : e.id)}
                style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, cursor: 'pointer',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: isExpanded ? 'unset' : 3, WebkitBoxOrient: 'vertical' }}
              >
                {e.content}
              </div>
            )}

            {/* Multi-photo strip */}
            {photos.length > 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                {/* Photo row — capped at 5 with expand overflow */}
                {(() => {
                  const STRIP_LIMIT = 5
                  const isStripExpanded = expandedStrips[e.id]
                  const visiblePhotos = isStripExpanded ? photos : photos.slice(0, STRIP_LIMIT)
                  const hiddenCount = photos.length - STRIP_LIMIT
                  return (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 4, alignItems: 'center' }}>
                      {visiblePhotos.map((p, idx) => (
                        <div
                          key={p.id}
                          style={{ position: 'relative', flexShrink: 0, width: 80, height: 80, borderRadius: 7, overflow: 'hidden',
                            border: '1px solid var(--border)', cursor: 'zoom-in', background: 'rgba(255,255,255,0.04)' }}
                          onClick={() => { setLightboxEntry(e); setLightboxPhotoIdx(isStripExpanded ? idx : idx) }}
                        >
                          <AuthedImage
                            src={p.image_url}
                            alt={p.original_filename}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          {/* Status badge */}
                          <div style={{
                            position: 'absolute', bottom: 3, left: 3,
                            width: 6, height: 6, borderRadius: '50%',
                            background: p.analysis_status === 'done' ? '#22c55e' : p.analysis_status === 'failed' ? '#ef4444' : '#f59e0b',
                          }} />
                          {/* Delete overlay */}
                          <button
                            onClick={ev => deletePhoto(e.id, p.id, ev)}
                            title="Remove photo"
                            style={{
                              position: 'absolute', top: 2, right: 2, zIndex: 2,
                              background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                              width: 16, height: 16, color: '#fff', fontSize: 9, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0,
                            }}
                          >✕</button>
                        </div>
                      ))}
                      {/* Overflow pill */}
                      {!isStripExpanded && hiddenCount > 0 && (
                        <button
                          onClick={ev => { ev.stopPropagation(); setExpandedStrips(s => ({ ...s, [e.id]: true })) }}
                          style={{
                            flexShrink: 0, width: 80, height: 80, borderRadius: 7,
                            background: 'rgba(99,102,241,0.12)', border: '1px dashed rgba(99,102,241,0.4)',
                            color: 'var(--accent)', fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', gap: 3, lineHeight: 1.2,
                          }}
                        >
                          <span style={{ fontSize: 16 }}>+{hiddenCount}</span>
                          <span style={{ fontSize: 9, opacity: 0.8 }}>more</span>
                        </button>
                      )}
                      {/* Collapse pill when expanded */}
                      {isStripExpanded && photos.length > STRIP_LIMIT && (
                        <button
                          onClick={ev => { ev.stopPropagation(); setExpandedStrips(s => ({ ...s, [e.id]: false })) }}
                          style={{
                            flexShrink: 0, width: 80, height: 80, borderRadius: 7,
                            background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)',
                            color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 9,
                            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', gap: 3, lineHeight: 1.2,
                          }}
                        >
                          <span style={{ fontSize: 14 }}>▲</span>
                          <span>collapse</span>
                        </button>
                      )}
                    </div>
                  )
                })()}

                {/* Synthesize / synthesis result */}
                {isSynthesizing && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, ...mono, fontSize: 10, color: 'var(--text-muted)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                    Analyzing {photos.length} photo{photos.length !== 1 ? 's' : ''} together…
                  </div>
                )}
                {e.multi_photo_analysis && (
                  <div style={{ marginTop: 8, borderTop: '1px dashed rgba(99,102,241,0.2)', paddingTop: 8 }}>
                    <div onClick={() => setExpanded(isExpanded ? null : e.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, cursor: 'pointer' }}>
                      <span style={{ ...mono, fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>— Combined Analysis —</span>
                      {(photos.length > 1 || (photos.length >= 1 && e.attachment_status === 'done')) && (
                        <button
                          onClick={() => synthesize(e.id)}
                          disabled={isSynthesizing}
                          title="Re-run synthesis"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10, padding: 0, marginLeft: 'auto', fontFamily: 'IBM Plex Mono' }}
                        >{isSynthesizing ? '…' : '↺ refresh'}</button>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6,
                      ...(isExpanded ? {} : {
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 5, WebkitBoxOrient: 'vertical',
                      }),
                      cursor: 'pointer',
                    }} onClick={() => setExpanded(isExpanded ? null : e.id)}>
                      {e.multi_photo_analysis}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Legacy single attachment section */}
            {hasAttachment && photos.length === 0 && (
              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    onClick={() => { setLightboxEntry(e); setLightboxPhotoIdx(-1) }}
                    style={{ width: 72, height: 72, borderRadius: 6, overflow: 'hidden', flexShrink: 0, cursor: 'zoom-in', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.04)' }}
                  >
                    {e.attachment_status === 'done' || e.attachment_status === 'failed' ? (
                      <AuthedImage
                        src={`/api/detective/cases/${caseId}/entries/${e.id}/attachment/image`}
                        alt={e.attachment_filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ ...mono, fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>— Evidence Analysis —</span>
                      <button
                        onClick={ev => deleteAttachment(e.id, ev)}
                        title="Remove attachment"
                        style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.4)', cursor: 'pointer', fontSize: 10, padding: 0, marginLeft: 'auto' }}
                      >remove</button>
                    </div>
                    {e.attachment_analysis ? (
                      <div style={{
                        fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: isExpanded ? 'unset' : 4, WebkitBoxOrient: 'vertical',
                      }}>
                        {e.attachment_analysis}
                      </div>
                    ) : (
                      <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>Analyzing…</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Photo lightbox — supports both multi and legacy */}
      {lightboxEntry && (
        <div
          onClick={() => setLightboxEntry(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 32, gap: 20,
          }}
        >
          <div onClick={ev => ev.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: '90vw', width: '100%' }}>
            {/* Multi-photo navigation */}
            {lightboxEntry.photos?.length > 0 ? (() => {
              const lp = lightboxEntry.photos
              const cur = lp[lightboxPhotoIdx] || lp[0]
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', justifyContent: 'center' }}>
                    {lp.length > 1 && (
                      <button
                        onClick={() => setLightboxPhotoIdx(i => Math.max(0, i - 1))}
                        disabled={lightboxPhotoIdx === 0}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 18, cursor: lightboxPhotoIdx === 0 ? 'not-allowed' : 'pointer', opacity: lightboxPhotoIdx === 0 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >&#8249;</button>
                    )}
                    <AuthedImage
                      src={cur.image_url}
                      alt={cur.original_filename}
                      style={{ maxWidth: '76vw', maxHeight: '52vh', objectFit: 'contain', borderRadius: 12, display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
                    />
                    {lp.length > 1 && (
                      <button
                        onClick={() => setLightboxPhotoIdx(i => Math.min(lp.length - 1, i + 1))}
                        disabled={lightboxPhotoIdx === lp.length - 1}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', fontSize: 18, cursor: lightboxPhotoIdx === lp.length - 1 ? 'not-allowed' : 'pointer', opacity: lightboxPhotoIdx === lp.length - 1 ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >&#8250;</button>
                    )}
                  </div>
                  {lp.length > 1 && (
                    <div style={{ ...mono, fontSize: 9, color: 'var(--text-muted)' }}>{lightboxPhotoIdx + 1} / {lp.length}</div>
                  )}
                  {cur.ai_analysis && (
                    <div style={{ width: '100%', maxWidth: 640, background: 'rgba(12,12,24,0.95)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ ...mono, fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>— Photo {lightboxPhotoIdx + 1} Analysis —</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '22vh', overflowY: 'auto' }}>{cur.ai_analysis}</div>
                    </div>
                  )}
                  {lightboxEntry.multi_photo_analysis && (
                    <div style={{ width: '100%', maxWidth: 640, background: 'rgba(12,12,24,0.95)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 12, padding: '16px 20px' }}>
                      <div style={{ ...mono, fontSize: 9, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>— Combined Analysis —</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '28vh', overflowY: 'auto' }}>{lightboxEntry.multi_photo_analysis}</div>
                    </div>
                  )}
                </>
              )
            })() : (
              <>
                <AuthedImage
                  src={`/api/detective/cases/${caseId}/entries/${lightboxEntry.id}/attachment/image`}
                  alt={lightboxEntry.attachment_filename}
                  style={{ maxWidth: '82vw', maxHeight: '55vh', objectFit: 'contain', borderRadius: 12, display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
                />
                {lightboxEntry.attachment_analysis && (
                  <div style={{ width: '100%', maxWidth: 640, background: 'rgba(12,12,24,0.95)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ ...mono, fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>— Evidence Analysis —</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '26vh', overflowY: 'auto' }}>{lightboxEntry.attachment_analysis}</div>
                  </div>
                )}
              </>
            )}
          </div>
          <button
            onClick={() => setLightboxEntry(null)}
            style={{
              position: 'fixed', top: 20, right: 24,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: 38, height: 38,
              color: '#fff', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      )}
    </div>
  )
}

export function AuthedImage({ src, alt, style }) {
  const [blobUrl, setBlobUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = null
    api.get(src, { responseType: 'blob' })
      .then(r => {
        objectUrl = URL.createObjectURL(r.data)
        setBlobUrl(objectUrl)
      })
      .catch(() => setFailed(true))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [src])

  if (failed) return (
    <div style={{ ...style, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
      unavailable
    </div>
  )
  if (!blobUrl) return (
    <div style={{ ...style, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )
  return <img src={blobUrl} alt={alt} style={style} />
}

const PHOTOS_PER_PAGE = 12

export function GalleryView({ caseId, uploads, onDelete }) {
  const [lightbox, setLightbox] = useState(null)
  const [expandedAnalysis, setExpandedAnalysis] = useState(null)
  const [page, setPage] = useState(1)

  if (uploads.length === 0) {
    return (
      <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🖼</div>
        No photos yet. Upload some in the Photo Evidence tab.
      </div>
    )
  }

  const totalPages = Math.ceil(uploads.length / PHOTOS_PER_PAGE)
  const pageUploads = uploads.slice((page - 1) * PHOTOS_PER_PAGE, page * PHOTOS_PER_PAGE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {uploads.length} photo{uploads.length !== 1 ? 's' : ''} · page {page} of {totalPages} · click to expand
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {pageUploads.map(u => (
          <div key={u.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'transform 0.15s, box-shadow 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            {/* Image */}
            <div style={{ position: 'relative', cursor: 'zoom-in', height: 180 }} onClick={() => setLightbox(u)}>
              <AuthedImage
                src={u.image_url}
                alt={u.original_filename}
                style={{ width: '100%', height: 180, objectFit: 'cover', display: 'block' }}
              />
              <div style={{
                position: 'absolute', top: 8, right: 8,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                borderRadius: 4, padding: '2px 7px',
                fontFamily: 'IBM Plex Mono', fontSize: 9, textTransform: 'uppercase',
                color: u.analysis_status === 'done' ? '#22c55e' : u.analysis_status === 'failed' ? '#ef4444' : '#f59e0b',
              }}>
                {u.analysis_status === 'done' ? '✓ analyzed' : u.analysis_status === 'failed' ? '✕ failed' : u.analysis_status === 'pending' ? '⏳ pending' : '… analyzing'}
              </div>
              {/* Zoom overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.32)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0)' }}
              >
              </div>
            </div>

            {/* Info */}
            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1, wordBreak: 'break-all' }}>
                  {u.original_filename}
                </span>
                {u.source !== 'entry' && (
                <button
                  onClick={() => onDelete(u)}
                  style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.45)', cursor: 'pointer', fontSize: 13, flexShrink: 0, padding: 0, lineHeight: 1 }}
                  title="Delete photo"
                >✕</button>
                )}
              </div>

              {u.source === 'entry' && u.source_note && (
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', borderRadius: 4, padding: '3px 6px', lineHeight: 1.4, marginBottom: 4 }}>
                  📎 log: {u.source_note}
                </div>
              )}
              {u.ai_analysis && (
                <div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5 }}>
                    — {u.analysis_label || 'AI Analysis'} —
                  </div>
                  <div style={{
                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: expandedAnalysis === u.id ? 'unset' : 4,
                    WebkitBoxOrient: 'vertical',
                  }}>
                    {u.ai_analysis}
                  </div>
                  {u.ai_analysis.length > 200 && (
                    <button
                      onClick={() => setExpandedAnalysis(expandedAnalysis === u.id ? null : u.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10, fontFamily: 'IBM Plex Mono', cursor: 'pointer', padding: '3px 0 0', display: 'block' }}
                    >
                      {expandedAnalysis === u.id ? '▲ collapse' : '▼ read more'}
                    </button>
                  )}
                </div>
              )}

              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', marginTop: 'auto', display: 'flex', gap: 8 }}>
                <span>{u.created_at?.slice(0, 10)}</span>
                {u.file_size && <span>· {(u.file_size / 1024).toFixed(0)} KB</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 8 }}>
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 8px', cursor: page === 1 ? 'default' : 'pointer',
              opacity: page === 1 ? 0.4 : 1,
            }}
          >«</button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px', cursor: page === 1 ? 'default' : 'pointer',
              opacity: page === 1 ? 0.4 : 1,
            }}
          >‹</button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => {
            const isNear = Math.abs(n - page) <= 2 || n === 1 || n === totalPages
            if (!isNear) {
              if (n === page - 3 || n === page + 3) {
                return <span key={n} style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}>…</span>
              }
              return null
            }
            return (
              <button
                key={n}
                onClick={() => setPage(n)}
                style={{
                  background: n === page ? 'rgba(99,102,241,0.2)' : 'none',
                  border: n === page ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border)',
                  borderRadius: 6,
                  color: n === page ? 'var(--accent)' : 'var(--text-secondary)',
                  fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px',
                  cursor: n === page ? 'default' : 'pointer',
                  fontWeight: n === page ? 700 : 400,
                  minWidth: 32,
                }}
              >{n}</button>
            )
          })}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px', cursor: page === totalPages ? 'default' : 'pointer',
              opacity: page === totalPages ? 0.4 : 1,
            }}
          >›</button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
              fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 8px', cursor: page === totalPages ? 'default' : 'pointer',
              opacity: page === totalPages ? 0.4 : 1,
            }}
          >»</button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 32, gap: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, maxWidth: '90vw' }}>
            <AuthedImage
              src={lightbox.image_url}
              alt={lightbox.original_filename}
              style={{ maxWidth: '82vw', maxHeight: '62vh', objectFit: 'contain', borderRadius: 12, display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            />
            {lightbox.ai_analysis && (
              <div style={{
                width: '100%', maxWidth: 640,
                background: 'rgba(12,12,24,0.95)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 20px',
              }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>
                  — {lightbox.analysis_label || 'AI Analysis'} —
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxHeight: '24vh', overflowY: 'auto' }}>
                  {lightbox.ai_analysis}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', top: 20, right: 24,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '50%', width: 38, height: 38,
              color: '#fff', fontSize: 16, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      )}
    </div>
  )
}

export function PhotoEvidence({ caseId, uploads, onUpload, onDelete, uploading }) {
  const fileRef = useRef(null)
  const [lightbox, setLightbox] = useState(null)
  const [expandedAnalysis, setExpandedAnalysis] = useState(null)
  const [page, setPage] = useState(1)

  const totalPages = Math.ceil(uploads.length / PHOTOS_PER_PAGE)
  const pageUploads = uploads.slice((page - 1) * PHOTOS_PER_PAGE, page * PHOTOS_PER_PAGE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Upload zone */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>— Photo Evidence —</div>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: '2px dashed rgba(99,102,241,0.3)', borderRadius: 10, padding: 22,
            textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
            color: 'var(--text-muted)', fontSize: 13,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.background = 'transparent' }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12 }}>Analyzing image…</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 26, marginBottom: 4 }}>📷</div>
              <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: 13 }}>Drop a photo or click to upload</div>
              <div style={{ fontSize: 11, marginTop: 3 }}>AI analyzes instantly · JPEG, PNG, WEBP, GIF · max 10 MB</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); e.target.value = '' }} />
      </div>

      {/* Gallery grid */}
      {uploads.length > 0 && (
        <>
        <div style={{ ...mono, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {uploads.length} photo{uploads.length !== 1 ? 's' : ''}{totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {pageUploads.map(u => (
            <div key={u.id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Image tile */}
              <div style={{ position: 'relative', cursor: 'zoom-in', height: 160 }} onClick={() => setLightbox(u)}>
                <AuthedImage
                  src={u.image_url}
                  alt={u.original_filename}
                  style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                />
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
                  borderRadius: 4, padding: '2px 7px',
                  fontFamily: 'IBM Plex Mono', fontSize: 9, textTransform: 'uppercase',
                  color: u.analysis_status === 'done' ? '#22c55e' : u.analysis_status === 'failed' ? '#ef4444' : '#f59e0b',
                }}>
                  {u.analysis_status === 'done' ? '✓ analyzed' : u.analysis_status === 'failed' ? '✕ failed' : u.analysis_status === 'pending' ? '⏳ pending' : '… analyzing'}
                </div>
              </div>

              {/* Card body */}
              <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.original_filename}
                  </span>
                  {u.source !== 'entry' && (
                  <button
                    onClick={() => onDelete(u)}
                    style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', fontSize: 12, flexShrink: 0, padding: 0 }}
                  >✕</button>
                  )}
                </div>

                {u.source === 'entry' && u.source_note && (
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent)', background: 'rgba(99,102,241,0.1)', borderRadius: 4, padding: '3px 6px', lineHeight: 1.4, marginBottom: 4 }}>
                    📎 log: {u.source_note}
                  </div>
                )}
                {u.ai_analysis && (
                  <div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: expandedAnalysis === u.id ? 'unset' : 3,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {u.ai_analysis}
                    </div>
                    {u.ai_analysis.length > 160 && (
                      <button
                        onClick={() => setExpandedAnalysis(expandedAnalysis === u.id ? null : u.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 10, fontFamily: 'IBM Plex Mono', cursor: 'pointer', padding: '2px 0 0', display: 'block' }}
                      >
                        {expandedAnalysis === u.id ? '▲ less' : '▼ more'}
                      </button>
                    )}
                  </div>
                )}

                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', marginTop: 'auto' }}>
                  {u.created_at?.slice(0, 10)}{u.file_size ? ` · ${(u.file_size / 1024).toFixed(0)} KB` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 }}>
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 8px', cursor: page === 1 ? 'default' : 'pointer',
                opacity: page === 1 ? 0.4 : 1,
              }}
            >«</button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px', cursor: page === 1 ? 'default' : 'pointer',
                opacity: page === 1 ? 0.4 : 1,
              }}
            >‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => {
              const isNear = Math.abs(n - page) <= 2 || n === 1 || n === totalPages
              if (!isNear) {
                if (n === page - 3 || n === page + 3) {
                  return <span key={n} style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}>…</span>
                }
                return null
              }
              return (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  style={{
                    background: n === page ? 'rgba(99,102,241,0.2)' : 'none',
                    border: n === page ? '1px solid rgba(99,102,241,0.5)' : '1px solid var(--border)',
                    borderRadius: 6,
                    color: n === page ? 'var(--accent)' : 'var(--text-secondary)',
                    fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px',
                    cursor: n === page ? 'default' : 'pointer',
                    fontWeight: n === page ? 700 : 400,
                    minWidth: 32,
                  }}
                >{n}</button>
              )
            })}

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 10px', cursor: page === totalPages ? 'default' : 'pointer',
                opacity: page === totalPages ? 0.4 : 1,
              }}
            >›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontFamily: 'IBM Plex Mono', fontSize: 11, padding: '4px 8px', cursor: page === totalPages ? 'default' : 'pointer',
                opacity: page === totalPages ? 0.4 : 1,
              }}
            >»</button>
          </div>
        )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 24, gap: 16,
          }}
        >
          <div onClick={e => e.stopPropagation()}>
            <AuthedImage
              src={lightbox.image_url}
              alt={lightbox.original_filename}
              style={{ maxWidth: '80vw', maxHeight: '65vh', objectFit: 'contain', borderRadius: 10, display: 'block' }}
            />
          </div>
          {lightbox.ai_analysis && (
            <div
              onClick={e => e.stopPropagation()}
              style={{
                maxWidth: 620, background: 'rgba(10,10,20,0.92)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px', fontSize: 13, color: 'var(--text-secondary)',
                lineHeight: 1.65, maxHeight: '22vh', overflowY: 'auto',
              }}
            >
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>— AI Analysis —</div>
              {lightbox.ai_analysis}
            </div>
          )}
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'fixed', top: 20, right: 24,
              background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export function CasePartner({ caseId, caseName, onWire, wiring }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hey, I'm up to speed on the case — "${caseName}". What are you thinking? What do you need from me right now?`
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [wireResult, setWireResult] = useState(null)
  const [showWire, setShowWire] = useState(false)
  const [compressedSummary, setCompressedSummary] = useState(null)
  const [showCompressed, setShowCompressed] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [loadingChat, setLoadingChat] = useState(true)
  const bottomRef = useRef(null)
  const COMPRESS_AT = 20

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, wireResult])

  // Load latest session from DB on caseId change
  useEffect(() => {
    if (!caseId) return
    setLoadingChat(true)
    setCompressedSummary(null)
    setShowCompressed(false)
    api.get(`/api/detective/cases/${caseId}/chat/latest-session`)
      .then(r => {
        setSessionId(r.data.session_id)
        const saved = r.data.messages || []
        if (saved.length > 0) {
          // Restore compressed summary if present
          const summary = saved.find(m => m.role === 'system-summary')
          if (summary) setCompressedSummary(summary.content)
          setMessages(saved)
        } else {
          setMessages([{ role: 'assistant', content: `Hey, I'm up to speed on the case — "${caseName}". What are you thinking? What do you need from me right now?` }])
        }
      })
      .catch(() => {
        setMessages([{ role: 'assistant', content: `Hey, I'm up to speed on the case — "${caseName}". What are you thinking? What do you need from me right now?` }])
      })
      .finally(() => setLoadingChat(false))
  }, [caseId])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    const history = [...messages]
    setMessages(m => [...m, { role: 'user', content: msg }])
    setLoading(true)
    try {
      // Build history: compressed summary context + last 8 raw messages
      const rawHistory = history.slice(-8)
      const r = await api.post(`/api/detective/cases/${caseId}/chat`, {
        message: msg,
        history: rawHistory,
        compressed_context: compressedSummary || null,
      })
      const assistantReply = r.data.response

      // Update UI
      setMessages(m => [...m, { role: 'assistant', content: assistantReply }])

      // Save to DB — outside setMessages so it always fires
      if (sessionId) {
        api.post(`/api/detective/cases/${caseId}/chat/messages`, {
          session_id: sessionId,
          messages: [
            { role: 'user', content: msg },
            { role: 'assistant', content: assistantReply },
          ]
        }).catch(() => {})
      }

      // Auto-compress when we hit the threshold
      const newCount = messages.length + 2 // user + assistant just added
      if (newCount >= COMPRESS_AT && !compressedSummary) {
        const toCompress = messages.slice(1, -5)
        if (toCompress.length >= 4) {
          api.post(`/api/detective/cases/${caseId}/chat/compress`, { messages: toCompress })
            .then(res => {
              const summaryMsg = { role: 'system-summary', content: res.data.summary }
              setCompressedSummary(res.data.summary)
              setMessages(curr => [curr[0], summaryMsg, ...curr.slice(-6)])
              // Persist summary sentinel
              if (sessionId) {
                api.post(`/api/detective/cases/${caseId}/chat/messages`, {
                  session_id: sessionId,
                  messages: [summaryMsg]
                }).catch(() => {})
              }
            })
            .catch(() => {})
        }
      }
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, I hit an error: ${e.response?.data?.detail || 'check your API key in Settings.'}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleWire = async () => {
    setShowWire(true)
    setWireResult(null)
    try {
      const r = await onWire()
      setWireResult(r)
    } catch {
      setWireResult({ error: true })
    }
  }

  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 520 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Case Partner</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>AI · reads your journal + case file · best friend mode</div>
          <button
            onClick={async () => {
              const r = await api.post(`/api/detective/cases/${caseId}/chat/session`)
              const newSessionId = r.data.session_id
              const greeting = `Hey, I'm up to speed on the case — "${caseName}". What are you thinking? What do you need from me right now?`
              // Save greeting so new session is persisted as latest on refresh
              await api.post(`/api/detective/cases/${caseId}/chat/messages`, {
                session_id: newSessionId,
                messages: [{ role: 'assistant', content: greeting }]
              }).catch(() => {})
              setSessionId(newSessionId)
              setCompressedSummary(null)
              setShowCompressed(false)
              setMessages([{ role: 'assistant', content: greeting }])
            }}
            title="Start a new chat session"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, color: 'var(--accent)', fontSize: 11, fontFamily: 'IBM Plex Mono', fontWeight: 600, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}
          >
            ＋ new chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loadingChat && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: 20, fontFamily: 'IBM Plex Mono' }}>
            Loading conversation…
          </div>
        )}
        {messages.map((m, i) => {
          // Compressed summary sentinel
          if (m.role === 'system-summary') {
            return (
              <div key={i} style={{ margin: '4px 0' }}>
                <button
                  onClick={() => setShowCompressed(s => !s)}
                  style={{
                    width: '100%', background: 'rgba(99,102,241,0.06)',
                    border: '1px dashed rgba(99,102,241,0.25)', borderRadius: 8,
                    padding: '7px 12px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11 }}>📋</span>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'rgba(99,102,241,0.7)', flex: 1, textAlign: 'left' }}>
                    Earlier conversation compressed
                  </span>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-muted)' }}>
                    {showCompressed ? '▲ hide' : '▼ show'}
                  </span>
                </button>
                {showCompressed && (
                  <div style={{
                    marginTop: 6, padding: '10px 14px',
                    background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.15)',
                    borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}>
                    {m.content}
                  </div>
                )}
              </div>
            )
          }
          return (
            <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 10, alignItems: 'flex-start' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🕵️</div>
              )}
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user' ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
                border: '1px solid ' + (m.role === 'user' ? 'rgba(99,102,241,0.3)' : 'var(--border)'),
                fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          )
        })}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🕵️</div>
            <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Wire result */}
        {showWire && (
          <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>📡</span>
              <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>WIRE DROPPED — Case Briefing</span>
            </div>
            {!wireResult ? (
              <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>Compiling full case intelligence…</div>
            ) : wireResult.error ? (
              <div style={{ fontSize: 12, color: '#ef4444' }}>Wire failed. Check your API key in Settings.</div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{wireResult.briefing}</div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Drop a Wire button */}
        <button
          onClick={handleWire}
          disabled={wiring}
          style={{
            width: '100%', padding: '9px 0', background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))',
            border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8,
            color: 'var(--accent)', fontSize: 12, fontWeight: 700, fontFamily: 'Syne',
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: wiring ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s', opacity: wiring ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!wiring) { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(168,85,247,0.35))'; e.currentTarget.style.boxShadow = '0 0 18px rgba(99,102,241,0.25)' } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))'; e.currentTarget.style.boxShadow = 'none' }}
        >
          📡 {wiring ? 'Dropping Wire…' : 'Drop a Wire'}
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Talk to your Case Partner…"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? 'rgba(99,102,241,0.2)' : 'var(--accent)',
              border: 'none', borderRadius: 8, color: '#fff', fontSize: 13,
              padding: '8px 14px', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            ↑
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ── Admin Panel (owner only) ─────────────────────────────────────────────────
function AdminPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(null)

  const load = async () => {
    try {
      const r = await api.get('/api/detective/admin/users')
      setUsers(r.data)
    } catch { }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggle = async (u) => {
    setToggling(u.id)
    try {
      if (u.has_access) {
        await api.delete(`/api/detective/admin/revoke/${u.id}`)
      } else {
        await api.post('/api/detective/admin/grant', { user_id: u.id })
      }
      await load()
    } catch { }
    setToggling(null)
  }

  return (
    <div style={{ ...card, padding: 20, maxWidth: 560 }}>
      <div style={{ ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>— Detective Access — Users —</div>
      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
      ) : users.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No non-owner users found.</div>
      ) : users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>
            {u.username[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{u.username}</div>
            <div style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>{u.role}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...mono, fontSize: 11, color: u.has_access ? '#22c55e' : 'var(--text-muted)' }}>
              {u.has_access ? '✓ granted' : '✗ no access'}
            </span>
            <button
              onClick={() => toggle(u)}
              disabled={toggling === u.id}
              style={{
                background: u.has_access ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${u.has_access ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                borderRadius: 6, color: u.has_access ? '#ef4444' : '#22c55e',
                fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '4px 12px', cursor: 'pointer',
                opacity: toggling === u.id ? 0.5 : 1,
              }}
            >
              {toggling === u.id ? '…' : u.has_access ? 'Revoke' : 'Grant'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Mobile Case Creator ─────────────────────────────────────────────────────
function MobileCaseCreator({ onCreate, creating }) {
  const [show, setShow] = useState(false)
  const [title, setTitle] = useState('')

  const submit = async () => {
    if (!title.trim()) return
    await onCreate(title.trim())
    setTitle('')
    setShow(false)
  }

  if (!show) return (
    <button
      onClick={() => setShow(true)}
      style={{
        marginTop: 8, width: '100%', background: 'rgba(99,102,241,0.1)',
        border: '1px dashed rgba(99,102,241,0.35)', borderRadius: 8,
        padding: '8px 12px', color: 'var(--accent)', fontSize: 12,
        fontFamily: 'IBM Plex Mono', cursor: 'pointer',
      }}
    >+ New Case</button>
  )

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Case name..."
        style={{
          flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)', borderRadius: 8,
          padding: '8px 12px', color: 'var(--text-primary)',
          fontSize: 12, outline: 'none',
        }}
      />
      <button
        onClick={submit}
        disabled={creating}
        style={{
          background: 'var(--accent)', border: 'none', borderRadius: 8,
          color: '#fff', fontSize: 12, padding: '8px 14px',
          cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.5 : 1,
        }}
      >{creating ? '…' : 'Create'}</button>
      <button
        onClick={() => setShow(false)}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12, padding: '8px 10px', cursor: 'pointer' }}
      >✕</button>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Detective() {
  const [access, setAccess] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [cases, setCases] = useState([])
  const [selectedCase, setSelectedCase] = useState(null)
  const [entries, setEntries] = useState([])
  const [uploads, setUploads] = useState([])
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [wiring, setWiring] = useState(false)
  const [activeTab, setActiveTab] = useState('log')
  const [adminTab, setAdminTab] = useState(false)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [casesOpen, setCasesOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [casePartnerOpen, setCasePartnerOpen] = useState(false)
  const [warRoomContent, setWarRoomContent] = useState('')

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  const navigate = useNavigate()

  // ── Access check ──
  useEffect(() => {
    api.get('/api/detective/access')
      .then(r => {
        setAccess(r.data.has_access)
        setIsOwner(r.data.role === 'owner')
      })
      .catch(() => setAccess(false))
  }, [])

  // ── Cases ──
  useEffect(() => {
    if (access) loadCases()
  }, [access])

  // ── War Room: match existing case + pre-fill log entry ──
  useEffect(() => {
    if (!access || cases.length === 0) return
    const item = window.history.state?.usr?.warRoomItem
    if (!item) return
    const haystack = ((item.why || '') + ' ' + (item.title || '')).toLowerCase()
    const match = cases.find(c => haystack.includes(c.title.toLowerCase()))
    if (match) selectCase(match)
    setWarRoomContent(item.why || item.title || '')
  }, [access, cases])

  const loadCases = async () => {
    try {
      const r = await api.get('/api/detective/cases')
      setCases(r.data)
      if (r.data.length > 0 && !selectedCase) setSelectedCase(r.data[0])
    } catch { }
  }

  const selectCase = (c) => {
    setSelectedCase(c)
    setEntries([])
    setUploads([])
    setActiveTab('log')
  }

  // ── Entries ──
  useEffect(() => {
    if (selectedCase) {
      loadEntries()
      loadUploads()
    }
  }, [selectedCase])

  const loadEntries = async () => {
    setLoadingEntries(true)
    try {
      const r = await api.get(`/api/detective/cases/${selectedCase.id}/entries`)
      setEntries(r.data)
    } catch { }
    setLoadingEntries(false)
  }

  const loadUploads = async () => {
    try {
      const r = await api.get(`/api/detective/cases/${selectedCase.id}/uploads`)
      setUploads(r.data)
    } catch { }
  }

  const addEntry = async (data) => {
    try {
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/entries`, data)
      setEntries(e => [r.data, ...e])
      return r.data
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to add entry.')
    }
  }

  const updateEntryAttachment = (entryId, attachData) => {
    setEntries(es => es.map(e => e.id === entryId ? { ...e, ...attachData } : e))
  }

  const updateEntryPhotos = (entryId, photoData, action) => {
    setEntries(es => es.map(e => {
      if (e.id !== entryId) return e
      if (action === 'add') {
        return { ...e, photos: [...(e.photos || []), photoData] }
      }
      if (action === 'delete') {
        return { ...e, photos: (e.photos || []).filter(p => p.id !== photoData.id) }
      }
      return e
    }))
  }

  const deleteEntry = async (entryId) => {
    try {
      await api.delete(`/api/detective/cases/${selectedCase.id}/entries/${entryId}`)
      setEntries(e => e.filter(x => x.id !== entryId))
    } catch { }
  }

  const uploadPhoto = async (file) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setUploads(u => [r.data, ...u])
    } catch (e) {
      alert(e.response?.data?.detail || 'Upload failed.')
    }
    setUploading(false)
  }

  const deleteUpload = async (upload) => {
    const item = typeof upload === 'object' ? upload : { id: upload, source: 'upload' }
    try {
      if (item.source === 'multi_entry') {
        const photoId = String(item.id).replace('mphoto_', '')
        // Use the direct endpoint — entry may be deleted (orphaned photo), so don't rely on entry_id
        await api.delete(`/api/detective/cases/${selectedCase.id}/entry-photos/${photoId}`)
      } else {
        await api.delete(`/api/detective/cases/${selectedCase.id}/uploads/${item.id}`)
      }
      setUploads(u => u.filter(x => x.id !== item.id))
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete photo. Try refreshing.')
    }
  }

  const dropWire = async () => {
    setWiring(true)
    try {
      const r = await api.post(`/api/detective/cases/${selectedCase.id}/wire`)
      return r.data
    } finally {
      setWiring(false)
    }
  }

  const createCase = async (title) => {
    setCreating(true)
    try {
      const r = await api.post('/api/detective/cases', { title })
      setCases(c => [r.data, ...c])
      setSelectedCase(r.data)
    } catch { }
    setCreating(false)
  }

  if (access === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Checking access…</div>
      </div>
    )
  }

  if (!access) return <AccessDenied />

  const TABS = [
    { key: 'log',     label: '◷ Investigation Log' },
    { key: 'photos',  label: '📷 Photo Evidence'  },
    { key: 'gallery', label: '🖼 Gallery'           },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PageHeader
        title="Detective Mode"
        subtitle={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => navigate('/detective/full')}
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 6, color: 'var(--accent)', fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '3px 10px', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              ⬡ Full Workspace
            </button>
            {isOwner && (
              <button
                onClick={() => setAdminTab(s => !s)}
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 6, color: 'var(--accent)', fontSize: 11, fontFamily: 'IBM Plex Mono', padding: '3px 10px', cursor: 'pointer' }}
              >
                {adminTab ? '← Back' : '⊙ Manage Access'}
              </button>
            )}
          </div>
        }
      />
      <WarRoomContextBanner />

      {adminTab ? (
        <AdminPanel />
      ) : (
        <>
        {/* Top nav bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '10px 20px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === t.key ? 600 : 400,
                color: activeTab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (activeTab !== t.key) e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { if (activeTab !== t.key) e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mobile case picker */}
        {isMobile && (
          <div style={{ marginBottom: 12 }}>
            <select
              value={selectedCase?.id ?? ''}
              onChange={e => {
                const c = cases.find(x => x.id === parseInt(e.target.value))
                if (c) selectCase(c)
              }}
              style={{
                width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '9px 12px', color: 'var(--text-primary)',
                fontFamily: 'IBM Plex Mono', fontSize: 12, outline: 'none', cursor: 'pointer',
              }}
            >
              {cases.length === 0 && <option value="">No cases yet</option>}
              {cases.map(c => (
                <option key={c.id} value={c.id}>{c.status === 'active' ? '● ' : '○ '}{c.title}</option>
              ))}
            </select>
            <MobileCaseCreator onCreate={createCase} creating={creating} />
          </div>
        )}

        <div style={isMobile ? {
          display: 'flex', flexDirection: 'column', gap: 12, flex: 1,
        } : {
          display: 'grid',
          gridTemplateColumns: casesOpen
            ? (activeTab === 'gallery' ? '220px 1fr' : '220px 1fr 360px')
            : (activeTab === 'gallery' ? '40px 1fr' : '40px 1fr 360px'),
          gap: 16,
          flex: 1,
          minHeight: 0,
          height: 'calc(100vh - 120px)',
          transition: 'grid-template-columns 0.2s ease',
        }}>
          {/* Left: Case list (collapsible, desktop only) */}
          {isMobile ? null :
          <div style={{ minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            {casesOpen ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CaseList
                  cases={cases}
                  selected={selectedCase}
                  onSelect={selectCase}
                  onCreate={createCase}
                  creating={creating}
                />
                <button
                  onClick={() => setCasesOpen(false)}
                  title="Collapse cases"
                  style={{ marginTop: 8, width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 11, padding: '5px 0', cursor: 'pointer', fontFamily: 'IBM Plex Mono', letterSpacing: '0.05em' }}
                >
                  ◀ collapse
                </button>
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <button
                  onClick={() => setCasesOpen(true)}
                  title="Expand cases"
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 16, cursor: 'pointer', padding: 4 }}
                >
                  ▶
                </button>
                {cases.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { selectCase(c); setCasesOpen(true) }}
                    title={c.title}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: selectedCase?.id === c.id ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, color: c.status === 'active' ? '#22c55e' : 'var(--text-muted)' }}
                  >
                    ●
                  </div>
                ))}
              </div>
            )}
          </div>}

          {/* Center: Investigation workspace */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
            {!selectedCase ? (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Select or create a case to start investigating.
              </div>
            ) : (
              <>
                {/* Case header */}
                <div style={{ ...card, padding: '14px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div>
                    <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{selectedCase.title}</div>
                    {selectedCase.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selectedCase.description}</div>
                    )}
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ ...mono, fontSize: 10, color: selectedCase.status === 'active' ? '#22c55e' : 'var(--text-muted)', textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '3px 8px' }}>
                    ● {selectedCase.status}
                  </span>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--text-muted)' }}>{entries.length} entries · {uploads.length} photos</span>
                </div>

                {activeTab === 'log' && (
                  <InvestigationLog
                    caseId={selectedCase.id}
                    entries={entries}
                    onAdd={addEntry}
                    onDelete={deleteEntry}
                    onAttachmentUpdate={updateEntryAttachment}
                    onPhotosUpdate={updateEntryPhotos}
                    loading={loadingEntries}
                    initialContent={warRoomContent}
                  />
                )}
                {activeTab === 'photos' && (
                  <PhotoEvidence
                    caseId={selectedCase.id}
                    uploads={uploads}
                    onUpload={uploadPhoto}
                    onDelete={deleteUpload}
                    uploading={uploading}
                  />
                )}
                {activeTab === 'gallery' && (
                  <GalleryView
                    caseId={selectedCase.id}
                    uploads={uploads}
                    onDelete={deleteUpload}
                  />
                )}
              </>
            )}
          </div>

          {/* Right: Case Partner (desktop only) */}
          {!isMobile && activeTab !== 'gallery' && <div style={{ minHeight: 0 }}>
            {selectedCase ? (
              <CasePartner
                caseId={selectedCase.id}
                caseName={selectedCase.title}
                onWire={dropWire}
                wiring={wiring}
              />
            ) : (
              <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🕵️</div>
                Select a case to talk to your Case Partner.
              </div>
            )}
          </div>}
        </div>

        {/* Mobile: collapsible Case Partner */}
        {isMobile && activeTab !== 'gallery' && selectedCase && (
          <div style={{ marginTop: 4 }}>
            <button
              onClick={() => setCasePartnerOpen(o => !o)}
              style={{
                width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: casePartnerOpen ? '10px 10px 0 0' : 10,
                padding: '11px 16px', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontFamily: 'Syne',
              }}
            >
              <span>🕵️ Case Partner</span>
              <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)' }}>
                {casePartnerOpen ? '▲ collapse' : '▼ open'}
              </span>
            </button>
            {casePartnerOpen && (
              <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                <CasePartner
                  caseId={selectedCase.id}
                  caseName={selectedCase.title}
                  onWire={dropWire}
                  wiring={wiring}
                />
              </div>
            )}
          </div>
        )}
        </>
      )}
    </div>
  )
}
