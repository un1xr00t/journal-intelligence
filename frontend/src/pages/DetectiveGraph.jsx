/**
 * DetectiveGraph.jsx — pages/DetectiveGraph.jsx
 * Maltego-style link analysis graph for Detective Mode.
 * - Dot-grid canvas background (Maltego aesthetic)
 * - Icons embedded inside circular nodes via SVG background-image
 * - Connected edges & neighbor nodes highlight on selection
 * - Zoom controls (+/−/fit)
 * - AI extraction, manual add/edit/delete, drag-to-save positions
 */

import { useState, useEffect, useRef } from 'react'
import api from '../services/api'

// ── Entity type definitions ────────────────────────────────────────────────────

const ENTITY_TYPES = {
  person:   { label: 'Person',   icon: '👤', color: '#4f46e5', glow: 'rgba(79,70,229,0.6)',   border: '#818cf8' },
  location: { label: 'Location', icon: '📍', color: '#047857', glow: 'rgba(4,120,87,0.6)',    border: '#34d399' },
  org:      { label: 'Org',      icon: '🏢', color: '#b45309', glow: 'rgba(180,83,9,0.6)',    border: '#fbbf24' },
  event:    { label: 'Event',    icon: '📅', color: '#0369a1', glow: 'rgba(3,105,161,0.6)',   border: '#38bdf8' },
  evidence: { label: 'Evidence', icon: '📦', color: '#9d174d', glow: 'rgba(157,23,77,0.6)',   border: '#f472b6' },
}

const REL_TYPES = [
  { value: 'related',   label: 'Related to'   },
  { value: 'contacted', label: 'Contacted'     },
  { value: 'was_at',    label: 'Was at'        },
  { value: 'works_for', label: 'Works for'     },
  { value: 'knows',     label: 'Knows'         },
  { value: 'sent',      label: 'Sent to'       },
  { value: 'received',  label: 'Received from' },
  { value: 'owns',      label: 'Owns'          },
  { value: 'witnessed', label: 'Witnessed'     },
]

// SVG data-URI icon for inside each node
const makeSvgIcon = (emoji) => {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'><text x='30' y='42' text-anchor='middle' font-size='28' font-family='Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,system-ui'>${emoji}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const mono = { fontFamily: 'IBM Plex Mono' }
const syne = { fontFamily: 'Syne' }

const pill = (active, color = '#6366f1') => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '4px 12px',
  background: active ? `${color}28` : 'rgba(255,255,255,0.04)',
  border: `1px solid ${active ? `${color}88` : 'rgba(255,255,255,0.08)'}`,
  borderRadius: 20, fontSize: 11, cursor: 'pointer',
  color: active ? '#fff' : 'rgba(255,255,255,0.4)',
  transition: 'all 0.15s', userSelect: 'none',
})

const btn = (variant = 'default', disabled = false) => ({
  padding: '7px 14px',
  background: disabled ? 'rgba(255,255,255,0.03)'
    : variant === 'primary' ? 'rgba(99,102,241,0.2)'
    : variant === 'danger'  ? 'rgba(239,68,68,0.15)'
    : 'rgba(255,255,255,0.06)',
  border: `1px solid ${
    disabled            ? 'rgba(255,255,255,0.06)'
    : variant === 'primary' ? 'rgba(99,102,241,0.5)'
    : variant === 'danger'  ? 'rgba(239,68,68,0.4)'
    : 'rgba(255,255,255,0.1)'}`,
  borderRadius: 7,
  color: disabled            ? 'rgba(255,255,255,0.25)'
    : variant === 'primary' ? '#a5b4fc'
    : variant === 'danger'  ? '#f87171'
    : 'rgba(255,255,255,0.7)',
  fontSize: 11, fontFamily: 'IBM Plex Mono',
  cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s', whiteSpace: 'nowrap',
  opacity: disabled ? 0.6 : 1,
})

const fieldSty = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 7, color: '#e0e7ff',
  padding: '8px 12px', fontSize: 12,
  fontFamily: 'inherit', outline: 'none',
}

const lbl = {
  fontSize: 10, ...mono, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'rgba(165,180,252,0.55)',
  marginBottom: 5, display: 'block',
}

// ── Add Entity Modal ───────────────────────────────────────────────────────────

function AddEntityModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ label: '', entity_type: 'person', notes: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.label.trim()) return
    setSaving(true)
    await onAdd(form)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0a0a1a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, width: '100%', maxWidth: 420, padding: 28, display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 30px 90px rgba(0,0,0,0.8)' }}>
        <div style={{ ...syne, fontWeight: 700, fontSize: 16, color: '#e0e7ff' }}>Add Entity</div>
        <div>
          <label style={lbl}>Label / Name</label>
          <input autoFocus value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. Angelina, Andrew, 456 Oak St" style={fieldSty} />
        </div>
        <div>
          <label style={lbl}>Type</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(ENTITY_TYPES).map(([key, def]) => (
              <button key={key} onClick={() => setForm(f => ({ ...f, entity_type: key }))} style={pill(form.entity_type === key, def.color)}>
                {def.icon} {def.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>Notes (optional)</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Brief context" style={fieldSty} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn()}>Cancel</button>
          <button onClick={submit} disabled={saving || !form.label.trim()} style={btn('primary', saving || !form.label.trim())}>
            {saving ? 'Adding…' : '+ Add Entity'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Relationship Modal ─────────────────────────────────────────────────────

function AddRelModal({ entities, onAdd, onClose }) {
  const [form, setForm] = useState({ source_id: '', target_id: '', label: '', rel_type: 'related' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.source_id || !form.target_id) return
    setSaving(true)
    await onAdd(form)
    setSaving(false)
  }

  const sel = {
    ...fieldSty, appearance: 'none', paddingRight: 32,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#0a0a1a', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 14, width: '100%', maxWidth: 440, padding: 28, display: 'flex', flexDirection: 'column', gap: 20, boxShadow: '0 30px 90px rgba(0,0,0,0.8)' }}>
        <div style={{ ...syne, fontWeight: 700, fontSize: 16, color: '#e0e7ff' }}>Add Link</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={lbl}>From</label>
            <select value={form.source_id} onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))} style={sel}>
              <option value="">Select…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{ENTITY_TYPES[e.entity_type]?.icon} {e.label}</option>)}
            </select>
          </div>
          <div style={{ paddingBottom: 10, color: 'rgba(165,180,252,0.4)', fontSize: 20, textAlign: 'center' }}>→</div>
          <div>
            <label style={lbl}>To</label>
            <select value={form.target_id} onChange={e => setForm(f => ({ ...f, target_id: e.target.value }))} style={sel}>
              <option value="">Select…</option>
              {entities.map(e => <option key={e.id} value={e.id}>{ENTITY_TYPES[e.entity_type]?.icon} {e.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Relationship type</label>
          <select value={form.rel_type} onChange={e => setForm(f => ({ ...f, rel_type: e.target.value }))} style={sel}>
            {REL_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Custom label (optional)</label>
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder='e.g. "called 14x", "seen together 3/12"' style={fieldSty} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btn()}>Cancel</button>
          <button onClick={submit} disabled={saving || !form.source_id || !form.target_id} style={btn('primary', saving || !form.source_id || !form.target_id)}>
            {saving ? 'Adding…' : '+ Add Link'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Node / edge detail panel ───────────────────────────────────────────────────

function NodePanel({ selected, entities, relationships, onSave, onDelete, onDeleteEdge, onClose }) {
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    setEditing(selected?.type === 'entity' ? { ...selected.data } : null)
  }, [selected])

  if (!selected) return null

  const panelSty = {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 290,
    background: 'rgba(6,5,18,0.97)',
    borderLeft: '1px solid rgba(99,102,241,0.18)',
    display: 'flex', flexDirection: 'column', zIndex: 100,
    boxShadow: '-20px 0 60px rgba(0,0,0,0.6)',
  }

  const hdr = { padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }
  const xBtn = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 2 }

  if (selected.type === 'edge') {
    const rel = selected.data
    const src = entities.find(e => e.id === rel.source_id)
    const tgt = entities.find(e => e.id === rel.target_id)
    const sd  = ENTITY_TYPES[src?.entity_type] || ENTITY_TYPES.person
    const td  = ENTITY_TYPES[tgt?.entity_type] || ENTITY_TYPES.person
    return (
      <div style={panelSty}>
        <div style={hdr}>
          <span style={{ ...mono, fontSize: 10, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Link</span>
          <button onClick={onClose} style={xBtn}>✕</button>
        </div>
        <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{sd.icon}</div>
              <div style={{ fontSize: 11, color: '#e0e7ff', fontWeight: 600, wordBreak: 'break-word' }}>{src?.label}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ ...mono, fontSize: 9, color: '#a5b4fc', textAlign: 'center', maxWidth: 64, wordBreak: 'break-word' }}>{rel.label || rel.rel_type}</div>
              <div style={{ color: 'rgba(165,180,252,0.4)', fontSize: 20 }}>→</div>
            </div>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{td.icon}</div>
              <div style={{ fontSize: 11, color: '#e0e7ff', fontWeight: 600, wordBreak: 'break-word' }}>{tgt?.label}</div>
            </div>
          </div>
          <div>
            <div style={lbl}>Type</div>
            <div style={{ fontSize: 12, color: '#a5b4fc' }}>{rel.rel_type}</div>
          </div>
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => onDeleteEdge(rel.id)} style={{ ...btn('danger'), width: '100%', display: 'flex', justifyContent: 'center' }}>🗑 Delete Link</button>
        </div>
      </div>
    )
  }

  if (selected.type === 'entity' && editing) {
    const def      = ENTITY_TYPES[editing.entity_type] || ENTITY_TYPES.person
    const connRels = relationships.filter(r => r.source_id === editing.id || r.target_id === editing.id)
    return (
      <div style={panelSty}>
        <div style={hdr}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{def.icon}</span>
            <span style={{ ...mono, fontSize: 10, color: def.border, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{def.label}</span>
          </div>
          <button onClick={onClose} style={xBtn}>✕</button>
        </div>
        <div style={{ padding: 18, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={lbl}>Name / Label</label>
            <input value={editing.label} onChange={e => setEditing(ed => ({ ...ed, label: e.target.value }))} style={fieldSty} />
          </div>
          <div>
            <label style={lbl}>Type</label>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {Object.entries(ENTITY_TYPES).map(([key, d]) => (
                <button key={key} onClick={() => setEditing(ed => ({ ...ed, entity_type: key }))} style={pill(editing.entity_type === key, d.color)}>
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea value={editing.notes || ''} onChange={e => setEditing(ed => ({ ...ed, notes: e.target.value }))}
              rows={3} style={{ ...fieldSty, resize: 'vertical', lineHeight: 1.6 }} placeholder="Case context…" />
          </div>
          {connRels.length > 0 && (
            <div>
              <label style={lbl}>Connections ({connRels.length})</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {connRels.map(r => {
                  const othId = r.source_id === editing.id ? r.target_id : r.source_id
                  const oth   = entities.find(e => e.id === othId)
                  const od    = ENTITY_TYPES[oth?.entity_type] || ENTITY_TYPES.person
                  const dir   = r.source_id === editing.id ? '→' : '←'
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 9px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ color: '#a5b4fc', fontSize: 13 }}>{dir}</span>
                      <span>{od.icon}</span>
                      <span style={{ color: '#e0e7ff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oth?.label}</span>
                      <span style={{ color: '#a5b4fc', fontSize: 9, flexShrink: 0 }}>{r.label || r.rel_type}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => onSave(editing)} style={{ ...btn('primary'), width: '100%', display: 'flex', justifyContent: 'center' }}>Save Changes</button>
          <button onClick={() => onDelete(editing.id)} style={{ ...btn('danger'), width: '100%', display: 'flex', justifyContent: 'center' }}>🗑 Delete Entity</button>
        </div>
      </div>
    )
  }
  return null
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 10, background: 'rgba(6,5,18,0.88)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ ...mono, fontSize: 8, color: 'rgba(165,180,252,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Node Types</div>
      {Object.entries(ENTITY_TYPES).map(([key, def]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: def.color, border: `1.5px solid ${def.border}`, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'rgba(224,231,255,0.55)' }}>{def.icon} {def.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DetectiveGraph({ caseId }) {
  const containerRef = useRef(null)
  const cyRef        = useRef(null)
  const posTimer     = useRef(null)

  const [entities,      setEntities]      = useState([])
  const [relationships, setRelationships] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [extracting,    setExtracting]    = useState(false)
  const [extractMsg,    setExtractMsg]    = useState(null)
  const [selected,      setSelected]      = useState(null)
  const [addEntityOpen, setAddEntityOpen] = useState(false)
  const [addRelOpen,    setAddRelOpen]    = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get(`/api/detective/cases/${caseId}/graph`)
      setEntities(r.data.entities)
      setRelationships(r.data.relationships)
    } catch (e) { console.error('[DetectiveGraph] load error', e) }
    setLoading(false)
  }

  useEffect(() => { if (caseId) load() }, [caseId])

  // ── Cytoscape init ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current || loading) return
    if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null }

    import('cytoscape').then(({ default: cytoscape }) => {
      if (!containerRef.current) return

      const hasPos = entities.some(e => e.x_pos != null)

      const nodes = entities.map(e => {
        const def  = ENTITY_TYPES[e.entity_type] || ENTITY_TYPES.person
        const node = {
          data: {
            id:         String(e.id),
            label:      e.label,
            nodeColor:  def.color,
            nodeBorder: def.border,
            iconUrl:    makeSvgIcon(def.icon),
          },
        }
        if (hasPos && e.x_pos != null) node.position = { x: e.x_pos, y: e.y_pos }
        return node
      })

      const edges = relationships.map(r => ({
        data: {
          id:     `e${r.id}`,
          source: String(r.source_id),
          target: String(r.target_id),
          label:  r.label || r.rel_type.replace(/_/g, ' '),
          rel_id: r.id,
        },
      }))

      const cy = cytoscape({
        container: containerRef.current,
        elements:  { nodes, edges },
        style: [
          {
            selector: 'node',
            style: {
              shape:                    'ellipse',
              width:                    60,
              height:                   60,
              'background-color':       'data(nodeColor)',
              'background-opacity':     0.9,
              'background-image':       'data(iconUrl)',
              'background-fit':         'none',
              'background-width':       '62%',
              'background-height':      '62%',
              'background-position-x':  '50%',
              'background-position-y':  '44%',
              'background-clip':        'none',
              'border-width':           3,
              'border-color':           'data(nodeBorder)',
              'border-opacity':         0.85,
              label:                    'data(label)',
              color:                    '#c7d2fe',
              'font-size':              10,
              'font-family':            'IBM Plex Mono, monospace',
              'text-valign':            'bottom',
              'text-halign':            'center',
              'text-margin-y':          8,
              'text-max-width':         '90px',
              'text-wrap':              'ellipsis',
              'text-background-color':  '#03030d',
              'text-background-opacity': 0.9,
              'text-background-padding': '3px',
              'text-background-shape':   'round-rectangle',
            },
          },
          {
            selector: 'node:selected',
            style: {
              'border-color':    '#ffffff',
              'border-width':    4,
              'border-opacity':  1,
              'background-opacity': 1,
            },
          },
          {
            selector: 'node.neighbor',
            style: {
              'border-color':   '#ffffff',
              'border-width':   2.5,
              'border-opacity': 0.45,
            },
          },
          {
            selector: 'node.dimmed',
            style: { opacity: 0.2 },
          },
          {
            selector: 'node:grabbed',
            style: { 'border-color': '#fbbf24', 'border-width': 4, 'border-opacity': 1 },
          },
          {
            selector: 'edge',
            style: {
              width:                    2,
              'line-color':             'rgba(148,163,184,0.3)',
              'target-arrow-color':     'rgba(148,163,184,0.55)',
              'target-arrow-shape':     'triangle',
              'arrow-scale':            0.85,
              'curve-style':            'bezier',
              'control-point-step-size': 40,
              label:                    'data(label)',
              'font-size':              9,
              'font-family':            'IBM Plex Mono, monospace',
              color:                    'rgba(148,163,184,0.65)',
              'text-background-color':  '#03030d',
              'text-background-opacity': 0.85,
              'text-background-padding': '2px',
              'text-rotation':           'autorotate',
              'text-margin-y':          -7,
            },
          },
          {
            selector: 'edge.highlighted',
            style: {
              'line-color':         'rgba(165,180,252,0.8)',
              'target-arrow-color': 'rgba(165,180,252,0.8)',
              width:                2.8,
              color:                '#a5b4fc',
              'z-index':            10,
            },
          },
          {
            selector: 'edge.dimmed',
            style: { opacity: 0.08 },
          },
          {
            selector: 'edge:selected',
            style: {
              'line-color':         '#a5b4fc',
              'target-arrow-color': '#a5b4fc',
              width:                3.2,
              color:                '#a5b4fc',
            },
          },
        ],

        layout: hasPos
          ? { name: 'preset' }
          : {
              name:             'cose',
              idealEdgeLength:  180,
              nodeOverlap:      30,
              refresh:          20,
              fit:              true,
              padding:          60,
              randomize:        false,
              componentSpacing: 150,
              nodeRepulsion:    650000,
              edgeElasticity:   75,
              nestingFactor:    5,
              gravity:          55,
              numIter:          1200,
              initialTemp:      250,
              coolingFactor:    0.95,
              minTemp:          1.0,
            },

        wheelSensitivity: 0.25,
        minZoom:          0.05,
        maxZoom:          6,
        userZoomingEnabled:  true,
        userPanningEnabled:  true,
        boxSelectionEnabled: false,
      })

      // ── Selection neighborhood highlight ─────────────────────────────

      cy.on('select', 'node', e => {
        const n   = e.target
        const nb  = n.neighborhood('node')
        const ce  = n.connectedEdges()
        cy.nodes().not(n).not(nb).addClass('dimmed')
        cy.edges().not(ce).addClass('dimmed')
        nb.addClass('neighbor')
        ce.addClass('highlighted').removeClass('dimmed')
      })

      cy.on('unselect', 'node', () => {
        cy.elements().removeClass('neighbor highlighted dimmed')
      })

      cy.on('tap', 'node', e => {
        const ent = entities.find(x => String(x.id) === e.target.id())
        if (ent) setSelected({ type: 'entity', data: ent })
      })

      cy.on('tap', 'edge', e => {
        cy.elements().removeClass('neighbor highlighted dimmed')
        const rel = relationships.find(x => x.id === e.target.data('rel_id'))
        if (rel) setSelected({ type: 'edge', data: rel })
      })

      cy.on('tap', e => {
        if (e.target === cy) {
          cy.elements().removeClass('neighbor highlighted dimmed')
          setSelected(null)
        }
      })

      cy.on('dragfree', 'node', e => {
        const pos = e.target.position()
        const eid = parseInt(e.target.id())
        clearTimeout(posTimer.current)
        posTimer.current = setTimeout(() => {
          api.put(`/api/detective/cases/${caseId}/graph/entities/${eid}`, {
            x_pos: Math.round(pos.x),
            y_pos: Math.round(pos.y),
          }).catch(() => {})
        }, 600)
      })

      cyRef.current = cy
    })

    return () => {
      clearTimeout(posTimer.current)
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null }
    }
  }, [entities, relationships, loading])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    setExtracting(true); setExtractMsg(null)
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/graph/extract`)
      setEntities(r.data.entities)
      setRelationships(r.data.relationships)
      setExtractMsg(`+ ${r.data.added_entities} entities · ${r.data.added_relationships} links`)
    } catch (e) {
      setExtractMsg(e.response?.data?.detail || 'Extraction failed — check your API key.')
    }
    setExtracting(false)
    setTimeout(() => setExtractMsg(null), 6000)
  }

  const handleAddEntity = async (form) => {
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/graph/entities`, { label: form.label.trim(), entity_type: form.entity_type, notes: form.notes.trim() || null })
      setEntities(e => [...e, r.data])
      setAddEntityOpen(false)
    } catch (e) { alert(e.response?.data?.detail || 'Failed.') }
  }

  const handleAddRel = async (form) => {
    try {
      const r = await api.post(`/api/detective/cases/${caseId}/graph/relationships`, { source_id: parseInt(form.source_id), target_id: parseInt(form.target_id), label: form.label.trim() || null, rel_type: form.rel_type })
      setRelationships(rs => [...rs, r.data])
      setAddRelOpen(false)
    } catch (e) { alert(e.response?.data?.detail || 'Failed.') }
  }

  const handleSaveEntity = async (editing) => {
    try {
      const r = await api.put(`/api/detective/cases/${caseId}/graph/entities/${editing.id}`, { label: editing.label, entity_type: editing.entity_type, notes: editing.notes })
      setEntities(es => es.map(e => e.id === r.data.id ? r.data : e))
      setSelected({ type: 'entity', data: r.data })
    } catch (e) { alert(e.response?.data?.detail || 'Failed.') }
  }

  const handleDeleteEntity = async (id) => {
    if (!confirm('Delete this entity and all its connections?')) return
    try {
      await api.delete(`/api/detective/cases/${caseId}/graph/entities/${id}`)
      setEntities(es => es.filter(e => e.id !== id))
      setRelationships(rs => rs.filter(r => r.source_id !== id && r.target_id !== id))
      setSelected(null)
    } catch {}
  }

  const handleDeleteEdge = async (id) => {
    try {
      await api.delete(`/api/detective/cases/${caseId}/graph/relationships/${id}`)
      setRelationships(rs => rs.filter(r => r.id !== id))
      setSelected(null)
    } catch {}
  }

  const handleClear = async () => {
    if (!confirm('Clear all graph data for this case?')) return
    try {
      await api.delete(`/api/detective/cases/${caseId}/graph/clear`)
      setEntities([]); setRelationships([]); setSelected(null)
    } catch {}
  }

  const clearSelection = () => {
    setSelected(null)
    cyRef.current?.elements().removeClass('neighbor highlighted dimmed')
  }

  const hasData = !loading && entities.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: '#03030d' }}>

      {addEntityOpen && <AddEntityModal onAdd={handleAddEntity} onClose={() => setAddEntityOpen(false)} />}
      {addRelOpen && entities.length >= 2 && <AddRelModal entities={entities} onAdd={handleAddRel} onClose={() => setAddRelOpen(false)} />}

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderBottom: '1px solid rgba(99,102,241,0.12)', background: 'rgba(3,3,13,0.96)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={handleExtract} disabled={extracting} style={btn('primary', extracting)}>
          {extracting ? '🧠 Extracting…' : '🧠 AI Extract'}
        </button>
        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.07)' }} />
        <button onClick={() => setAddEntityOpen(true)} style={btn()}>+ Entity</button>
        <button onClick={() => setAddRelOpen(true)} disabled={entities.length < 2} style={btn('default', entities.length < 2)}>+ Link</button>
        <div style={{ flex: 1 }} />
        {extractMsg && (
          <span style={{ ...mono, fontSize: 10, padding: '3px 10px', borderRadius: 6, color: extractMsg.startsWith('+') ? '#6ee7b7' : '#f87171', background: extractMsg.startsWith('+') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${extractMsg.startsWith('+') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            {extractMsg}
          </span>
        )}
        <span style={{ ...mono, fontSize: 10, color: 'rgba(165,180,252,0.35)' }}>{entities.length} nodes · {relationships.length} links</span>
        {entities.length > 0 && <button onClick={handleClear} style={btn('danger')}>Clear</button>}
      </div>

      {/* ── Canvas ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>

        {/* Maltego dot-grid background */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: '#03030d', backgroundImage: 'radial-gradient(rgba(99,102,241,0.1) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <span style={{ ...mono, color: 'rgba(165,180,252,0.4)', fontSize: 12 }}>Loading graph…</span>
          </div>
        )}

        {!loading && entities.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, zIndex: 10 }}>
            <div style={{ fontSize: 52, opacity: 0.15 }}>🕸</div>
            <div style={{ ...syne, fontWeight: 700, fontSize: 20, color: 'rgba(199,210,254,0.4)' }}>No graph data yet</div>
            <div style={{ fontSize: 13, color: 'rgba(165,180,252,0.35)', textAlign: 'center', maxWidth: 360, lineHeight: 1.8 }}>
              Hit <strong style={{ color: '#818cf8' }}>AI Extract</strong> to auto-build your link graph from case entries — it'll pull out everyone mentioned (Angelina, Andrew, you) and draw the connections between them.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <button onClick={handleExtract} disabled={extracting} style={{ ...btn('primary', extracting), fontSize: 13, padding: '10px 22px' }}>
                {extracting ? '🧠 Extracting…' : '🧠 AI Extract'}
              </button>
              <button onClick={() => setAddEntityOpen(true)} style={{ ...btn(), fontSize: 13, padding: '10px 22px' }}>+ Add Entity</button>
            </div>
          </div>
        )}

        {/* Cytoscape canvas */}
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />

        {hasData && <Legend />}

        {/* Zoom controls */}
        {hasData && (
          <div style={{ position: 'absolute', bottom: 16, right: selected ? 306 : 16, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10, transition: 'right 0.2s' }}>
            {[
              { l: '+', t: 'Zoom in',     a: () => { const c = cyRef.current; c?.zoom({ level: c.zoom() * 1.3, renderedPosition: { x: c.width()/2, y: c.height()/2 } }) } },
              { l: '⊡', t: 'Fit screen',  a: () => cyRef.current?.fit(undefined, 50) },
              { l: '−', t: 'Zoom out',    a: () => { const c = cyRef.current; c?.zoom({ level: c.zoom() * 0.77, renderedPosition: { x: c.width()/2, y: c.height()/2 } }) } },
            ].map(({ l, t, a }) => (
              <button key={l} onClick={a} title={t} style={{ background: 'rgba(6,5,18,0.92)', border: '1px solid rgba(99,102,241,0.2)', color: 'rgba(165,180,252,0.7)', width: 32, height: 32, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: l === '⊡' ? 13 : 18, userSelect: 'none', transition: 'all 0.15s' }}>
                {l}
              </button>
            ))}
          </div>
        )}

        {hasData && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, ...mono, fontSize: 9, color: 'rgba(99,102,241,0.3)', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            Scroll to zoom · Drag to pan · Click node to inspect · Drag to rearrange
          </div>
        )}

        <NodePanel
          selected={selected}
          entities={entities}
          relationships={relationships}
          onSave={handleSaveEntity}
          onDelete={handleDeleteEntity}
          onDeleteEdge={handleDeleteEdge}
          onClose={clearSelection}
        />
      </div>
    </div>
  )
}
