import { useState, useEffect } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'

const TAB_LABELS = { summary: 'Master Summary', users: 'Users', detection: 'Detection', spend: 'AI Spend' }
const mono = { fontFamily: 'IBM Plex Mono', fontSize: 11 }
const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }

const FEATURE_LABELS = {
  extraction:       'Entry extraction',
  daily_summary:    'Daily summary',
  master_summary:   'Master summary',
  reflection:       'Reflection tones',
  exit_plan:        'Exit plan generation',
  resources:        'Resources ranking',
  journal_prompt:   'Journal prompt',
  rag_search:       'Ask my journal',
  export_narrative: 'Export narrative',
  pattern_analysis: 'Pattern analysis',
  unknown:          'Unknown',
}

// Verified pricing per million tokens (USD) — sourced from official provider docs March 2026
// Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
// OpenAI: https://developers.openai.com/api/docs/pricing
const MODEL_PRICING = {
  // ── Anthropic Claude 4.x (current gen) ──────────────────────────────
  'claude-opus-4-6':              { input: 5.00,  output: 25.00 },
  'claude-opus-4-5-20251101':     { input: 5.00,  output: 25.00 },
  'claude-opus-4-5':              { input: 5.00,  output: 25.00 },
  'claude-sonnet-4-6':            { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5':            { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514':     { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5-20250514':   { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':             { input: 1.00,  output: 5.00  },
  'claude-haiku-4-5-20251001':    { input: 1.00,  output: 5.00  },
  // ── Anthropic Claude 4.1 (older, deprecated) ─────────────────────────
  'claude-opus-4-1':              { input: 15.00, output: 75.00 },
  'claude-sonnet-4-1':            { input: 3.00,  output: 15.00 },
  // ── Anthropic Claude 3.x ─────────────────────────────────────────────
  'claude-3-7-sonnet-20250219':   { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20241022':   { input: 3.00,  output: 15.00 },
  'claude-3-5-sonnet-20240620':   { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku-20241022':    { input: 0.80,  output: 4.00  },
  'claude-3-opus-20240229':       { input: 15.00, output: 75.00 },
  'claude-3-sonnet-20240229':     { input: 3.00,  output: 15.00 },
  'claude-3-haiku-20240307':      { input: 0.25,  output: 1.25  },
  // ── OpenAI GPT-4o family ─────────────────────────────────────────────
  'gpt-4o':                       { input: 2.50,  output: 10.00 },
  'gpt-4o-2024-11-20':            { input: 2.50,  output: 10.00 },
  'gpt-4o-2024-08-06':            { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':                  { input: 0.15,  output: 0.60  },
  'gpt-4o-mini-2024-07-18':       { input: 0.15,  output: 0.60  },
  // ── OpenAI GPT-4.1 family ────────────────────────────────────────────
  'gpt-4.1':                      { input: 2.00,  output: 8.00  },
  'gpt-4.1-mini':                 { input: 0.40,  output: 1.60  },
  'gpt-4.1-nano':                 { input: 0.10,  output: 0.40  },
  // ── OpenAI GPT-4 Turbo ───────────────────────────────────────────────
  'gpt-4-turbo':                  { input: 10.00, output: 30.00 },
  'gpt-4-turbo-preview':          { input: 10.00, output: 30.00 },
}

function getPricing(modelStr) {
  if (!modelStr) return null
  const models = modelStr.split(',').map(m => m.trim()).filter(Boolean)
  // If mixed models, can't give a single accurate number
  if (models.length > 1) return null
  return MODEL_PRICING[models[0]] || null
}

function calcCost(inputTokens, outputTokens, modelStr) {
  const pricing = getPricing(modelStr)
  if (!pricing) return null
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

function fmtCost(usd) {
  if (usd === null) return '?'
  if (usd === 0) return '$0.00'
  if (usd < 0.0001) return '<$0.0001'
  return '$' + usd.toFixed(4)
}

function CostCell({ cost }) {
  const unknown = cost === null
  return (
    <span style={{ color: unknown ? 'var(--text-muted)' : 'var(--accent)', fontFamily: 'IBM Plex Mono', fontWeight: unknown ? 400 : 600 }}>
      {unknown ? '?' : fmtCost(cost)}
    </span>
  )
}

export default function Admin() {
  const [masterSummary, setMasterSummary] = useState(null)
  const [users, setUsers]                 = useState([])
  const [aiUsage, setAiUsage]             = useState(null)
  const [newUser, setNewUser]             = useState({ username: '', email: '', password: '', role: 'viewer' })
  const [adding, setAdding]               = useState(false)
  const [addError, setAddError]           = useState('')
  const [addSuccess, setAddSuccess]       = useState('')
  const [activeTab, setActiveTab]         = useState('summary')
  const [loading, setLoading]             = useState(true)
  const [hasUnknown, setHasUnknown]       = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [summaryRes, usersRes, usageRes] = await Promise.all([
        api.get('/api/summary/master'),
        api.get('/api/admin/users'),
        api.get('/api/admin/ai-usage'),
      ])
      setMasterSummary(summaryRes.data)
      setUsers(usersRes.data.users || [])
      setAiUsage(usageRes.data)
      const rows = usageRes.data?.per_user || []
      setHasUnknown(rows.some(r => !getPricing(r.models)))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const addUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.password) { setAddError('All fields required'); return }
    setAdding(true); setAddError(''); setAddSuccess('')
    try {
      await api.post('/api/admin/users', newUser)
      setAddSuccess(`User ${newUser.username} created`)
      setNewUser({ username: '', email: '', password: '', role: 'viewer' })
      load()
    } catch (e) { setAddError(e.response?.data?.detail || 'Failed to create user') }
    setAdding(false)
  }

  const removeUser = async (id, username) => {
    if (!confirm(`Remove user "${username}"?`)) return
    try { await api.delete(`/api/admin/users/${id}`); load() } catch (e) { console.error(e) }
  }

  const revokeSessions = async (id, username) => {
    if (!confirm(`Revoke all sessions for "${username}"?`)) return
    try { await api.delete(`/api/admin/sessions/${id}`); alert('Sessions revoked') } catch (e) { console.error(e) }
  }

  const fmtNum  = n => (n || 0).toLocaleString()
  const fmtDate = d => d ? new Date(d + 'Z').toLocaleDateString() : '—'

  const totalTokens = aiUsage?.totals?.total_tokens || 0
  const totalCostNum = aiUsage?.per_user
    ? aiUsage.per_user.reduce((acc, r) => {
        const c = calcCost(r.total_input || 0, r.total_output || 0, r.models)
        return c !== null ? acc + c : acc
      }, 0)
    : 0
  const totalCostKnown = aiUsage?.per_user?.every(r => getPricing(r.models)) ?? false

  return (
    <div>
      <PageHeader title="Admin" subtitle="System management (owner only)" />

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, width: 'fit-content' }}>
        {Object.entries(TAB_LABELS).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            background: activeTab === t ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
            color: activeTab === t ? '#fff' : 'var(--text-secondary)',
          }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', ...mono }}>loading...</div>

      ) : activeTab === 'summary' ? (
        <div>
          {masterSummary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 10, ...mono, color: 'var(--text-muted)' }}>
                Version {masterSummary.version} · Updated {masterSummary.last_updated || '—'}
              </div>
              {['overall_arc', 'current_state', 'key_themes', 'key_people', 'active_threads', 'notable_patterns'].map(section => {
                const text = masterSummary[section] || masterSummary.content?.[section]
                if (!text) return null
                return (
                  <div key={section} style={card}>
                    <div style={{ fontSize: 10, ...mono, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {section.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{text}</div>
                  </div>
                )
              })}
              {!masterSummary.overall_arc && !masterSummary.content && (
                <div style={card}>
                  <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', ...mono, lineHeight: 1.6 }}>
                    {JSON.stringify(masterSummary, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', ...mono }}>no master summary yet</div>
          )}
        </div>

      ) : activeTab === 'users' ? (
        <div>
          <div style={{ marginBottom: 24 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {u.username?.[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono' }}>{u.email}</div>
                </div>
                <span style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', padding: '2px 8px', borderRadius: 20, background: u.role === 'owner' ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', color: u.role === 'owner' ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{u.role}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => revokeSessions(u.id, u.username)} style={{ padding: '4px 8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, color: '#f59e0b', fontSize: 10, cursor: 'pointer' }}>Revoke</button>
                  {u.role !== 'owner' && <button onClick={() => removeUser(u.id, u.username)} style={{ padding: '4px 8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, color: '#ef4444', fontSize: 10, cursor: 'pointer' }}>Remove</button>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, maxWidth: 480 }}>
            <div style={{ fontSize: 12, fontFamily: 'Syne', fontWeight: 600, marginBottom: 16 }}>Add User</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[['username', 'Username'], ['email', 'Email']].map(([field, label]) => (
                <div key={field}>
                  <label style={{ fontSize: 10, ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={newUser[field]} onChange={e => setNewUser(u => ({ ...u, [field]: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 10, ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, ...mono, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Role</label>
                <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 8px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}>
                  <option value="viewer">viewer</option>
                  <option value="owner">owner</option>
                </select>
              </div>
            </div>
            {addError && <div style={{ padding: '7px 10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, color: '#ef4444', fontSize: 11, marginBottom: 10 }}>{addError}</div>}
            {addSuccess && <div style={{ padding: '7px 10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, color: '#10b981', fontSize: 11, marginBottom: 10 }}>{addSuccess}</div>}
            <button onClick={addUser} disabled={adding} style={{ padding: '9px 20px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'Syne', cursor: adding ? 'not-allowed' : 'pointer' }}>
              {adding ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>

      ) : activeTab === 'spend' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Unknown model warning */}
          {hasUnknown && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
              Some models have unknown pricing — cost shown as <strong>?</strong>. Check your Anthropic or OpenAI console for exact figures.
            </div>
          )}

          {/* Totals row */}
          {aiUsage?.totals && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
              {[
                ['Est. total cost', totalCostKnown ? fmtCost(totalCostNum) : '?'],
                ['Total tokens',   fmtNum(aiUsage.totals.total_tokens)],
                ['Input tokens',   fmtNum(aiUsage.totals.total_input)],
                ['Output tokens',  fmtNum(aiUsage.totals.total_output)],
                ['Total calls',    fmtNum(aiUsage.totals.total_calls)],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, ...mono, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'Syne', color: label === 'Est. total cost' ? 'var(--accent)' : 'var(--text-primary)' }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* By feature */}
          {aiUsage?.by_feature?.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 12, fontFamily: 'Syne', fontWeight: 600, marginBottom: 16 }}>By feature</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {aiUsage.by_feature.map((row, i) => {
                  const pct = totalTokens > 0 ? Math.round((row.total_tokens / totalTokens) * 100) : 0
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{FEATURE_LABELS[row.feature] || row.feature}</span>
                        <span style={{ ...mono, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          <span>{fmtNum(row.total_tokens)} tok</span>
                          <span>{fmtNum(row.total_calls)} calls</span>
                          <span>{pct}%</span>
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Per-user table */}
          {aiUsage?.per_user?.length > 0 ? (
            <div style={card}>
              <div style={{ fontSize: 12, fontFamily: 'Syne', fontWeight: 600, marginBottom: 16 }}>Per user</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['User', 'Est. cost', 'Total tokens', 'Input', 'Output', 'Calls', 'Model', 'Last call'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', ...mono, fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiUsage.per_user.map((row, i) => {
                    const cost = calcCost(row.total_input || 0, row.total_output || 0, row.models)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)', opacity: row.username ? 1 : 0.5 }}>
                        <td style={{ padding: '10px 10px', fontWeight: 500 }}>{row.username || 'deleted user'}</td>
                        <td style={{ padding: '10px 10px' }}><CostCell cost={cost} /></td>
                        <td style={{ padding: '10px 10px', fontFamily: 'IBM Plex Mono', color: 'var(--text-secondary)' }}>{fmtNum(row.total_tokens)}</td>
                        <td style={{ padding: '10px 10px', ...mono, color: 'var(--text-secondary)' }}>{fmtNum(row.total_input)}</td>
                        <td style={{ padding: '10px 10px', ...mono, color: 'var(--text-secondary)' }}>{fmtNum(row.total_output)}</td>
                        <td style={{ padding: '10px 10px', ...mono, color: 'var(--text-secondary)' }}>{fmtNum(row.total_calls)}</td>
                        <td style={{ padding: '10px 10px', ...mono, color: 'var(--text-muted)', fontSize: 10 }}>{row.models || '—'}</td>
                        <td style={{ padding: '10px 10px', ...mono, color: 'var(--text-muted)', fontSize: 10 }}>{fmtDate(row.last_call)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 10, ...mono, color: 'var(--text-muted)' }}>
                Pricing sourced from Anthropic + OpenAI official docs (March 2026). Verify against your provider console for billing accuracy.
              </div>
            </div>
          ) : (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', ...mono, padding: 40 }}>
              no usage logged yet — data appears after the first AI call
            </div>
          )}
        </div>

      ) : (
        <div>
          <div style={{ ...card, maxWidth: 480 }}>
            <div style={{ fontSize: 14, fontFamily: 'Syne', fontWeight: 700, marginBottom: 8 }}>Pattern Detection</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              Runs all four rule-based detectors: mood spikes, severity streaks, instability clusters, and contradiction flagging. AI analysis triggers automatically for alerts above priority 6.0.
            </p>
            <button onClick={async () => {
              try { await api.post('/api/patterns/run'); alert('Detection complete') }
              catch (e) { alert('Detection failed: ' + (e.response?.data?.detail || e.message)) }
            }} style={{ padding: '10px 20px', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'Syne', cursor: 'pointer' }}>
              ⬡ Run All Detectors
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
