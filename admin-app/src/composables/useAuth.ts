import { ref, computed } from 'vue'

interface User {
  id: number
  username: string
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'USER'
  credits: number
  tenantId: string | null
  subjectId: string | null
}

interface Tokens {
  accessToken: string
  refreshToken: string
}

const currentUser = ref<User | null>(null)
const tokens = ref<Tokens | null>(loadTokens())

function loadTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem('admin_tokens')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveTokens(t: Tokens) {
  tokens.value = t
  localStorage.setItem('admin_tokens', JSON.stringify(t))
}

function clearTokens() {
  tokens.value = null
  localStorage.removeItem('admin_tokens')
}

export const isLoggedIn = computed(() => !!tokens.value)
export const userRole = computed(() => currentUser.value?.role)
export const userTenantId = computed(() => currentUser.value?.tenantId)

let refreshPromise: Promise<void> | null = null

export function useAuth() {
  async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const isFormData = options.body instanceof FormData
    const headers: Record<string, string> = {}
    if (!isFormData) headers['Content-Type'] = 'application/json'
    Object.assign(headers, options.headers || {})
    if (tokens.value) {
      headers['Authorization'] = `Bearer ${tokens.value.accessToken}`
    }
    // SUPER_ADMIN 选中的租户
    const selectedTenant = localStorage.getItem('admin_selected_tenant')
    if (selectedTenant) {
      headers['X-Tenant-Id'] = selectedTenant
    }

    let res = await fetch(url, { ...options, headers })

    if (res.status === 401 && tokens.value?.refreshToken) {
      if (!refreshPromise) {
        refreshPromise = (async () => {
          try {
            const r = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: tokens.value!.refreshToken }),
            })
            if (r.ok) {
              const newTokens: Tokens = await r.json()
              saveTokens(newTokens)
            } else {
              clearTokens()
              currentUser.value = null
            }
          } catch {
            clearTokens()
            currentUser.value = null
          } finally {
            refreshPromise = null
          }
        })()
      }
      await refreshPromise
      if (tokens.value) {
        headers['Authorization'] = `Bearer ${tokens.value.accessToken}`
        res = await fetch(url, { ...options, headers })
      }
    }
    return res
  }

  async function login(username: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '登录失败')
    }
    const data = await res.json()
    saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken })
    currentUser.value = data.user
    return data.user as User
  }

  async function fetchMe() {
    const res = await apiFetch('/api/auth/me')
    if (res.ok) {
      const data = await res.json()
      currentUser.value = data.user
    }
    return currentUser.value
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    clearTokens()
    currentUser.value = null
  }

  return { currentUser, isLoggedIn, userRole, userTenantId, apiFetch, login, fetchMe, logout }
}
