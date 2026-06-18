import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button.js'
import { usePendingTx } from '../store/pendingTx.js'

interface FailState {
  error: string
  amount: string
  symbolName: string
  networkName: string
  toAddress: string
}

function SymbolIcon({ symbolName }: { symbolName: string }) {
  return (
    <img
      src={`/api/icons/symbol/${symbolName}.png`}
      alt={symbolName}
      className="w-[46px] h-[46px] rounded-full object-cover flex-shrink-0"
      onError={(e) => {
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

function truncate(s: string, head = 8, tail = 6) {
  return s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s
}

export function SendFail() {
  const nav = useNavigate()
  const location = useLocation()
  const { form, symbolName, chain, clear } = usePendingTx()
  const state = location.state as FailState | null

  function retry() {
    if (form && symbolName && chain) {
      nav('/send', {
        replace: true,
        state: {
          retryState: {
            asset: symbolName,
            chain,
            toAddress: form.toAddress,
            amount: form.amount,
            ...(form.destinationTag !== undefined ? { destinationTag: String(form.destinationTag) } : {}),
          },
        },
      })
    } else {
      nav('/send', { replace: true })
    }
  }

  function cancel() {
    clear()
    nav('/dashboard', { replace: true })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="screen-scroll flex-1 flex flex-col px-[18px] py-8 overflow-y-auto">

        {/* Fail icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-[72px] h-[72px] rounded-full bg-[#fef2f2] flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-[22px] font-bold tracking-tight">交易失敗</h2>
          <p className="text-ink-2 text-sm mt-1">交易未能送出至區塊鏈網路</p>
        </div>

        {/* Token + amount */}
        {state && (
          <div className="flex items-center gap-3 bg-[#f2f4f6] rounded-[14px] p-4 mb-4">
            <SymbolIcon symbolName={state.symbolName} />
            <div className="flex-1">
              <div className="text-[20px] font-bold tabular-nums">{state.amount} {state.symbolName}</div>
              <div className="text-xs text-ink-2 mt-[2px]">{state.networkName} · 收款：{truncate(state.toAddress)}</div>
            </div>
          </div>
        )}

        {/* Error reason */}
        {state?.error && (
          <div className="border border-red-100 bg-[#fff8f8] rounded-[12px] p-[14px] mb-6">
            <div className="text-[11px] font-semibold text-red-400 uppercase tracking-wide mb-2">錯誤原因</div>
            <p className="text-[13px] text-red-600 leading-relaxed break-all">{state.error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-[10px]">
          <Button onClick={retry}>重新嘗試</Button>
          <Button variant="ghost" onClick={cancel}>取消交易</Button>
        </div>

        <p className="text-[11px] text-ink-2 mt-5 text-center leading-relaxed">
          點擊「重新嘗試」將返回確認頁面重送交易。<br />點擊「取消交易」將清除此筆交易資料。
        </p>
      </div>
    </div>
  )
}
