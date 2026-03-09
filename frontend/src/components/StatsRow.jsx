export default function StatsRow({ stats = [] }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
      {stats.map((stat, i) => (
        <div key={i} style={{
          flex: 1, padding: '16px 20px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderTop: `2px solid ${stat.color || 'var(--accent)'}`,
          borderRadius: 10,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{stat.label}</div>
          <div style={{ fontSize: 26, fontFamily: 'Syne', fontWeight: 700, color: stat.color || 'var(--text-primary)' }}>{stat.value ?? '—'}</div>
          {stat.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.sub}</div>}
          <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `radial-gradient(circle, ${stat.color || 'var(--accent)'}18, transparent 70%)`, borderRadius: '0 0 0 60px' }} />
        </div>
      ))}
    </div>
  )
}
