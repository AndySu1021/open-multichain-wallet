import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.js'
import { hydrateFromStorage } from './store/auth.js'
import './styles/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 10_000, retry: 1 },
  },
})

const rootEl = document.getElementById('root')!

function DeviceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-[340px] h-[680px] bg-white rounded-device shadow-lg overflow-hidden flex flex-col border border-line-soft">
        <div className="h-[30px] flex items-center justify-center gap-[5px] bg-[#fafbfc] border-b border-line-soft flex-shrink-0">
          <i className="w-[5px] h-[5px] rounded-full bg-line block" />
          <i className="w-[5px] h-[5px] rounded-full bg-line block" />
          <i className="w-[5px] h-[5px] rounded-full bg-line block" />
        </div>
        {children}
      </div>
    </div>
  )
}

// Hydrate auth state from localStorage before first render to avoid
// a flash of the login page when the user already has a valid session.
hydrateFromStorage().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <DeviceShell>
            <App />
          </DeviceShell>
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})