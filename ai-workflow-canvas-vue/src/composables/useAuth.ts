import { ref, computed } from 'vue'
import router from '../router'

interface User {
  id: number
  username: string
  role: string
}

interface AuthTokens {
  accessToken: string
  refreshToken: string
}

const currentUser = ref<User | null>(null)
const isLoggedIn = computed(() => currentUser.value !== null)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshPromise: Promise<AuthTokens | null> | null = null

const API_BASE = '/api/auth'

function getTokens(): AuthTokens | null {
  const raw = localStorage.getItem('vf_tokens')
  return raw ? JSON.parse(raw) : null
}

function saveTokens(tokens: AuthTokens) {
  localStorage.setItem('vf_tokens', JSON.stringify(tokens))
}

function clearTokens() {
  localStorage.removeItem('vf_tokens')
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const tokens = getTokens()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`
  }

  let res = await fetch(url, { ...options, headers })

  // Auto-refresh on 401 — serialized to prevent concurrent refresh races
  if (res.status === 401 && tokens?.refreshToken) {
    const capturedRefreshToken = tokens.refreshToken

    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          const refreshRes = await fetch(`${API_BASE}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: capturedRefreshToken }),
          })
          if (refreshRes.ok) {
            const newTokens: AuthTokens = await refreshRes.json()
            saveTokens(newTokens)
            return newTokens
          }
          return null
        } catch {
          return null
        } finally {
          refreshPromise = null
        }
      })()
    }

    const newTokens = await refreshPromise
    if (newTokens) {
      headers['Authorization'] = `Bearer ${newTokens.accessToken}`
      res = await fetch(url, { ...options, headers })
    } else {
      clearTokens()
      currentUser.value = null
      router.push('/login')
      throw new Error('登录已过期')
    }
  }

  return res
}

function scheduleRefresh(accessToken: string) {
  if (refreshTimer) clearTimeout(refreshTimer)
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const expiresIn = (payload.exp * 1000) - Date.now()
    const refreshIn = Math.max(expiresIn - 60_000, 1000) // refresh 1min before expiry
    refreshTimer = setTimeout(async () => {
      const tokens = getTokens()
      if (!tokens?.refreshToken) return
      try {
        const res = await fetch(`${API_BASE}/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        })
        if (res.ok) {
          const newTokens: AuthTokens = await res.json()
          saveTokens(newTokens)
          scheduleRefresh(newTokens.accessToken)
        }
      } catch { /* silent */ }
    }, refreshIn)
  } catch { /* ignore invalid token format */ }
}

async function restoreSession() {
  const tokens = getTokens()
  if (!tokens?.accessToken) return

  try {
    const res = await apiFetch(`${API_BASE}/me`)
    if (res.ok) {
      const data = await res.json()
      currentUser.value = data.user
      scheduleRefresh(tokens.accessToken)
    } else {
      clearTokens()
    }
  } catch {
    clearTokens()
  }
}

async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '登录失败')

  saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  currentUser.value = data.user
  scheduleRefresh(data.accessToken)
  router.push('/')
}

async function register(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '注册失败')

  saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
  currentUser.value = data.user
  scheduleRefresh(data.accessToken)
  router.push('/')
}

async function logout() {
  try {
    await apiFetch(`${API_BASE}/logout`, { method: 'POST' })
  } catch { /* 即使 API 失败也清除本地状态 */ }
  clearTokens()
  currentUser.value = null
  if (refreshTimer) clearTimeout(refreshTimer)
  router.push('/login')
}

restoreSession()

export function useAuth() {
  return { currentUser, isLoggedIn, login, register, logout, restoreSession, apiFetch }
}
