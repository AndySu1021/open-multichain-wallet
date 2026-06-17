import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { Button } from '../components/ui/Button.js'

export function Account() {
  const nav = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft">
        <span className="w-6" />
        <b className="text-[15px]">我的</b>
        <span className="w-6" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        <div className="text-center mb-[18px]">
          <div className="w-16 h-16 rounded-full mx-auto mb-[10px] bg-gradient-to-br from-orange-400 to-[#037dd6]" />
          <b className="text-[16px]">{user?.email}</b>
        </div>

        {[
          { icon: '🔐', title: '安全與登入', sub: 'Google 已連結 · 變更密碼', to: '/account/security' },
          { icon: '❓', title: '支援與說明', sub: '常見問題 · 聯絡客服', to: '/account/support' },
        ].map(({ icon, title, sub, to }) => (
          <div
            key={to}
            className="flex items-center gap-3 py-[13px] px-[2px] cursor-pointer rounded-[10px] hover:bg-[#fafbfc]"
            onClick={() => nav(to)}
          >
            <div className="w-9 h-9 rounded-[9px] bg-[#f2f4f6] flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
            <div className="flex-1 ml-[10px]">
              <b className="block text-[14px]">{title}</b>
              <small className="text-ink-2 text-xs">{sub}</small>
            </div>
            <span className="text-ink-2">›</span>
          </div>
        ))}

        <div className="mt-[18px]">
          <Button
            variant="ghost"
            className="text-red-500 border-red-200"
            onClick={() => { logout(); nav('/') }}
          >
            登出
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}