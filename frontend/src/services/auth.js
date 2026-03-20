import api, { setAccessToken, clearAccessToken } from './api'

export async function login(username, password) {
  const { data } = await api.post('/auth/login', { username, password })
  setAccessToken(data.access_token)
  return data
}

export async function silentRefresh() {
  // Refresh token is in HttpOnly cookie — sent automatically by browser
  const { data } = await api.post('/auth/refresh')
  setAccessToken(data.access_token)
  return data
}

export async function logout() {
  try {
    // Cookie sent automatically; server revokes token + clears cookie
    await api.post('/auth/logout')
  } catch { /* best effort */ }
  clearAccessToken()
}
