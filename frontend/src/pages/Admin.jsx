import { useState, useEffect } from 'react'
import api from '../services/api'
import PageHeader from '../components/PageHeader'

export default function Admin() {
  const [masterSummary, setMasterSummary] = useState(null)
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', role: 'viewer' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [activeTab, setActiveTab] = useState('summary')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [summaryRes, usersRes] = await Promise.all([
        api.get('/api/summary/master'),
        api.get('/api/admin/users'),
      ])
      setMasterSummary(summaryRes.data)
      setUsers(usersRes.data.users || [])
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

  const tabs = ['summary', 'users', 'detection']

  return (
    <div>
      <PageHeader title="Admin" subtitle="System management (owner only)" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 500, cursor: 'pointer',
            textTransform: 'capitalize',
            background: activeTab === t ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'transparent',
            color: activeTab === t ? '#fff' : 'var(--text-secondary)',
          }}>{t === 'summary' ? 'Master Summary' : t === 'users' ? 'Users' : 'Detection'}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>loading...</div>
      ) : activeTab === 'summary' ? (
        <div>
          {masterSummary ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>
                Version {masterSummary.version} · Updated {masterSummary.last_updated || '—'}
              </div>
              {['overall_arc', 'current_state', 'key_themes', 'key_people', 'active_threads', 'notable_patterns'].map(section => {
                const text = masterSummary[section] || masterSummary.content?.[section]
                if (!text) return null
                return (
                  <div key={section} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                      {section.replace(/_/g, ' ')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{text}</div>
                  </div>
                )
              })}
              {/* Fallback raw */}
              {!masterSummary.overall_arc && !masterSummary.content && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                  <pre style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'IBM Plex Mono', lineHeight: 1.6 }}>
                    {JSON.stringify(masterSummary, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontFamily: 'IBM Plex Mono', fontSize: 12 }}>no master summary yet</div>
          )}
        </div>
      ) : activeTab === 'users' ? (
        <div>
          {/* User list */}
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

          {/* Add user form */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 480 }}>
            <div style={{ fontSize: 12, fontFamily: 'Syne', fontWeight: 600, marginBottom: 16 }}>Add User</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              {[['username', 'Username'], ['email', 'Email']].map(([field, label]) => (
                <div key={field}>
                  <label style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input value={newUser[field]} onChange={e => setNewUser(u => ({ ...u, [field]: e.target.value }))}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 12, outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Role</label>
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
      ) : (
        /* Detection tab */
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 24, maxWidth: 480 }}>
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
