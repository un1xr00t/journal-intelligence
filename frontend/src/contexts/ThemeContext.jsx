import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import api from '../services/api'

const ThemeContext = createContext(null)

// ─── Mood-adaptive defaults (default UI theme) ───────────────────────────────
const DEFAULT_THEME = {
  accent: '#6366f1',
  accent2: '#8b5cf6',
  accentGlow: 'rgba(99,102,241,0.2)',
  moodName: 'neutral',
  moodHue: '240',
  severityColor: '#f59e0b',
  unsplashQuery: 'dark abstract night',
}

// ─── UI Theme palettes ────────────────────────────────────────────────────────
const UI_THEMES = {
  default: {
    '--bg-base':        '#07070f',
    '--bg-surface':     '#0c0c18',
    '--bg-card':        '#10101e',
    '--bg-card-hover':  '#14142a',
    '--bg-card-alt':    '#13131f',
    '--bg-card-dark':   '#0d0d1a',
    '--bg-card-deep':   '#0d1117',
    '--bg-progress':    '#1e293b',
    '--bg-sidebar':     'rgba(7,7,15,0.97)',
    '--border':         'rgba(99,102,241,0.12)',
    '--border-bright':  'rgba(99,102,241,0.3)',
    '--accent':         '#6366f1',
    '--accent-2':       '#8b5cf6',
    '--accent-glow':    'rgba(99,102,241,0.2)',
    '--text-primary':   '#e8e8f0',
    '--text-secondary': '#9898b0',
    '--text-muted':     '#55556a',
    '--severity-color': '#f59e0b',
  },
  writer: {
    '--bg-base':        '#0d0b08',
    '--bg-surface':     '#110e09',
    '--bg-card':        '#17120c',
    '--bg-card-hover':  '#1e1710',
    '--bg-card-alt':    '#19130d',
    '--bg-card-dark':   '#130f0a',
    '--bg-card-deep':   '#110d08',
    '--bg-progress':    '#251c10',
    '--bg-sidebar':     'rgba(13,11,8,0.97)',
    '--border':         'rgba(200,169,110,0.12)',
    '--border-bright':  'rgba(200,169,110,0.35)',
    '--accent':         '#c8a96e',
    '--accent-2':       '#9b7a3e',
    '--accent-glow':    'rgba(200,169,110,0.18)',
    '--text-primary':   '#f0e8d8',
    '--text-secondary': '#c8a96e',
    '--text-muted':     'rgba(200,169,110,0.38)',
    '--severity-color': '#d4724a',
  },
}

function applyUiThemeVars(name) {
  const root = document.documentElement
  const vars = UI_THEMES[name] || UI_THEMES.default
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.setAttribute('data-ui-theme', name)
}

function applyMoodTheme(theme, uiThemeName) {
  const root = document.documentElement
  if (theme.moodName)      root.style.setProperty('--mood-name', `'${theme.moodName}'`)
  if (theme.moodHue)       root.style.setProperty('--mood-hue', theme.moodHue)
  if (theme.severityColor) root.style.setProperty('--severity-color', theme.severityColor)
  if (uiThemeName !== 'writer') {
    if (theme.accent)       root.style.setProperty('--accent',        theme.accent)
    if (theme.accent2)      root.style.setProperty('--accent-2',      theme.accent2)
    if (theme.accentGlow)   root.style.setProperty('--accent-glow',   theme.accentGlow)
    if (theme.borderBright) root.style.setProperty('--border-bright', theme.borderBright)
    if (theme.border)       root.style.setProperty('--border',        theme.border)
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [sidebarPhoto, setSidebarPhoto] = useState(null)
  const [uiTheme, _setUiTheme] = useState(
    () => localStorage.getItem('ui-theme') || 'default'
  )
  const uiThemeRef = useRef(uiTheme)

  useEffect(() => {
    applyUiThemeVars(uiTheme)
    uiThemeRef.current = uiTheme
  }, [uiTheme])

  const setUiTheme = useCallback((name) => {
    localStorage.setItem('ui-theme', name)
    _setUiTheme(name)
  }, [])

  const fetchTheme = useCallback(async () => {
    try {
      const { data } = await api.get('/api/theme')
      const t = data.data || data
      applyMoodTheme(t, uiThemeRef.current)
      setTheme(t)
      if (t.unsplashQuery) {
        const q = encodeURIComponent(t.unsplashQuery)
        setSidebarPhoto(`https://source.unsplash.com/featured/400x900?${q}`)
      }
    } catch {
      // Keep defaults
    }
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, sidebarPhoto, fetchTheme, uiTheme, setUiTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
