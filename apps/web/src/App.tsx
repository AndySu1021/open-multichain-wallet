import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.js'
import { Welcome } from './routes/Welcome.js'
import { Login } from './routes/Login.js'
import { Register } from './routes/Register.js'
import { AuthCallback } from './routes/AuthCallback.js'
import { Dashboard } from './routes/Dashboard.js'
import { Send } from './routes/Send.js'
import { SendConfirm } from './routes/SendConfirm.js'
import { SendDone } from './routes/SendDone.js'
import { Receive } from './routes/Receive.js'
import { History } from './routes/History.js'
import { TxDetail } from './routes/TxDetail.js'
import { Account } from './routes/Account.js'
import { Security } from './routes/Security.js'
import { Support } from './routes/Support.js'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected */}
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/send" element={<RequireAuth><Send /></RequireAuth>} />
      <Route path="/send/confirm" element={<RequireAuth><SendConfirm /></RequireAuth>} />
      <Route path="/send/done/:hash" element={<RequireAuth><SendDone /></RequireAuth>} />
      <Route path="/receive" element={<RequireAuth><Receive /></RequireAuth>} />
      <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
      <Route path="/tx/:hash" element={<RequireAuth><TxDetail /></RequireAuth>} />
      <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
      <Route path="/account/security" element={<RequireAuth><Security /></RequireAuth>} />
      <Route path="/account/support" element={<RequireAuth><Support /></RequireAuth>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}