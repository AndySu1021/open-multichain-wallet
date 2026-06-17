import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { RegisterSchema } from '@fox-wallet/shared'
import type { AuthResponse } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

const RegisterFormSchema = RegisterSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '密碼不相符',
  path: ['confirmPassword'],
})
type RegisterFormInput = z.infer<typeof RegisterFormSchema>

export function Register() {
  const nav = useNavigate()
  const login = useAuthStore((s) => s.login)
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormInput>({
    resolver: zodResolver(RegisterFormSchema),
  })

  async function onSubmit({ email, password }: RegisterFormInput) {
    setApiError(null)
    try {
      const res = await api.post<AuthResponse>('/auth/register', { email, password })
      login(res.user, res.tokens)
      nav('/dashboard')
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Registration failed')
    }
  }

  return (
    <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-5">
      <div className="text-[40px] mb-3">🦊</div>
      <h2 className="text-[18px] font-bold tracking-tight mb-1">建立狐錢包帳號</h2>
      <p className="text-ink-2 text-[13px] mb-[22px]">用 email 完成註冊</p>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Input label="Email" type="email" placeholder="you@example.com" {...register('email')} error={errors.email?.message} />
        <Input label="密碼（至少 8 位）" type="password" placeholder="••••••••" {...register('password')} error={errors.password?.message} />
        <Input label="確認密碼" type="password" placeholder="再輸入一次" {...register('confirmPassword')} error={errors.confirmPassword?.message} />
        {apiError && <p className="text-xs text-red-500 mb-3">{apiError}</p>}
        <Button type="submit" isLoading={isSubmitting}>建立帳號</Button>
      </form>

      <p className="text-center text-ink-2 text-[12.5px] mt-4">
        已有帳號？{' '}
        <span className="text-orange-deep font-semibold cursor-pointer" onClick={() => nav('/login')}>
          登入
        </span>
      </p>
    </div>
  )
}