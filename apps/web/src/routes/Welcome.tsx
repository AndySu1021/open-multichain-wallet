import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.js'

export function Welcome() {
  const nav = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-full px-[18px] pb-6 text-center">
      <div className="text-[64px] mb-[6px]">🦊</div>
      <h1 className="text-[24px] font-bold tracking-tight mb-[6px]">狐錢包</h1>
      <p className="text-ink-2 text-sm mb-8">一個錢包，管理 BTC · ETH · ERC20 · XRP</p>
      <Button onClick={() => nav('/login')}>開始使用</Button>
      <Button variant="ghost" className="mt-[10px]" onClick={() => nav('/login')}>
        我已有帳號
      </Button>
      <p className="text-ink-2 text-[11px] mt-7 leading-relaxed">
        託管式錢包 · 私鑰由平台安全保管<br />
        登入即代表同意服務條款
      </p>
    </div>
  )
}