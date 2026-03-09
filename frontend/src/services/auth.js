import api, { setAccessToken, clearAccessToken } from './api'

export async function login(username, password) {
  const { data } = await api.post('/auth/login', { username, password })
  setAccessToken(data.access_token)
  if (data.refresh_token) {
    localStorage.setItem('refresh_token', data.refresh_token)
  }
  return data
}

export async function silentRefresh() {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) throw new Error('No refresh token stored')
  const { data } = await api.post('/auth/refresh', { refresh_token: refreshToken })
  setAccessToken(data.access_token)
  return data
}

export async function logout() {
  try {
    const refreshToken = localStorage.getItem('refresh_token')
    if (refreshToken) {
      await api.post('/auth/logout', { refresh_token: refreshToken })
    }
  } catch { /* best effort */ }
  clearAccessToken()
  localStorage.removeItem('refresh_token')
}
