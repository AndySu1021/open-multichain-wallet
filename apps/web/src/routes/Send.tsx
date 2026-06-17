import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { SendSchema, CHAIN_LABELS } from '@fox-wallet/shared'
import type { SendInput, FeeEstimate, Chain } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { usePendingTx } from '../store/pendingTx.js'
import { Button } from '../components/ui/Button.js'
import { Input } from '../components/ui/Input.js'

export function Send() {
  const nav = useNavigate()
  const setPending = usePendingTx((s) => s.set)
  const [apiError, setApiError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<SendInput>({
    resolver: zodResolver(SendSchema),
    defaultValues: { chain: 'eth', asset: 'ETH' },
  })

  const chain = watch('chain') as Chain

  async function onSubmit(data: SendInput) {
    setApiError(null)
    try {
      const fee = await api.post<FeeEstimate>('/tx/estimate', data)
      setPending(data, fee)
      nav('/send/confirm')
    } catch (e) {
      setApiError(e instanceof Error ? e.message : '無法預估費用')
    }
  }

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
          {/* Chain */}
          <div className="mb-[14px]">
            <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">網路（鏈）</label>
            <div className="relative">
              <div className="flex items-center gap-[10px] border border-line rounded-[12px] p-3 cursor-pointer bg-white">
                <span className={`w-[26px] h-[26px] rounded-full flex-shrink-0 ${chain === 'eth' ? 'bg-[#627eea]' : chain === 'btc' ? 'bg-[#f7931a]' : 'bg-[#23292f]'}`} />
                <div className="flex-1">
                  <b className="text-[14px]">{CHAIN_LABELS[chain]}</b>
                  {chain === 'eth' && <div className="text-xs text-ink-2">ERC20 代幣也走這條</div>}
                </div>
                <svg className="w-3 h-3 opacity-50" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
              </div>
              <select {...register('chain')} className="absolute inset-0 opacity-0 w-full cursor-pointer">
                {(['eth', 'btc', 'xrp'] as const).map((c) => <option key={c} value={c}>{CHAIN_LABELS[c]}</option>)}
              </select>
            </div>
          </div>

          {/* Asset */}
          <div className="mb-[14px]">
            <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">資產</label>
            <select {...register('asset')} className="w-full border border-line rounded-[10px] px-[13px] py-3 text-sm font-sans bg-white focus:outline-none focus:border-orange">
              {chain === 'eth' && <><option value="ETH">ETH</option><option value="USDC">USDC</option><option value="USDT">USDT</option></>}
              {chain === 'btc' && <option value="BTC">BTC</option>}
              {chain === 'xrp' && <option value="XRP">XRP</option>}
            </select>
          </div>

          <Input label="收款地址" placeholder="0x… 或貼上" {...register('toAddress')} error={errors.toAddress?.message} />

          {/* Amount */}
          <div className="mb-[14px]">
            <label className="block text-[12.5px] font-semibold text-ink-2 mb-[6px]">金額</label>
            <input
              {...register('amount')}
              placeholder="0.0"
              inputMode="decimal"
              className="w-full border border-line rounded-[10px] px-[13px] py-3 text-[22px] font-bold font-sans bg-white focus:outline-none focus:ring-2 focus:ring-orange/25 focus:border-orange"
            />
            {errors.amount && <p className="mt-1 text-xs text-red-500">{errors.amount.message}</p>}
            <div className="flex justify-between mt-[6px] text-xs text-ink-2">
              <span>≈ $0.00 USD</span>
              <b className="text-orange-deep cursor-pointer">最大</b>
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