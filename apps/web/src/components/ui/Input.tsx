import type { InputHTMLAttributes } from 'react'
import { forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = '', ...props },
  ref,
) {
  return (
    <div className="mb-[14px]">
      {label && (
        <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">{label}</label>
      )}
      <input
        ref={ref}
        {...props}
        className={`w-full border border-line rounded-[10px] px-[13px] py-3 text-sm font-sans bg-white focus:outline-none focus:ring-2 focus:ring-orange/25 focus:border-orange ${error ? 'border-red-500' : ''} ${className}`}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
})