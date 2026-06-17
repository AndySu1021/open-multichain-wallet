import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { Transaction } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.js'

export function History() {
  const nav = useNavigate()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tx-history'],
    queryFn: () => api.get<{ items: Transaction[]; total: number }>('/tx/history'),
  })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft">
        <span className="w-6" />
        <b className="text-[15px]">活動</b>
        <span className="w-6" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        <div className="flex gap-1 border-b border-line-soft mb-[10px]">
          <div className="py-[9px] text-[13px] font-semibold text-ink border-b-2 border-orange mr-[18px]">全部</div>
          <div className="py-[9px] text-[13px] font-semibold text-ink-2 mr-[18px]">傳送</div>
          <div className="py-[9px] text-[13px] font-semibold text-ink-2">接收</div>
        </div>

        {isLoading && <LoadingState />}
        {error && <ErrorState message="無法載入交易紀錄" onRetry={() => void refetch()} />}
        {!isLoading && !error && (data?.items ?? []).length === 0 && (
          <EmptyState icon="📋" label="尚無交易紀錄" />
        )}
        {(data?.items ?? []).map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 py-[11px] cursor-pointer"
            onClick={() => nav(`/tx/${tx.txHash}`)}
          >
            <div className="w-[38px] h-[38px] rounded-full bg-[#f2f4f6] flex items-center justify-center flex-shrink-0 text-sm">
              {tx.type === 'send' ? '↑' : '↓'}
            </div>
            <div className="flex-1">
              <b className="block text-[13.5px]">{tx.type === 'send' ? '傳送' : '接收'} {tx.asset}</b>
              <small className="text-ink-2 text-[11.5px]">
                {tx.type === 'send' ? `至 ${tx.toAddress.slice(0, 8)}…` : `來自 ${tx.fromAddress.slice(0, 8)}…`}
                {' · '}
                <span className={`inline-block text-[10px] font-semibold px-[7px] py-[2px] rounded-full ${tx.status === 'pending' ? 'bg-[#fff4e5] text-[#b06a00]' : 'bg-[#e9f7ee] text-green-700'}`}>
                  {tx.status === 'pending' ? '確認中' : '已完成'}
                </span>
              </small>
            </div>
            <div className={`text-right text-[13.5px] font-semibold tabular-nums ${tx.type === 'send' ? 'text-ink' : 'text-green-600'}`}>
              {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.asset}
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}