import { useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button.js'

interface TxSnapshot {
  amount: string
  symbolName: string
  networkName: string
  toAddress: string
}

const COIN_BG: Record<string, string> = {
  BTC: 'bg-[#f7931a]', ETH: 'bg-[#627eea]', XRP: 'bg-[#23292f]',
  USDC: 'bg-[#2775ca]', USDT: 'bg-[#26a17b]', BNB: 'bg-[#f0b90b]',
}
const COIN_INIT: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', XRP: '✕', USDC: 'UC', USDT: 'UT', BNB: 'BN',
}

function truncate(s: string, head = 8, tail = 6) {
  return s.length > head + tail + 3 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s
}

export function SendDone() {
  const nav = useNavigate()
  const { hash = '' } = useParams<{ hash: string }>()
  const location = useLocation()
  const tx = location.state as TxSnapshot | null
  const [hashCopied, setHashCopied] = useState(false)

  function copyHash() {
    void navigator.clipboard.writeText(hash).then(() => {
      setHashCopied(true)
      setTimeout(() => setHashCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="screen-scroll flex-1 flex flex-col px-[18px] py-8 overflow-y-auto">

        {/* Success icon */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-[72px] h-[72px] rounded-full bg-[#e9f7ee] flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-[22px] font-bold tracking-tight">交易已送出</h2>
          <p className="text-ink-2 text-sm mt-1">已廣播至區塊鏈網路</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-[10px] py-[3px] rounded-full bg-[#fff4e5] text-[#b06a00] mt-3">
            <span className="w-[6px] h-[6px] rounded-full bg-[#f6851b] inline-block" />
            確認中
          </span>
        </div>

        {/* Token + amount */}
        {tx && (
          <div className="flex items-center gap-3 bg-[#f2f4f6] rounded-[14px] p-4 mb-4">
            <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center font-bold text-white text-[15px] flex-shrink-0 ${COIN_BG[tx.symbolName] ?? 'bg-ink-2'}`}>
              {COIN_INIT[tx.symbolName] ?? tx.symbolName.slice(0, 2)}
            </div>
            <div className="flex-1">
              <div className="text-[20px] font-bold tabular-nums">{tx.amount} {tx.symbolName}</div>
              <div className="text-xs text-ink-2 mt-[2px]">{tx.networkName} · 收款：{truncate(tx.toAddress)}</div>
            </div>
          </div>
        )}

        {/* Tx hash */}
        <div className="border border-line-soft rounded-[12px] p-[14px] mb-6">
          <div className="text-[11px] font-semibold text-ink-2 uppercase tracking-wide mb-2">交易雜湊（Tx Hash）</div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[12px] font-mono break-all text-ink leading-relaxed">
              {hash}
            </span>
            <button
              onClick={copyHash}
              className="flex-shrink-0 text-[12px] font-semibold text-orange border border-orange/40 rounded-lg px-3 py-1 hover:bg-orange/5 transition-colors"
            >
              {hashCopied ? '已複製' : '複製'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-[10px]">
          <Button variant="dark" onClick={() => nav(`/tx/${hash}`)}>
            查看交易詳情
          </Button>
          <Button variant="ghost" onClick={() => nav('/dashboard')}>
            回到首頁
          </Button>
        </div>

        <p className="text-[11px] text-ink-2 mt-5 text-center leading-relaxed">
          區塊鏈交易廣播後無法撤回。<br />確認所需時間視網路狀況而定。
        </p>
      </div>
    </div>
  )
}