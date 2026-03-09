import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'

const ThemeContext = createContext(null)

// Default mood buckets for fallback
const DEFAULT_THEME = {
  accent: '#6366f1',
  accent2: '#8b5cf6',
  accentGlow: 'rgba(99,102,241,0.2)',
  moodName: 'neutral',
  moodHue: '240',
  severityColor: '#f59e0b',
  unsplashQuery: 'dark abstract night',
}

function applyTheme(theme) {
  const root = document.documentElement
  if (theme.accent)       root.style.setProperty('--accent',         theme.accent)
  if (theme.accent2)      root.style.setProperty('--accent-2',       theme.accent2)
  if (theme.accentGlow)   root.style.setProperty('--accent-glow',    theme.accentGlow)
  if (theme.moodName)     root.style.setProperty('--mood-name',      `'${theme.moodName}'`)
  if (theme.moodHue)      root.style.setProperty('--mood-hue',       theme.moodHue)
  if (theme.severityColor)root.style.setProperty('--severity-color', theme.severityColor)
  if (theme.borderBright) root.style.setProperty('--border-bright',  theme.borderBright)
  if (theme.border)       root.style.setProperty('--border',         theme.border)
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [sidebarPhoto, setSidebarPhoto] = useState(null)

  const fetchTheme = useCallback(async () => {
    try {
      const { data } = await api.get('/api/theme')
      const t = data.data || data
      applyTheme(t)
      setTheme(t)
      // Build Unsplash URL from query
      if (t.unsplashQuery) {
        const q = encodeURIComponent(t.unsplashQuery)
        setSidebarPhoto(`https://source.unsplash.com/featured/400x900?${q}`)
      }
    } catch {
      // Keep defaults
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, sidebarPhoto, fetchTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
