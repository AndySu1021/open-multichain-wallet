import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { SendSchema } from '@fox-wallet/shared'
import type { SendInput, FeeEstimate, Chain, AssetSymbol, AssetBalance, AssetItem } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { usePendingTx } from '../store/pendingTx.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'
import { useState } from 'react'

const PROTOCOL_TO_CHAIN: Record<string, Chain> = { ERC20: 'eth', BTC: 'btc', XRP: 'xrp', BEP20: 'bsc' }
const CHAIN_TO_PROTOCOL: Record<Chain, string> = { eth: 'ERC20', btc: 'BTC', xrp: 'XRP', bsc: 'BEP20' }
const PROTOCOL_COLOR: Record<string, string> = {
  BTC: 'bg-[#f7931a]',
  ERC20: 'bg-[#627eea]',
  XRP: 'bg-[#23292f]',
  BEP20: 'bg-[#f0b90b]',
}

export function Send() {
  const nav = useNavigate()
  const location = useLocation()
  const setPending = usePendingTx((s) => s.set)
  const [apiError, setApiError] = useState<string | null>(null)

  const preSelected = (location.state as { assetBalance?: AssetBalance } | null)?.assetBalance

  const defaultChain: Chain = preSelected
    ? (PROTOCOL_TO_CHAIN[preSelected.networkProtocol] ?? 'eth')
    : 'eth'
  const defaultAsset: AssetSymbol = preSelected
    ? (preSelected.symbolName as AssetSymbol)
    : 'ETH'

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<SendInput>({
    resolver: zodResolver(SendSchema),
    defaultValues: { chain: defaultChain, asset: defaultAsset },
  })

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ assets: AssetItem[] }>('/assets'),
    staleTime: 5 * 60_000,
  })

  const { data: balancesData } = useQuery({
    queryKey: ['balances'],
    queryFn: () => api.get<{ balances: AssetBalance[] }>('/wallet/balances'),
    staleTime: 30_000,
  })

  const allAssets: AssetItem[] = assetsData?.assets ?? []
  const allBalances: AssetBalance[] = balancesData?.balances ?? []
  const selectedAsset = watch('asset') as AssetSymbol
  const selectedChain = watch('chain') as Chain

  // Unique symbols from DB
  const allSymbols = [...new Set(allAssets.map((a) => a.symbol.name))]

  // Networks that support the currently selected symbol
  const validNetworks = allAssets
    .filter((a) => a.symbol.name === selectedAsset)
    .map((a) => ({ protocol: a.network.protocol, name: a.network.name, imageUrl: a.network.imageUrl }))

  // When asset changes: auto-select chain if only one network supports it,
  // or reset chain if current chain doesn't support this asset
  useEffect(() => {
    if (validNetworks.length === 0) return
    const currentProtocol = CHAIN_TO_PROTOCOL[selectedChain]
    const isCurrentValid = validNetworks.some((n) => n.protocol === currentProtocol)
    if (!isCurrentValid) {
      const first = validNetworks[0]
      if (first) {
        const chain = PROTOCOL_TO_CHAIN[first.protocol]
        if (chain) setValue('chain', chain)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset])

  async function onSubmit(data: SendInput) {
    setApiError(null)
    try {
      const fee = await api.post<FeeEstimate>('/tx/estimate', data)
      setPending(data, fee)
      nav('/send/confirm', { state: { preSelected } })
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '無法預估費用')
    }
  }

  const currentProtocol = CHAIN_TO_PROTOCOL[selectedChain]
  const currentNetwork = validNetworks.find((n) => n.protocol === currentProtocol)
  const currentNetworkLabel = currentNetwork?.name ?? selectedChain.toUpperCase()
  const currentBalance = allBalances.find(
    (b) => b.symbolName === selectedAsset && b.networkProtocol === currentProtocol
  )

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft flex-shrink-0">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 5l-7 7 7 7" /></svg>
          返回
        </button>
        <b className="text-[15px]">傳送</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Asset */}
          <div className="mb-[14px]">
            <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">資產</label>
            <select
              {...register('asset')}
              className="w-full border border-line rounded-[10px] px-[13px] py-3 text-sm font-sans bg-white focus:outline-none focus:border-orange"
            >
              {(allSymbols.length > 0 ? allSymbols : [defaultAsset]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Chain — only shows networks valid for selected asset */}
          <div className="mb-[14px]">
            <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">網路（鏈）</label>
            <div className="relative">
              <div className="flex items-center gap-[10px] border border-line rounded-[12px] p-3 bg-white">
                {currentNetwork?.imageUrl
                  ? <img src={`/api${currentNetwork.imageUrl}`} className="w-[26px] h-[26px] rounded-full object-cover flex-shrink-0" />
                  : <span className={`w-[26px] h-[26px] rounded-full flex-shrink-0 ${PROTOCOL_COLOR[currentProtocol] ?? 'bg-ink-2'}`} />
                }
                <div className="flex-1">
                  <b className="text-[14px]">{currentNetworkLabel}</b>
                </div>
                {validNetworks.length > 1 && (
                  <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 4.5 6 7.5 9 4.5" />
                  </svg>
                )}
              </div>
              {validNetworks.length > 1 && (
                <select
                  {...register('chain')}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer"
                >
                  {validNetworks.map((n) => {
                    const c = PROTOCOL_TO_CHAIN[n.protocol]
                    return c ? <option key={c} value={c}>{n.name}</option> : null
                  })}
                </select>
              )}
            </div>
          </div>

          <Input label="收款地址" placeholder="0x… 或貼上" {...register('toAddress')} error={errors.toAddress?.message} />

          {/* Amount */}
          <div className="mb-[14px]">
            <div className="flex items-center justify-between mb-[6px]">
              <label className="text-[12.5px] font-semibold text-ink-2">金額</label>
              {currentBalance && (
                <span className="text-xs text-ink-2">
                  餘額：<span className="font-semibold text-ink">{currentBalance.balance}</span> {currentBalance.symbolName}
                </span>
              )}
            </div>
            <input
              {...register('amount')}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full border border-line rounded-[10px] px-[13px] py-3 text-[22px] font-bold font-sans bg-white focus:outline-none focus:ring-2 focus:ring-orange/25 focus:border-orange"
            />
            {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
            <div className="flex justify-between mt-[6px] text-xs text-ink-2">
              <span>≈ $0.00 USD</span>
              <b
                className="text-orange-deep cursor-pointer select-none"
                onClick={() => currentBalance?.balance && setValue('amount', currentBalance.balance)}
              >
                最大
              </b>
            </div>
          </div>

          <div className="flex gap-2 bg-[#fef5e7] text-[#9a6700] rounded-[10px] p-3 text-xs leading-relaxed mb-4">
            <span className="flex-shrink-0">⚠</span>
            <span>跨鏈提醒：請確認地址屬於所選網路，轉錯將無法找回。</span>
          </div>

          {apiError && <p className="text-xs text-red-500 mb-3">{apiError}</p>}
          <Button type="submit" isLoading={isSubmitting}>下一步</Button>
        </form>
      </div>
    </div>
  )
}