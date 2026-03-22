import axios from 'axios'

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Access token stored in memory only — never localStorage
let _accessToken = null
let _refreshPromise = null

export function setAccessToken(token) { _accessToken = token }
export function clearAccessToken() { _accessToken = null }
export function getAccessToken() { return _accessToken }

// Request interceptor — attach access token + invite token
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  // Attach invite access token if present — grants access regardless of IP
  const inviteToken = localStorage.getItem('invite_access_token')
  if (inviteToken) {
    config.headers['X-Invite-Token'] = inviteToken
  }
  return config
})

// Response interceptor — silent refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // On 429 from refresh endpoint — wait and retry once, don't logout
    if (err.response?.status === 429 && original.url === '/auth/refresh') {
      if (!original._rateLimitRetry) {
        original._rateLimitRetry = true
        await new Promise((r) => setTimeout(r, 3000))
        return api(original)
      }
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        if (!_refreshPromise) {
          // Refresh token is HttpOnly cookie — no body needed, browser sends it automatically
          _refreshPromise = axios.post('/auth/refresh', {}, { withCredentials: true })
            .finally(() => { _refreshPromise = null })
        }
        const { data } = await _refreshPromise
        setAccessToken(data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch (refreshErr) {
        // Only logout if it's a real auth failure (401/403), not a rate limit
        if (refreshErr.response?.status !== 429) {
          clearAccessToken()
          window.dispatchEvent(new CustomEvent('auth:logout'))
        }
        return Promise.reject(err)
      }
    }
    return Promise.reject(err)
  }
)

export default api
