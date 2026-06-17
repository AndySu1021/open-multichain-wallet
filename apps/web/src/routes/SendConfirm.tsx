import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHAIN_LABELS } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { usePendingTx } from '../store/pendingTx.js'
import { Button } from '../components/ui/Button.js'

const COIN_BG: Record<string, string> = {
  BTC: 'bg-[#f7931a]', ETH: 'bg-[#627eea]', XRP: 'bg-[#23292f]',
  USDC: 'bg-[#2775ca]', USDT: 'bg-[#26a17b]',
}
const COIN_INIT: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', XRP: '✕', USDC: 'UC', USDT: 'UT',
}

function truncate(addr: string) {
  return addr.length > 16 ? addr.slice(0, 8) + '…' + addr.slice(-6) : addr
}

export function SendConfirm() {
  const nav = useNavigate()
  const { form, fee, clear } = usePendingTx()
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const leaving = useRef(false)

  if (!form || !fee) {
    if (!leaving.current) nav('/send', { replace: true })
    return null
  }

  async function confirm() {
    if (!form) return
    setError(null)
    setIsSubmitting(true)
    try {
      const res = await api.post<{ txHash: string }>('/tx/send', form)
      const snapshot = { amount: form.amount, asset: form.asset, toAddress: form.toAddress, chain: form.chain }
      leaving.current = true
      nav(`/send/done/${res.txHash}`, { replace: true, state: snapshot })
      clear()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed')
      setIsSubmitting(false)
    }
  }

  const total = (parseFloat(fee.feeUsd) || 0).toFixed(2)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft flex-shrink-0">
        <button onClick={() => nav('/send')} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5l-7 7 7 7" /></svg>
          返回
        </button>
        <b className="text-[15px]">確認交易</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4 text-center">
        {/* Coin icon */}
        <div className={`w-14 h-14 rounded-full mx-auto mt-[14px] mb-[10px] flex items-center justify-center text-white text-[20px] font-bold ${COIN_BG[form.asset] ?? 'bg-ink-2'}`}>
          {COIN_INIT[form.asset] ?? form.asset.slice(0, 2)}
        </div>

        <div className="text-[30px] font-bold tabular-nums">{form.amount} {form.asset}</div>
        <p className="text-ink-2 mt-1 mb-[18px] text-sm">≈ ${fee.feeUsd} USD（費用）</p>

        {/* Summary */}
        <div className="bg-[#fafbfc] border border-line-soft rounded-[12px] p-[14px] text-[13px] text-left">
          {[
            { label: '網路', value: CHAIN_LABELS[form.chain] },
            { label: '收款地址', value: truncate(form.toAddress) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-[5px]">
              <span className="text-ink-2">{label}</span>
              <span className="font-semibold tabular-nums">{value}</span>
            </div>
          ))}
          <div className="flex justify-between py-[5px]">
            <span className="text-ink-2">礦工費（預估）</span>
            <span className="font-semibold tabular-nums">${fee.feeUsd}</span>
          </div>
          {fee.estimatedTime && (
            <div className="flex justify-between py-[5px]">
              <span className="text-ink-2">預估時間</span>
              <span className="font-semibold">{fee.estimatedTime}</span>
            </div>
          )}
          <div className="flex justify-between py-[5px] border-t border-line-soft mt-1 pt-[9px]">
            <span>傳送金額</span>
            <span className="font-semibold">{form.amount} {form.asset}</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="mt-[14px] flex flex-col gap-[10px]">
          <Button onClick={() => void confirm()} isLoading={isSubmitting}>
            確認傳送
          </Button>
          <Button variant="ghost" onClick={() => { clear(); nav('/send') }}>
            取消
          </Button>
        </div>

        <p className="text-[11px] text-ink-2 mt-3 leading-relaxed">
          點擊「確認傳送」即送出交易，<br />區塊鏈交易廣播後無法撤回。
        </p>
      </div>
    </div>
  )
}