import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import type { Transaction } from '@fox-wallet/shared'
import { CHAIN_LABELS } from '@fox-wallet/shared'
import { api } from '../api/client.js'

const TYPE_LABEL = { send: '傳送', receive: '接收', swap: '兌換' }
const STATUS_LABEL = { pending: '確認中', confirmed: '已完成', failed: '失敗' }

function truncate(addr: string) {
  return addr.length > 20 ? addr.slice(0, 10) + '…' + addr.slice(-8) : addr
}

export function TxDetail() {
  const nav = useNavigate()
  const { hash } = useParams<{ hash: string }>()

  const { data: tx, isLoading, error } = useQuery({
    queryKey: ['tx', hash],
    queryFn: () => api.get<Transaction>(`/tx/${hash}`),
    enabled: !!hash,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 5_000 : false,
  })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
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
        <b className="text-[15px]">交易詳情</b>
        <span className="w-[52px]" />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        {isLoading && (
          <div className="text-center py-8 text-ink-2 text-sm animate-pulse">載入中…</div>
        )}
        {error && (
          <div className="text-center py-8 text-red-500 text-sm">無法載入交易資訊</div>
        )}
        {tx && (
          <div className="text-center">
            {/* Icon */}
            <div className="w-[38px] h-[38px] rounded-full bg-[#fdeee0] flex items-center justify-center mx-auto mt-2">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#e2761b" strokeWidth="2">
                {tx.type === 'send'
                  ? <path d="M12 19V5M5 12l7-7 7 7" />
                  : <path d="M12 5v14M5 12l7 7 7-7" />}
              </svg>
            </div>

            <div className="text-[26px] font-bold mt-1 tabular-nums">
              {tx.type === 'send' ? '-' : '+'}{tx.amount} {tx.asset}
            </div>

            <span className={`inline-block text-[10px] font-semibold px-[7px] py-[2px] rounded-full mt-2 mb-[18px] ${
              tx.status === 'pending'
                ? 'bg-[#fff4e5] text-[#b06a00]'
                : tx.status === 'confirmed'
                ? 'bg-[#e9f7ee] text-green-700'
                : 'bg-red-100 text-red-600'
            }`}>
              ● {STATUS_LABEL[tx.status] ?? tx.status}
              {tx.status === 'pending' && tx.confirmations != null && tx.requiredConfirmations != null
                ? ` (${tx.confirmations}/${tx.requiredConfirmations})`
                : ''}
            </span>

            {/* Detail rows */}
            <div className="bg-[#fafbfc] border border-line-soft rounded-[12px] p-[14px] text-[13px] text-left">
              {[
                { label: '類型', value: TYPE_LABEL[tx.type] ?? tx.type },
                { label: '網路', value: CHAIN_LABELS[tx.chain] },
                { label: tx.type === 'send' ? '至' : '來自', value: truncate(tx.type === 'send' ? tx.toAddress : tx.fromAddress) },
                ...(tx.blockTime ? [{ label: '時間', value: new Date(tx.blockTime).toLocaleString('zh-TW') }] : []),
                ...(tx.fee ? [{ label: '礦工費', value: `${tx.fee} ${tx.asset}${tx.feeUsd ? ` ($${tx.feeUsd})` : ''}` }] : []),
                ...(tx.nonce != null ? [{ label: 'Nonce', value: String(tx.nonce) }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-[5px]">
                  <span className="text-ink-2">{label}</span>
                  <span className="font-semibold tabular-nums text-right max-w-[60%] break-all">{value}</span>
                </div>
              ))}
            </div>

            <button
              className="w-full mt-3 bg-white border border-line rounded-full py-[10px] text-[13px] font-semibold hover:border-[#b9bdc1]"
              onClick={() => window.open(`https://sepolia.etherscan.io/tx/${tx.txHash}`, '_blank')}
            >
              在區塊鏈瀏覽器查看 ↗
            </button>
          </div>
        )}
      </div>
    </div>
  )
}