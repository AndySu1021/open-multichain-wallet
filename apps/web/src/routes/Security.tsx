import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.js'

function SettingRow({
  icon, title, sub, chevron = false, toggle, onToggle,
}: {
  icon: string; title: string; sub: string
  chevron?: boolean; toggle?: boolean; onToggle?: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-[13px] px-[2px]" style={{ cursor: chevron ? 'pointer' : 'default' }}>
      <div className="w-9 h-9 rounded-[9px] bg-[#f2f4f6] flex items-center justify-center text-lg flex-shrink-0">{icon}</div>
      <div className="flex-1 ml-[10px]">
        <b className="block text-[14px]">{title}</b>
        <small className="text-ink-2 text-xs">{sub}</small>
      </div>
      {chevron && <span className="text-ink-2">›</span>}
      {toggle !== undefined && (
        <div
          onClick={onToggle}
          className={`w-[40px] h-[23px] rounded-full relative transition-colors cursor-pointer flex-shrink-0 ${toggle ? 'bg-green-500' : 'bg-line'}`}
        >
          <span className={`absolute top-[2px] w-[19px] h-[19px] rounded-full bg-white shadow transition-all ${toggle ? 'left-[19px]' : 'left-[2px]'}`} />
        </div>
      )}
    </div>
  )
}

export function Security() {
  const nav = useNavigate()
  const user = useAuthStore((s) => s.user)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft flex-shrink-0">
        <button onClick={() => nav('/account')} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5l-7 7 7 7" /></svg>
          返回
        </button>
        <b className="text-[15px]">安全與登入</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        {/* Login methods */}
        <div className="text-[12px] font-semibold text-ink-2 mt-2 mb-[6px]">登入方式</div>

        <div className="flex items-center gap-3 py-[11px]">
          <div className="w-9 h-9 rounded-[9px] bg-[#f2f4f6] flex items-center justify-center flex-shrink-0 text-sm">G</div>
          <div className="flex-1 ml-[10px]">
            <b className="block text-[14px]">Google</b>
            <small className="text-ink-2 text-xs">{user?.email}</small>
          </div>
          <span className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full bg-[#e9f7ee] text-green-700">已連結</span>
        </div>

        <div className="flex items-center gap-3 py-[11px]">
          <div className="w-9 h-9 rounded-[9px] bg-[#f2f4f6] flex items-center justify-center flex-shrink-0">✉️</div>
          <div className="flex-1 ml-[10px]">
            <b className="block text-[14px]">Email</b>
            <small className="text-ink-2 text-xs">{user?.email}</small>
          </div>
          <span className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full bg-[#e9f7ee] text-green-700">已驗證</span>
        </div>

        {/* Security settings */}
        <div className="text-[12px] font-semibold text-ink-2 mt-5 mb-[6px]">安全設定</div>
        <SettingRow icon="🔑" title="變更密碼" sub="上次更新 30 天前" chevron />
        <SettingRow icon="📱" title="雙重驗證 (2FA)" sub="以驗證 App 產生動態碼" toggle={true} />
        <SettingRow icon="👆" title="生物辨識解鎖" sub="Face ID / 指紋" toggle={true} />
        <SettingRow icon="⏱" title="自動鎖定" sub="閒置 5 分鐘後鎖定" toggle={true} />

        {/* Active sessions */}
        <div className="text-[12px] font-semibold text-ink-2 mt-5 mb-[6px]">登入裝置</div>
        <div className="flex items-center gap-3 py-[11px]">
          <div className="w-9 h-9 rounded-[9px] bg-[#f2f4f6] flex items-center justify-center flex-shrink-0">💻</div>
          <div className="flex-1 ml-[10px]">
            <b className="block text-[14px]">目前瀏覽器</b>
            <small className="text-ink-2 text-xs">目前裝置</small>
          </div>
          <span className="text-[10px] font-semibold px-[7px] py-[2px] rounded-full bg-[#e9f7ee] text-green-700">使用中</span>
        </div>

        <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mt-4">
          <span>🔒</span>
          <span>託管式錢包：私鑰由平台保管，帳號還原透過 Google / email 驗證，無需助記詞。</span>
        </div>
      </div>
    </div>
  )
}