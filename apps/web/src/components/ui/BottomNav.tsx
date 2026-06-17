import { NavLink } from 'react-router-dom'

export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `flex-1 text-center py-[10px] pb-3 text-[10.5px] ${isActive ? 'text-orange-deep' : 'text-ink-2'}`

  return (
    <nav className="flex border-t border-line-soft bg-white flex-shrink-0">
      <NavLink to="/dashboard" className={cls}>
        <svg className="w-5 h-5 mx-auto mb-[3px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </svg>
        首頁
      </NavLink>
      <NavLink to="/history" className={cls}>
        <svg className="w-5 h-5 mx-auto mb-[3px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
        </svg>
        交易
      </NavLink>
      <NavLink to="/receive" className={cls}>
        <svg className="w-5 h-5 mx-auto mb-[3px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7h-7" />
        </svg>
        收款
      </NavLink>
      <NavLink to="/account" className={cls}>
        <svg className="w-5 h-5 mx-auto mb-[3px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        我的
      </NavLink>
    </nav>
  )
}