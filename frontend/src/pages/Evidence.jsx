import { useState, useEffect } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'
import { useAuth } from '../contexts/AuthContext'

const TYPE_COLORS = {
  statement: '#6366f1',
  event: '#10b981',
  admission: '#f59e0b',
  contradiction: '#ef4444',
  observation: '#8b5cf6',
}

const TYPES = ['statement', 'event', 'admission', 'contradiction', 'observation']
const PAGE_SIZE = 30

const EMPTY_FORM = {
  label: '',
  quote_text: '',
  evidence_type: 'statement',
  source_date: new Date().toISOString().slice(0, 10),
  is_bookmarked: false,
}

export default function Evidence() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('')
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(30)
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: 500 })
      if (filter) params.set('evidence_type', filter)
      if (bookmarkedOnly) params.set('bookmarked_only', 'true')
      const r = await api.get(`/api/evidence?${params}`)
      setItems(r.data.evidence || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter, bookmarkedOnly])
  useEffect(() => { setPage(1) }, [filter, bookmarkedOnly, search, pageSize])

  // Client-side search
  const filtered = search.trim()
    ? items.filter(i =>
        i.label?.toLowerCase().includes(search.toLowerCase()) ||
        i.quote_text?.toLowerCase().includes(search.toLowerCase())
      )
    : items

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const deleteItem = async (id) => {
    if (!confirm('Remove this evidence item?')) return
    try { await api.delete(`/api/evidence/${id}`); load() } catch (e) { console.error(e) }
  }

  const toggleBookmark = async (item) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_bookmarked: !i.is_bookmarked } : i))
    try {
      await api.patch(`/api/evidence/${item.id}/bookmark`)
    } catch (e) {
      console.error(e)
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_bookmarked: item.is_bookmarked } : i))
    }
  }

  const submitAdd = async () => {
    if (!form.label.trim()) { setSaveError('Label is required.'); return }
    if (!form.source_date) { setSaveError('Date is required.'); return }
    setSaving(true)
    setSaveError('')
    try {
      await api.post('/api/evidence', {
        label: form.label.trim(),
        quote_text: form.quote_text.trim() || null,
        evidence_type: form.evidence_type,
        source_date: form.source_date,
        is_bookmarked: form.is_bookmarked,
      })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      setSaveError(e.response?.data?.detail || 'Save failed.')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 12, fontFamily: 'IBM Plex Mono',
    boxSizing: 'border-box',
  }

  return (
    <div>
      <PageHeader
        title="Evidence Vault"
        subtitle={`${filtered.length} items${totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}`}
        actions={isOwner ? (
          <button onClick={() => { setShowAdd(true); setSaveError('') }} style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid var(--accent)',
            background: 'var(--accent-glow)', color: 'var(--accent)',
            fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: 'pointer',
          }}>
            + Add Evidence
          </button>
        ) : null}
      />

      {/* Search + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="search labels and quotes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, maxWidth: 400 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {['', ...TYPES].map(t => (
            <button key={t || 'all'} onClick={() => setFilter(t)} style={{
              padding: '5px 12px', borderRadius: 6,
              border: `1px solid ${filter === t ? 'var(--border-bright)' : 'var(--border)'}`,
              background: filter === t ? 'var(--accent-glow)' : 'var(--bg-card)',
              color: filter === t ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: 'pointer', textTransform: 'capitalize',
            }}>
              {t || 'All'}
            </button>
          ))}
          <button onClick={() => setBookmarkedOnly(x => !x)} style={{
            padding: '5px 12px', borderRadius: 6,
            border: `1px solid ${bookmarkedOnly ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
            background: bookmarkedOnly ? 'rgba(245,158,11,0.1)' : 'var(--bg-card)',
            color: bookmarkedOnly ? '#f59e0b' : 'var(--text-secondary)',
            fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: 'pointer', marginLeft: 'auto',
          }}>
            ★ Bookmarked
          </button>
        </div>
      </div>

      {/* Add Evidence Modal */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: '100%', maxWidth: 480,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono' }}>
              Add Evidence
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>LABEL *</label>
              <input
                type="text"
                placeholder="e.g. Admitted lying about job loss"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>VERBATIM QUOTE (optional)</label>
              <textarea
                placeholder="Direct quote from journal or conversation..."
                value={form.quote_text}
                onChange={e => setForm(f => ({ ...f, quote_text: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>TYPE</label>
                <select
                  value={form.evidence_type}
                  onChange={e => setForm(f => ({ ...f, evidence_type: e.target.value }))}
                  style={inputStyle}
                >
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>DATE *</label>
                <input
                  type="date"
                  value={form.source_date}
                  onChange={e => setForm(f => ({ ...f, source_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_bookmarked}
                onChange={e => setForm(f => ({ ...f, is_bookmarked: e.target.checked }))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono' }}>Mark as bookmarked</span>
            </label>

            {saveError && (
              <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'IBM Plex Mono' }}>{saveError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{
                padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'none', color: 'var(--text-secondary)', fontSize: 11,
                fontFamily: 'IBM Plex Mono', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={submitAdd} disabled={saving} style={{
                padding: '7px 16px', borderRadius: 6, border: '1px solid var(--accent)',
                background: 'var(--accent-glow)', color: 'var(--accent)',
                fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'saving...' : 'Save Evidence'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
          loading evidence...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>
          {search ? 'no matches for that search' : 'no evidence items found'}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
            {paged.map(item => {
              const color = TYPE_COLORS[item.evidence_type] || '#6b7280'
              return (
                <div key={item.id} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontFamily: 'IBM Plex Mono', padding: '1px 6px',
                        borderRadius: 4, background: `${color}20`, color, border: `1px solid ${color}30`,
                        textTransform: 'capitalize',
                      }}>
                        {item.evidence_type}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
                        {item.source_date || item.entry_date}
                      </span>
                      <button
                        onClick={() => toggleBookmark(item)}
                        title={item.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                        style={{
                          padding: '2px 5px', background: 'none',
                          border: `1px solid ${item.is_bookmarked ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                          borderRadius: 4, color: item.is_bookmarked ? '#f59e0b' : 'var(--text-muted)',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        {item.is_bookmarked ? '★' : '☆'}
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => deleteItem(item.id)}
                          style={{
                            padding: '2px 6px', background: 'none',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 4, color: '#ef4444', fontSize: 10, cursor: 'pointer',
                          }}
                        >✕</button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                    {item.label}
                  </div>
                  {item.quote_text && (
                    <blockquote style={{
                      margin: 0, paddingLeft: 10,
                      borderLeft: `2px solid ${color}40`,
                      fontSize: 12, color: 'var(--text-secondary)',
                      lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      "{item.quote_text}"
                    </blockquote>
                  )}
                </div>
              )
            })}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: page === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: page === 1 ? 'not-allowed' : 'pointer',
                }}
              >← prev</button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: '5px 10px', borderRadius: 6, minWidth: 32,
                    border: `1px solid ${p === page ? 'var(--border-bright)' : 'var(--border)'}`,
                    background: p === page ? 'var(--accent-glow)' : 'var(--bg-card)',
                    color: p === page ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: 'pointer',
                  }}
                >{p}</button>
              ))}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-card)', color: page === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: 11, fontFamily: 'IBM Plex Mono', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                }}
              >next →</button>

              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{
                  marginLeft: 12, padding: '5px 8px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'IBM Plex Mono',
                  cursor: 'pointer',
                }}
              >
                {[10, 20, 30, 50, 100].map(n => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  )
}