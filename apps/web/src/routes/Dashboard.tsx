import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { AssetBalance, NetworkItem, QuoteSymbolItem } from '@fox-wallet/shared'
import { api } from '../api/client.js'
import { BottomNav } from '../components/ui/BottomNav.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui/States.js'

const PROTOCOL_COLOR: Record<string, string> = {
  BTC: 'bg-[#f7931a]',
  ERC20: 'bg-[#627eea]',
  XRP: 'bg-[#23292f]',
  BEP20: 'bg-[#f0b90b]',
}

const SYMBOL_COLOR: Record<string, string> = {
  USDC: 'bg-[#2775ca]',
  USDT: 'bg-[#26a17b]',
}

const SYMBOL_INIT: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', XRP: '✕', USDC: 'UC', USDT: 'UT', BNB: 'BN',
}

function fmt(value: string) {
  const n = parseFloat(value)
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2)
}

function AssetRow({ b, quoteSymbol, showValue }: { b: AssetBalance; quoteSymbol: QuoteSymbolItem | null; showValue: boolean }) {
  const nav = useNavigate()
  const colorClass = SYMBOL_COLOR[b.symbolName] ?? PROTOCOL_COLOR[b.networkProtocol] ?? 'bg-ink-2'

  return (
    <div
      className="flex items-center gap-3 py-[11px] px-[2px] cursor-pointer rounded-[10px] hover:bg-[#fafbfc]"
      onClick={() => nav('/send', { state: { assetBalance: b } })}
    >
      {b.symbolImageUrl
        ? <img src={`/api${b.symbolImageUrl}`} alt={b.symbolName} className="w-[38px] h-[38px] rounded-full object-cover flex-shrink-0" />
        : <div className={`w-[38px] h-[38px] rounded-full flex items-center justify-center font-bold text-white text-[13px] flex-shrink-0 ${colorClass}`}>
            {SYMBOL_INIT[b.symbolName] ?? b.symbolName.slice(0, 2)}
          </div>
      }
      <div className="flex-1 min-w-0">
        <b className="block text-[14px]">{b.symbolName}</b>
        <small className="text-ink-2 text-xs">{b.networkName}</small>
      </div>
      <div className="text-right">
        <b className="block text-[14px] tabular-nums">{b.balance}</b>
        {quoteSymbol
          ? <small className="text-xs text-ink-2">
              {showValue && b.value !== undefined ? `≈ $ ${fmt(b.value)}` : '≈ $ *****'}
            </small>
          : <small className="text-xs text-ink-2">{b.symbolName}</small>
        }
      </div>
    </div>
  )
}

function NetworkPicker({
  networks,
  selectedId,
  onSelect,
}: {
  networks: NetworkItem[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = networks.find((n) => n.id === selectedId)
  const label = selected?.name ?? '全部網路'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-[7px] bg-white border border-line rounded-full py-[5px] px-[11px] text-[12.5px] font-semibold"
      >
        {selected?.imageUrl
          ? <img src={`/api${selected.imageUrl}`} alt={selected.name} className="w-[18px] h-[18px] rounded-full object-cover" />
          : <span className="w-[18px] h-[18px] rounded-full bg-[#627eea] inline-block" />
        }
        {label}
        <svg
          className={`w-[11px] h-[11px] opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
        >
          <path d="M3 4.5 6 7.5 9 4.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-50 bg-white border border-line rounded-[14px] shadow-lg py-1 min-w-[160px]">
          <button
            onClick={() => { onSelect(null); setOpen(false) }}
            className={`w-full flex items-center gap-2 px-4 py-[10px] text-[13px] font-semibold text-left hover:bg-[#fafbfc] ${selectedId === null ? 'text-orange' : 'text-ink'}`}
          >
            <span className="w-[18px] h-[18px] rounded-full bg-[#627eea] inline-block flex-shrink-0" />
            全部網路
          </button>
          {networks.map((n) => (
            <button
              key={n.id}
              onClick={() => { onSelect(n.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-4 py-[10px] text-[13px] font-semibold text-left hover:bg-[#fafbfc] ${selectedId === n.id ? 'text-orange' : 'text-ink'}`}
            >
              {n.imageUrl
                ? <img src={`/api${n.imageUrl}`} alt={n.name} className="w-[18px] h-[18px] rounded-full object-cover flex-shrink-0" />
                : <span className={`w-[18px] h-[18px] rounded-full inline-block flex-shrink-0 ${PROTOCOL_COLOR[n.protocol] ?? 'bg-ink-2'}`} />
              }
              {n.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Dashboard() {
  const nav = useNavigate()
  const [selectedNetworkId, setSelectedNetworkId] = useState<number | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null)
  const [showValue, setShowValue] = useState(true)
  const [isValueLoading, setIsValueLoading] = useState(false)
  const loadingStartRef = useRef<number>(0)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: networksData } = useQuery({
    queryKey: ['networks'],
    queryFn: () => api.get<{ networks: NetworkItem[] }>('/networks'),
    staleTime: 5 * 60_000,
  })

  const { data: quoteData } = useQuery({
    queryKey: ['quote-symbols'],
    queryFn: () => api.get<{ quoteSymbols: QuoteSymbolItem[] }>('/quote-symbols'),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    const first = quoteData?.quoteSymbols[0]
    if (first && selectedQuoteId === null) setSelectedQuoteId(first.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteData])

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['balances', selectedNetworkId, selectedQuoteId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (selectedNetworkId != null) params.set('networkId', String(selectedNetworkId))
      if (selectedQuoteId != null) params.set('quoteSymbolId', String(selectedQuoteId))
      const qs = params.toString() ? `?${params.toString()}` : ''
      return api.get<{ balances: AssetBalance[]; totalValue?: string }>(`/wallet/balances${qs}`)
    },
    refetchInterval: 30_000,
  })

  useEffect(() => {
    if (isFetching) {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
      loadingStartRef.current = Date.now()
      setIsValueLoading(true)
    } else {
      const elapsed = Date.now() - loadingStartRef.current
      const remaining = Math.max(0, 200 - elapsed)
      loadingTimerRef.current = setTimeout(() => setIsValueLoading(false), remaining)
    }
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetching])

  const networks = networksData?.networks ?? []
  const quoteSymbols = quoteData?.quoteSymbols ?? []
  const balances = data?.balances ?? []
  const totalValue = data?.totalValue
  const selectedQuote = quoteSymbols.find((q) => q.id === selectedQuoteId) ?? null

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* App header */}
      <div className="flex items-center justify-between px-4 py-[14px] border-b border-line-soft">
        <NetworkPicker
          networks={networks}
          selectedId={selectedNetworkId}
          onSelect={setSelectedNetworkId}
        />
        <button
          onClick={() => nav('/account')}
          className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-orange-400 to-[#037dd6]"
        />
      </div>

      <div className="screen-scroll overflow-y-auto flex-1 px-[18px] py-4">
        {/* Balance card */}
        <div className="border border-line-soft rounded-card p-5 text-center shadow-sm mb-4">
          <div className="flex items-center justify-center gap-[6px]">
            <span className="text-xs font-semibold text-ink-2 tracking-wide uppercase">總資產</span>
            {selectedQuoteId !== null && (
              <button
                onClick={() => setShowValue((v) => !v)}
                className="text-ink-2 hover:text-ink transition-colors"
                aria-label={showValue ? '隱藏估值' : '顯示估值'}
              >
                {showValue ? (
                  <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            )}
          </div>
          <div className="text-[30px] font-bold tracking-tight tabular-nums my-[6px] flex items-center justify-center">
            {showValue
              ? isValueLoading && !isLoading
                ? <div className="h-[36px] w-[140px] bg-[#e7eaed] rounded-[8px] animate-pulse" />
                : totalValue !== undefined ? <>$ {fmt(totalValue)}</> : <>$ *****</>
              : <>$ *****</>
            }
          </div>

          {/* Quote symbol picker */}
          {quoteSymbols.length > 0 && (
            <div className="flex items-center justify-center gap-[6px] mt-2 flex-wrap">
              {quoteSymbols.map((q) => (
                <button
                  key={q.id}
                  onClick={() => { setSelectedQuoteId(q.id); setShowValue(true) }}
                  className={`text-[11.5px] font-semibold px-3 py-[4px] rounded-full border transition-colors ${
                    selectedQuoteId === q.id && showValue
                      ? 'bg-orange text-white border-orange'
                      : 'bg-white text-ink-2 border-line hover:border-orange hover:text-orange'
                  }`}
                >
                  {q.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-2 my-4">
          {[
            { label: '發送', icon: '↑', onClick: () => nav('/send'), primary: true },
            { label: '接收', icon: '↓', onClick: () => nav('/receive'), primary: false },
            { label: '購買', icon: '+', disabled: true },
            { label: '閃兌', icon: '⇄', disabled: true },
          ].map(({ label, icon, onClick, primary, disabled }) => (
            <div
              key={label}
              className={`flex-1 flex flex-col items-center gap-[6px] cursor-pointer ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              onClick={!disabled ? onClick : undefined}
            >
              <div className={`w-[46px] h-[46px] rounded-full flex items-center justify-center text-lg ${primary ? 'bg-orange text-white' : 'bg-white border border-line text-ink'}`}>
                {icon}
              </div>
              <span className="text-xs font-semibold">{label}</span>
            </div>
          ))}
        </div>

        {/* List header */}
        <div className="mb-[8px] mt-1 pl-[2px]">
          <span className="text-[15px] font-bold text-ink">代幣</span>
        </div>

        {isLoading && <LoadingState label="載入資產中…" />}
        {error && <ErrorState message="資產載入失敗" onRetry={() => void refetch()} />}
        {!isLoading && !error && balances.length === 0 && (
          <EmptyState icon="👛" label="尚無資產" />
        )}
        {balances.map((b) => <AssetRow key={b.assetId} b={b} quoteSymbol={selectedQuote} showValue={showValue} />)}
      </div>

      <BottomNav />
    </div>
  )
}