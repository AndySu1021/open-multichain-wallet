import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LoginSchema } from '@fox-wallet/shared'
import type { LoginInput, AuthResponse } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="w-[18px] h-[18px]">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.2-.1-2.3-.3-3.5z"/>
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 7 29.4 5 24 5 16.3 5 9.7 9.3 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.7 16.2 44 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.5l6.3 5.3C40.7 35.9 44 30.5 44 24c0-1.2-.1-2.3-.4-3.5z"/>
  </svg>
)

export function Login() {
  const nav = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setApiError(null)
    try {
      const res = await api.post<AuthResponse>('/auth/login', data)
      login(res.user, res.tokens)
      nav('/dashboard')
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Login failed')
    }
  }

  return (
    <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-5">
      <div className="text-[40px] mb-3">🦊</div>
      <h2 className="text-[18px] font-bold tracking-tight mb-1">登入狐錢包</h2>
      <p className="text-ink-2 text-[13px] mb-[22px]">選擇你慣用的方式，30 秒完成</p>

      <button
        onClick={() => window.location.href = '/api/auth/google'}
        className="flex items-center justify-center gap-[10px] w-full border border-line bg-white rounded-xl px-4 py-[13px] text-sm font-semibold mb-[10px] hover:bg-[#fafbfc] font-sans"
      >
        <GoogleIcon /> 使用 Google 繼續
      </button>

      <div className="flex items-center gap-3 my-[18px] text-ink-2 text-xs">
        <span className="flex-1 h-px bg-line-soft" />
        或用 email
        <span className="flex-1 h-px bg-line-soft" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Input label="Email" type="email" placeholder="you@example.com" {...register('email')} error={errors.email?.message} />
        <Input label="密碼" type="password" placeholder="••••••••" {...register('password')} error={errors.password?.message} />
        {apiError && <p className="text-xs text-red-500 mb-3">{apiError}</p>}
        <Button type="submit" isLoading={isSubmitting}>登入</Button>
      </form>

      <p className="text-center text-ink-2 text-[12.5px] mt-4">
        還沒有帳號？{' '}
        <span className="text-orange-deep font-semibold cursor-pointer" onClick={() => nav('/register')}>
          註冊
        </span>
      </p>

      <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mt-[18px]">
        <span>🔒</span>
        <span>託管式設計：你不需要保管助記詞，帳號還原透過 email 驗證。</span>
      </div>
    </div>
  )
}