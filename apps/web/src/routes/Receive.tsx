import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import type { AssetItem } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { LoadingState } from '../components/ui/States.js'

const PROTOCOL_COLOR: Record<string, string> = {
  BTC: 'bg-[#f7931a]',
  ERC20: 'bg-[#627eea]',
  XRP: 'bg-[#23292f]',
  BEP20: 'bg-[#f0b90b]',
  SOL: 'bg-[#9945ff]',
  ADA: 'bg-[#0033ad]',
}

export function Receive() {
  const nav = useNavigate()
  const [symbolName, setSymbolName] = useState<string | null>(null)
  const [networkId, setNetworkId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ assets: AssetItem[] }>('/assets'),
    staleTime: 5 * 60_000,
  })

  const allAssets: AssetItem[] = assetsData?.assets ?? []
  const allSymbols = [...new Set(allAssets.map((a) => a.symbol.name))]
  const selectedSymbol = symbolName ?? allSymbols[0] ?? ''

  const validNetworks = allAssets
    .filter((a) => a.symbol.name === selectedSymbol)
    .map((a) => a.network)
    .filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i)

  const selectedNetwork = validNetworks.find((n) => n.id === networkId) ?? validNetworks[0]

  // When asset changes, reset network if it no longer supports the selected asset
  useEffect(() => {
    if (!networkId) return
    const isValid = validNetworks.some((n) => n.id === networkId)
    if (!isValid) setNetworkId(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol])

  const { data: addressData, isLoading: addressLoading, error: addressError } = useQuery({
    queryKey: ['address', selectedNetwork?.id],
    queryFn: () => api.get<{ networkId: number; address: string; memo?: string }>(`/wallet/address?networkId=${selectedNetwork!.id}`),
    enabled: !!selectedNetwork,
  })

  function copy() {
    if (addressData?.address) {
      void navigator.clipboard.writeText(addressData.address).then(() => {
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
        {assetsLoading ? (
          <LoadingState label="載入資產中…" />
        ) : (
          <>
            {/* Asset picker */}
            <div className="mb-4 text-left">
              <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">資產</label>
              <div className="relative">
                <div className="flex items-center gap-[10px] border border-line rounded-[12px] p-3 bg-white">
                  <img
                    src={`/api/icons/symbol/${selectedSymbol}.png`}
                    alt={selectedSymbol}
                    className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                  <div className="flex-1">
                    <b className="text-[14px]">{selectedSymbol}</b>
                  </div>
                  {allSymbols.length > 1 && (
                    <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 4.5 6 7.5 9 4.5" />
                    </svg>
                  )}
                </div>
                {allSymbols.length > 1 && (
                  <select
                    value={selectedSymbol}
                    onChange={(e) => setSymbolName(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full cursor-pointer"
                  >
                    {allSymbols.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Network picker */}
            <div className="mb-4 text-left">
              <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">網路（鏈）</label>
              <div className="relative">
                <div className="flex items-center gap-[10px] border border-line rounded-[12px] p-3 bg-white">
                  {selectedNetwork?.imageUrl
                    ? <img src={`/api${selectedNetwork.imageUrl}`} className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0" />
                    : <span className={`w-[26px] h-[26px] rounded-full flex-shrink-0 ${PROTOCOL_COLOR[selectedNetwork?.protocol ?? ''] ?? 'bg-ink-2'}`} />
                  }
                  <div className="flex-1">
                    <b className="text-[14px]">{selectedNetwork?.name ?? ''}</b>
                  </div>
                  {validNetworks.length > 1 && (
                    <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 4.5 6 7.5 9 4.5" />
                    </svg>
                  )}
                </div>
                {validNetworks.length > 1 && (
                  <select
                    value={selectedNetwork?.id ?? ''}
                    onChange={(e) => setNetworkId(Number(e.target.value))}
                    className="absolute inset-0 opacity-0 w-full cursor-pointer"
                  >
                    {validNetworks.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* QR code */}
            <div className="w-[180px] h-[180px] mx-auto my-4 rounded-[14px] border-[6px] border-white shadow flex items-center justify-center bg-white">
              {addressLoading ? (
                <span className="text-ink-2 text-sm animate-pulse">建立中…</span>
              ) : addressError ? (
                <span className="text-red-500 text-xs px-2">地址建立失敗</span>
              ) : addressData?.address ? (
                <div className="relative">
                  <QRCodeSVG
                    value={addressData.address}
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

            <p className="text-ink-2 text-xs mb-1">
              你的 {selectedSymbol}{selectedNetwork ? ` (${selectedNetwork.name})` : ''} 地址
            </p>
            {addressLoading ? (
              <div className="h-5 w-48 mx-auto bg-line-soft rounded animate-pulse" />
            ) : (
              <div className="font-semibold break-all text-[13px] px-3 leading-relaxed text-ink">
                {addressData?.address ?? '—'}
              </div>
            )}

            {selectedNetwork?.protocol === 'XRP' && (
              <div className="mt-3 mx-auto inline-flex items-center gap-2 bg-[#f4f5f7] rounded-[8px] px-3 py-[6px]">
                <span className="text-[12px] text-ink-2">Destination Tag</span>
                {addressLoading ? (
                  <span className="text-[12px] text-ink-2 animate-pulse">—</span>
                ) : (
                  <span className="text-[13px] font-bold text-ink tabular-nums">
                    {addressData?.memo ?? '—'}
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-[10px] mt-[18px]">
              <button
                onClick={copy}
                disabled={!addressData?.address}
                className="flex-1 bg-white border border-line rounded-full py-[10px] text-[13px] font-semibold hover:border-[#b9bdc1] disabled:opacity-40"
              >
                {copied ? '已複製 ✓' : '⧉ 複製'}
              </button>
              <button
                onClick={() => addressData?.address && void navigator.share?.({ text: addressData.address })}
                disabled={!addressData?.address}
                className="flex-1 bg-white border border-line rounded-full py-[10px] text-[13px] font-semibold hover:border-[#b9bdc1] disabled:opacity-40"
              >
                ↗ 分享
              </button>
            </div>

            {/* Warning */}
            {selectedNetwork && validNetworks.length > 1 && (
              <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mt-[18px] text-left">
                <span className="flex-shrink-0">⚠</span>
                <span>
                  僅傳送 {selectedSymbol} 到此地址。請確認使用 {selectedNetwork.name} 網路，傳入其他網路資產將永久遺失。
                </span>
              </div>
            )}
            {selectedNetwork && validNetworks.length === 1 && (
              <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mt-[18px] text-left">
                <span className="flex-shrink-0">⚠</span>
                <span>請確認傳送的資產符合此網路，避免資產遺失。</span>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
