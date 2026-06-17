import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button.js'

export function SendDone() {
  const nav = useNavigate()
  const { hash } = useParams<{ hash: string }>()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="screen-scroll flex-1 flex flex-col items-center justify-center px-[18px] gap-[6px] text-center">
        {/* Success icon */}
        <div className="w-[72px] h-[72px] rounded-full bg-[#e9f7ee] flex items-center justify-center mx-auto mb-2 text-[34px]">
          ✓
        </div>
        <h2 className="text-[20px] font-bold tracking-tight">交易已送出</h2>
        <p className="text-ink-2 text-sm mt-1">已廣播至區塊鏈網路</p>

        <span className="inline-block text-[10px] font-semibold px-[7px] py-[2px] rounded-full bg-[#fff4e5] text-[#b06a00] mt-1 mb-[18px]">
          ● 確認中
        </span>

        <div className="w-full flex flex-col gap-[10px]">
          <Button variant="dark" onClick={() => nav(`/tx/${hash ?? ''}`)}>
            查看交易詳情
          </Button>
          <Button variant="ghost" onClick={() => nav('/dashboard')}>
            回到首頁
          </Button>
        </div>
      </div>
    </div>
  )
}