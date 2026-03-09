import { useTheme } from '../contexts/ThemeContext'

export default function PageHeader({ title, subtitle, actions }) {
  const { theme } = useTheme()
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
      <div>
        <h1 style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 22, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--text-muted)' }}>{today}</div>
        <div style={{
          padding: '4px 10px', borderRadius: 20,
          background: 'var(--accent-glow)', border: '1px solid var(--border-bright)',
          fontSize: 10, fontFamily: 'IBM Plex Mono', color: 'var(--accent)',
          textTransform: 'capitalize',
        }}>
          {theme.moodName || 'neutral'}
        </div>
        {actions}
      </div>
    </div>
  )
}
