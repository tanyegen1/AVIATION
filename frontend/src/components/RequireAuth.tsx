import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, authEnabled, authenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="loading-state">Loading…</div>
  }

  if (authEnabled && !authenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
