// Loading, Error, Empty state components
export function LoadingState({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-ink-2">
      <div className="w-8 h-8 border-2 border-orange border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center px-4">
      <div className="text-3xl">😕</div>
      <p className="text-sm text-red-500">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-semibold text-orange-deep border border-orange/40 rounded-full px-4 py-2 hover:bg-orange/5"
        >
          重試
        </button>
      )}
    </div>
  )
}

export function EmptyState({ icon = '📭', label }: { icon?: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-ink-2">
      <div className="text-3xl">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
  )
}