import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { Balance } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { useAuthStore } from '../store/auth.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.js'

const COIN_STYLE: Record<string, string> = {
  BTC: 'bg-[#f7931a]',
  ETH: 'bg-[#627eea]',
  XRP: 'bg-[#23292f]',
  USDC: 'bg-[#2775ca]',
  USDT: 'bg-[#26a17b]',
}

const COIN_INIT: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', XRP: '✕', USDC: 'UC', USDT: 'UT',
}

function TokenRow({ b }: { b: Balance }) {
  const nav = useNavigate()
  return (
    <div
      className="flex items-center gap-3 py-[11px] px-[2px] cursor-pointer rounded-[10px] hover:bg-[#fafbfc]"
      onClick={() => nav('/send')}
    >
      <div className={`w-[38px] h-[38px] rounded-full flex items-center justify-center font-bold text-white text-[13px] flex-shrink-0 ${COIN_STYLE[b.asset] ?? 'bg-ink-2'}`}>
        {COIN_INIT[b.asset] ?? b.asset.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <b className="block text-[14px]">{b.asset}</b>
        <small className="text-ink-2 text-xs">{b.chain === 'eth' && b.asset !== 'ETH' ? 'ERC20' : b.chain.toUpperCase()}</small>
      </div>
      <div className="text-right">
        <b className="block text-[14px] tabular-nums">${b.usdValue}</b>
        <small className={`text-xs ${(b.change24h ?? '').startsWith('-') ? 'text-red-500' : 'text-green-600'}`}>
          {b.amount} {b.asset}{b.change24h ? ` · ${b.change24h}` : ''}
        </small>
      </div>
    </div>
  )
}

export function Dashboard() {
  const nav = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['balances'],
    queryFn: () => api.get<{ balances: Balance[] }>('/wallet/balances'),
    refetchInterval: 30_000,
  })

  const balances = data?.balances ?? []
  const total = balances.reduce((sum, b) => sum + parseFloat(b.usdValue), 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* App header */}
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft">
        <button className="inline-flex items-center gap-[7px] bg-white border border-line rounded-full py-[5px] px-[11px] text-[12.5px] font-semibold">
          <span className="w-[18px] h-[18px] rounded-full bg-[#627eea] inline-block" />
          全部網路
          <svg className="w-[11px] h-[11px] opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
        </button>
        <button onClick={() => { logout(); nav('/') }} className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-orange-400 to-[#037dd6]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        {/* Balance card */}
        <div className="border border-line-soft rounded-card p-5 text-center shadow-sm mb-4">
          <div className="text-xs font-semibold text-ink-2 tracking-wide uppercase">總資產估值</div>
          <div className="text-[34px] font-bold tracking-tight tabular-nums my-[6px]">
            ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <button
            className="inline-flex items-center gap-[7px] bg-[#f2f4f6] rounded-full px-3 py-[6px] text-xs text-ink-2 mt-3"
            onClick={() => nav('/receive')}
          >
            🦊 {user?.email ?? '...'} <span className="text-[13px]">⧉</span>
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-2 my-4">
          {[
            { label: 'Send', icon: '↑', onClick: () => nav('/send'), primary: true },
            { label: 'Receive', icon: '↓', onClick: () => nav('/receive'), primary: false },
            { label: 'Buy', icon: '+', disabled: true },
            { label: 'Swap', icon: '⇄', disabled: true },
          ].map(({ label, icon, onClick, primary, disabled }) => (
            <div
              key={label}
              className={`flex-1 flex flex-col items-center gap-[6px] cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={!disabled ? onClick : undefined}
            >
              <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center text-lg ${primary ? 'bg-orange text-white' : 'bg-white border border-line text-ink'}`}>
                {icon}
              </div>
              <span className="text-xs font-semibold">{label}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line-soft mb-[10px]">
          <div className="py-[9px] text-[13px] font-semibold text-ink border-b-2 border-orange mr-[18px]">代幣</div>
          <div className="py-[9px] text-[13px] font-semibold text-ink-2 cursor-pointer mr-[18px]" onClick={() => nav('/history')}>活動</div>
        </div>

        {isLoading && <LoadingState label="同步餘額中…" />}
        {error && <ErrorState message="餘額載入失敗" onRetry={() => void refetch()} />}
        {!isLoading && !error && balances.length === 0 && (
          <EmptyState icon="👛" label="尚無資產，請先進入 Receive 建立地址" />
        )}
        {balances.map((b) => <TokenRow key={`${b.chain}-${b.asset}`} b={b} />)}
      </div>

      <BottomNav />
    </div>
  )
}