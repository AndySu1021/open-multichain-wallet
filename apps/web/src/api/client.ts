import type { ApiResponse } from '@fox-wallet/shared'

const BASE = '/api'

export function getAccessToken() { return localStorage.getItem('accessToken') }
export function getRefreshToken() { return localStorage.getItem('refreshToken') }

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem('accessToken', accessToken)
}

export function clearTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) throw new Error('No refresh token')

  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  const json = await res.json() as ApiResponse<{ accessToken: string }>
  if (!json.ok) throw new Error('Token refresh failed')

  setAccessToken(json.data.accessToken)
  return json.data.accessToken
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
    }
    try {
      const newToken = await refreshPromise
      return request<T>(path, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${newToken}` },
      }, false)
    } catch {
      clearTokens()
      window.location.href = '/login'
      throw new Error('Session expired')
    }
  }

  const json = (await res.json()) as ApiResponse<T>
  if (!json.ok) throw new Error(json.error.message)
  return json.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
}