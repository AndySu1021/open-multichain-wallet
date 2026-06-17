import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { Transaction, NetworkItem } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.js'

type TabType = 0 | 1 | 2  // 0=全部 1=傳送 2=接收

const TAB_LABELS: Record<TabType, string> = { 0: '全部', 1: '傳送', 2: '接收' }

export function History() {
  const nav = useNavigate()
  const [tab, setTab] = useState<TabType>(0)
  const [networkId, setNetworkId] = useState<number | null>(null)
  const [symbolId, setSymbolId] = useState<number | null>(null)

  const { data: networksData } = useQuery({
    queryKey: ['networks'],
    queryFn: () => api.get<{ networks: NetworkItem[] }>('/networks'),
    staleTime: 5 * 60_000,
  })

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => api.get<{ assets: { id: number; symbol: { id: number; name: string }; network: { id: number } }[] }>('/assets'),
    staleTime: 5 * 60_000,
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tx-history', tab, networkId, symbolId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (tab !== 0) params.set('type', String(tab))
      if (networkId) params.set('networkId', String(networkId))
      if (symbolId) params.set('symbolId', String(symbolId))
      const qs = params.toString() ? `?${params.toString()}` : ''
      return api.get<{ items: Transaction[]; total: number }>(`/tx/history${qs}`)
    },
  })

  const networks = networksData?.networks ?? []
  const allAssets = assetsData?.assets ?? []

  // symbols available for selected network (or all)
  const filteredSymbols = networkId
    ? allAssets.filter((a) => a.network.id === networkId).map((a) => a.symbol)
    : allAssets.map((a) => a.symbol)
  const uniqueSymbols = [...new Map(filteredSymbols.map((s) => [s.id, s])).values()]

  function handleNetworkChange(id: number | null) {
    setNetworkId(id)
    setSymbolId(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft">
        <span className="w-6" />
        <b className="text-[15px]">交易</b>
        <span className="w-6" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        {/* Type tabs */}
        <div className="flex gap-1 border-b border-line-soft mb-3">
          {([0, 1, 2] as TabType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-[9px] text-[13px] font-semibold mr-[18px] border-b-2 transition-colors ${
                tab === t ? 'text-ink border-orange' : 'text-ink-2 border-transparent'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-3">
          <select
            value={networkId ?? ''}
            onChange={(e) => handleNetworkChange(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 border border-line rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold bg-white focus:outline-none focus:border-orange"
          >
            <option value="">全部網路</option>
            {networks.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <select
            value={symbolId ?? ''}
            onChange={(e) => setSymbolId(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 border border-line rounded-[10px] px-3 py-[7px] text-[12.5px] font-semibold bg-white focus:outline-none focus:border-orange"
          >
            <option value="">全部代幣</option>
            {uniqueSymbols.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {isLoading && <LoadingState />}
        {error && <ErrorState message="無法載入交易紀錄" onRetry={() => void refetch()} />}
        {!isLoading && !error && (data?.items ?? []).length === 0 && (
          <EmptyState icon="📋" label="尚無交易紀錄" />
        )}
        {(data?.items ?? []).map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 py-[11px] cursor-pointer rounded-[10px] hover:bg-[#fafbfc] px-[2px]"
            onClick={() => nav(`/tx/${tx.txHash}`)}
          >
            <div className={`w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
              tx.type === 'send' ? 'bg-[#fdeee0] text-orange' : 'bg-[#e9f7ee] text-green-600'
            }`}>
              {tx.type === 'send' ? '↑' : '↓'}
            </div>
            <div className="flex-1 min-w-0">
              <b className="block text-[13.5px]">{tx.type === 'send' ? '傳送' : '接收'} {tx.symbolName}</b>
              <small className="text-ink-2 text-[11.5px] block truncate">
                {tx.networkName}
                {' · '}
                {tx.type === 'send' ? `至 ${tx.toAddress.slice(0, 8)}…` : `來自 ${tx.fromAddress.slice(0, 8)}…`}
              </small>
            </div>
            <div className={`text-right text-[13.5px] font-semibold tabular-nums flex-shrink-0 ${
              tx.type === 'send' ? 'text-ink' : 'text-green-600'
            }`}>
              {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.symbolName}
              <span className={`block text-[10px] font-semibold px-[7px] py-[2px] rounded-full mt-[2px] ${
                tx.status === 'pending' ? 'bg-[#fff4e5] text-[#b06a00]' : 'bg-[#e9f7ee] text-green-700'
              }`}>
                {tx.status === 'pending' ? '確認中' : '已完成'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}