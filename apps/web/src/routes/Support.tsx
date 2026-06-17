import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.js'

const FAQ = [
  '我的私鑰存在哪裡？',
  '轉錯鏈的資產能找回嗎？',
  '如何新增 ERC20 代幣？',
  '交易一直顯示「確認中」怎麼辦？',
  '忘記密碼如何還原帳號？',
]

export function Support() {
  const nav = useNavigate()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft flex-shrink-0">
        <button onClick={() => nav('/account')} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5l-7 7 7 7" /></svg>
          返回
        </button>
        <b className="text-[15px]">支援與說明</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        <input
          placeholder="🔍 搜尋說明文章"
          className="w-full border border-line rounded-[10px] px-[13px] py-3 text-sm font-sans bg-white focus:outline-none focus:border-orange mb-[14px]"
        />

        <div className="text-[12px] font-semibold text-ink-2 mb-[6px]">常見問題</div>
        {FAQ.map((q) => (
          <div
            key={q}
            className="flex items-center py-[13px] px-[2px] cursor-pointer border-b border-line-soft last:border-0 hover:bg-[#fafbfc] rounded"
          >
            <span className="flex-1 text-[13.5px] font-medium">{q}</span>
            <span className="text-ink-2">›</span>
          </div>
        ))}

        <div className="text-[12px] font-semibold text-ink-2 mt-5 mb-3">聯絡我們</div>
        <div className="flex flex-col gap-[10px]">
          <Button variant="dark">💬 線上客服（24 小時）</Button>
          <Button variant="ghost">✉️ 寄送電子郵件</Button>
        </div>

        <div className="bg-[#fafbfc] border border-line-soft rounded-[12px] p-[14px] text-[13px] mt-4">
          {[
            { label: 'App 版本', value: 'v0.1.0' },
            { label: '服務條款', value: '查看 ›', highlight: true },
            { label: '隱私權政策', value: '查看 ›', highlight: true },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="flex justify-between py-[5px]">
              <span className="text-ink-2">{label}</span>
              <span className={highlight ? 'text-orange-deep font-semibold cursor-pointer' : 'font-semibold'}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}