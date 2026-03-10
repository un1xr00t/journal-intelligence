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
    '--bg-base':        '#0a0704',
    '--bg-surface':     '#110d07',
    '--bg-card':        '#18110a',
    '--bg-card-hover':  '#221508',
    '--border':         'rgba(195,145,85,0.15)',
    '--border-bright':  'rgba(195,145,85,0.35)',
    '--accent':         '#c8965a',
    '--accent-2':       '#a67844',
    '--accent-glow':    'rgba(200,150,90,0.2)',
    '--text-primary':   '#ede0cb',
    '--text-secondary': '#a8926f',
    '--text-muted':     '#6b5640',
    '--severity-color': '#e8a030',
  },
}

// Apply all CSS vars for a given UI theme name
function applyUiThemeVars(name) {
  const root = document.documentElement
  const vars = UI_THEMES[name] || UI_THEMES.default
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.setAttribute('data-ui-theme', name)
}

// Apply mood theme — in writer mode, accent/border vars are locked by the UI theme
function applyMoodTheme(theme, uiThemeName) {
  const root = document.documentElement
  if (theme.moodName)      root.style.setProperty('--mood-name', `'${theme.moodName}'`)
  if (theme.moodHue)       root.style.setProperty('--mood-hue', theme.moodHue)
  if (theme.severityColor) root.style.setProperty('--severity-color', theme.severityColor)
  // Writer mode keeps its amber palette — don't let mood override it
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

  // Apply UI theme vars on mount and whenever uiTheme changes
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
