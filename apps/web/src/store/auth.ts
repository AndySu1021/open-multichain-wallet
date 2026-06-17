import { create } from 'zustand'
import type { User, AuthTokens } from '@fox-wallet/shared'
import { setTokens, clearTokens, getAccessToken, getRefreshToken, setAccessToken } from '../api/client.js'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User, tokens: AuthTokens) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user, tokens) => {
    setTokens(tokens.accessToken, tokens.refreshToken)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    clearTokens()
    set({ user: null, isAuthenticated: false })
  },
}))

// Decode Base64URL JWT payload (no verification — API has already signed it)
function decodeJwtPayload(token: string): { sub: string; email: string; exp: number; type: string } | null {
  try {
    const raw = token.split('.')[1]
    if (!raw) return null
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=')
    return JSON.parse(atob(padded)) as { sub: string; email: string; exp: number; type: string }
  } catch {
    return null
  }
}

// Called once on app startup — restores auth state from localStorage tokens.
// Returns true if the session was restored (caller can skip redirect to /login).
export async function hydrateFromStorage(): Promise<boolean> {
  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()

  if (!accessToken && !refreshToken) return false

  // Try to use the access token if it's still valid (exp > now + 30s buffer)
  if (accessToken) {
    const payload = decodeJwtPayload(accessToken)
    if (payload && payload.type === 'access' && payload.exp * 1000 > Date.now() + 30_000) {
      useAuthStore.setState({
        user: { id: payload.sub, email: payload.email, createdAt: '' },
        isAuthenticated: true,
      })
      return true
    }
  }

  // Access token missing or expired — try refreshing
  if (refreshToken) {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const json = await res.json() as { ok: boolean; data?: { accessToken: string } }
      if (json.ok && json.data?.accessToken) {
        const newToken = json.data.accessToken
        setAccessToken(newToken)
        const payload = decodeJwtPayload(newToken)
        if (payload) {
          useAuthStore.setState({
            user: { id: payload.sub, email: payload.email, createdAt: '' },
            isAuthenticated: true,
          })
          return true
        }
      }
    } catch {
      // network error — clear stale tokens
    }
  }

  clearTokens()
  return false
}