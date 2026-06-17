import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { Address, Chain } from '@fox-wallet/shared'
import { CHAIN_LABELS } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { BottomNav } from '../components/ui/BottomNav.js'

const CHAIN_WARN: Record<Chain, string> = {
  eth: '僅傳送 Ethereum / ERC20 資產到此地址。傳入 BTC 或 XRP 將永久遺失。',
  btc: '僅傳送 Bitcoin 到此地址。傳入 ETH 或 XRP 將永久遺失。',
  xrp: '僅傳送 XRP 到此地址。傳入 ETH 或 BTC 將永久遺失。',
}

export function Receive() {
  const nav = useNavigate()
  const [chain, setChain] = useState<Chain>('eth')
  const [copied, setCopied] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['address', chain],
    queryFn: () => api.get<Address>(`/wallet/address?chain=${chain}`),
  })

  function copy() {
    if (data?.address) {
      void navigator.clipboard.writeText(data.address).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft flex-shrink-0">
        <button
          onClick={() => nav(-1)}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          返回
        </button>
        <b className="text-[15px]">收款</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4 text-center">
        {/* Chain picker */}
        <div className="flex gap-2 mb-4">
          {(['eth', 'btc', 'xrp'] as Chain[]).map((c) => (
            <button
              key={c}
              onClick={() => setChain(c)}
              className={`flex-1 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${
                chain === c
                  ? 'border-orange text-orange bg-[#fff6ee]'
                  : 'border-line text-ink-2 bg-white hover:bg-[#fafbfc]'
              }`}
            >
              {CHAIN_LABELS[c]}
            </button>
          ))}
        </div>

        {/* QR code */}
        <div className="w-[180px] h-[180px] mx-auto my-4 rounded-[14px] border-[6px] border-white shadow flex items-center justify-center bg-white">
          {isLoading ? (
            <span className="text-ink-2 text-sm animate-pulse">建立中…</span>
          ) : error ? (
            <span className="text-red-500 text-xs px-2">地址建立失敗</span>
          ) : data?.address ? (
            <div className="relative">
              <QRCodeSVG
                value={data.address}
                size={156}
                level="M"
                imageSettings={{ src: '', x: undefined, y: undefined, height: 36, width: 36, excavate: true }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[20px] pointer-events-none">
                🦊
              </span>
            </div>
          ) : null}
        </div>

        <p className="text-ink-2 text-xs mb-1">你的 {CHAIN_LABELS[chain]} 地址</p>
        {isLoading ? (
          <div className="h-5 w-48 mx-auto bg-line-soft rounded animate-pulse" />
        ) : (
          <div className="font-semibold break-all text-[13px] px-3 leading-relaxed text-ink">
            {data?.address ?? '—'}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-[10px] mt-[18px]">
          <button
            onClick={copy}
            disabled={!data?.address}
            className="flex-1 bg-white border border-line rounded-full py-[10px] text-[13px] font-semibold hover:border-[#b9bdc1] disabled:opacity-40"
          >
            {copied ? '已複製 ✓' : '⧉ 複製'}
          </button>
          <button
            onClick={() => data?.address && void navigator.share?.({ text: data.address })}
            disabled={!data?.address}
            className="flex-1 bg-white border border-line rounded-full py-[10px] text-[13px] font-semibold hover:border-[#b9bdc1] disabled:opacity-40"
          >
            ↗ 分享
          </button>
        </div>

        {/* Warning */}
        <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mt-[18px] text-left">
          <span className="flex-shrink-0">⚠</span>
          <span>{CHAIN_WARN[chain]}</span>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}