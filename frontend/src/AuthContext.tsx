import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

interface AuthState {
  loading: boolean
  authEnabled: boolean
  authenticated: boolean
  login: (password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.authMe()
      setAuthEnabled(res.auth_enabled)
      setAuthenticated(res.authenticated)
    } catch {
      // If the check itself fails, fail closed (treat as not authenticated).
      setAuthEnabled(true)
      setAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (password: string) => {
    const res = await api.authLogin(password)
    setAuthEnabled(res.auth_enabled)
    setAuthenticated(res.authenticated)
  }, [])

  const logout = useCallback(async () => {
    await api.authLogout()
    setAuthenticated(false)
  }, [])

  return (
    <AuthContext.Provider value={{ loading, authEnabled, authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
