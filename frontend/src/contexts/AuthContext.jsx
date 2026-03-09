import { createContext, useContext, useReducer, useEffect } from 'react'
import { login as doLogin, silentRefresh, logout as doLogout } from '../services/auth'
import api from '../services/api'

const AuthContext = createContext(null)

const initialState = { user: null, loading: true, error: null }

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':    return { ...state, user: action.user, loading: false, error: null }
    case 'SET_LOADING': return { ...state, loading: action.loading }
    case 'SET_ERROR':   return { ...state, error: action.error, loading: false }
    case 'LOGOUT':      return { user: null, loading: false, error: null }
    default:            return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Attempt silent refresh on mount
  useEffect(() => {
    silentRefresh()
      .then(data => {
        return api.get('/auth/me').then(r => r.data)
      })
      .then(user => dispatch({ type: 'SET_USER', user }))
      .catch(() => dispatch({ type: 'SET_LOADING', loading: false }))
  }, [])

  // Listen for forced logout (from interceptor)
  useEffect(() => {
    const handler = () => dispatch({ type: 'LOGOUT' })
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = async (username, password) => {
    // NOTE: Do NOT dispatch SET_LOADING here — it unmounts the Routes tree
    // and resets any in-progress form state (e.g. onboarding). The button
    // spinner on the login/account form handles loading UI instead.
    try {
      const data = await doLogin(username, password)
      dispatch({ type: 'SET_USER', user: data.user })
      return data
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login failed'
      dispatch({ type: 'SET_ERROR', error: msg })
      throw err
    }
  }

  const logout = async () => {
    await doLogout()
    dispatch({ type: 'LOGOUT' })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
