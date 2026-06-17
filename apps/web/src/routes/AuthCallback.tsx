import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

// Receives access_token and refresh_token from Google OAuth redirect
export function AuthCallback() {
  const nav = useNavigate()
  const login = useAuthStore((s) => s.login)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const error = params.get('error')

    if (error || !accessToken || !refreshToken) {
      nav('/login?error=' + (error ?? 'oauth_failed'), { replace: true })
      return
    }

    // JWT uses Base64URL (- → +, _ → /), atob() needs standard Base64 with padding
    try {
      const raw = accessToken.split('.')[1]!
      const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
      const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=')
      const payload = JSON.parse(atob(padded)) as {
        sub: string; email: string; iat: number; exp: number
      }
      // login() already calls setTokens internally
      login(
        { id: payload.sub, email: payload.email, createdAt: new Date().toISOString() },
        { accessToken, refreshToken },
      )
      nav('/dashboard', { replace: true })
    } catch {
      nav('/login?error=oauth_failed', { replace: true })
    }
  }, [nav, login])

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-[54px] h-[54px] rounded-full bg-gradient-to-br from-orange-400 to-[#037dd6] animate-spin mx-auto" />
      <p className="font-semibold">正在完成登入…</p>
    </div>
  )
}