import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'dark' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  isLoading?: boolean
}

const variantClass: Record<Variant, string> = {
  primary: 'bg-orange text-white hover:brightness-105',
  dark: 'bg-ink text-white',
  ghost: 'bg-white text-ink border border-line hover:border-[#b9bdc1]',
}

export function Button({ variant = 'primary', isLoading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? isLoading}
      className={`flex items-center justify-center gap-2 w-full rounded-full px-4 py-[13px] text-[14.5px] font-semibold transition-all active:translate-y-px font-sans disabled:opacity-50 disabled:cursor-not-allowed ${variantClass[variant]} ${className}`}
    >
      {isLoading ? <span className="animate-spin">⟳</span> : children}
    </button>
  )
}