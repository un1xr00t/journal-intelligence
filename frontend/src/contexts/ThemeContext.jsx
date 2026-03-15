import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

const ThemeContext = createContext(null)

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

export function ThemeProvider({ children }) {
  const [uiTheme, _setUiTheme] = useState(
    () => localStorage.getItem('ui-theme') || 'default'
  )

  useEffect(() => {
    applyUiThemeVars(uiTheme)
  }, [uiTheme])

  const setUiTheme = useCallback((name) => {
    localStorage.setItem('ui-theme', name)
    _setUiTheme(name)
    applyUiThemeVars(name)
  }, [])

  // fetchTheme kept as no-op so existing callers don't break
  const fetchTheme = useCallback(() => {}, [])

  return (
    <ThemeContext.Provider value={{ fetchTheme, uiTheme, setUiTheme, sidebarPhoto: null, theme: { moodName: 'neutral', moodDescription: 'mood adaptive' } }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
