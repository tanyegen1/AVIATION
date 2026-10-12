import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api } from './api'
import type { ApiStatus } from './types'
import { AuthProvider, useAuth } from './AuthContext'
import RequireAuth from './components/RequireAuth'
import Landing from './pages/Landing'
import Login from './pages/Login'
import ProjectList from './pages/ProjectList'
import ProjectOverview from './pages/ProjectOverview'
import DocumentsPage from './pages/DocumentsPage'
import DocumentViewer from './pages/DocumentViewer'
import FindingsList from './pages/FindingsList'
import FindingDetail from './pages/FindingDetail'
import ExportScreen from './pages/ExportScreen'

function AppShell({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ApiStatus | null>(null)
  const { authEnabled, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">
          RecordBridge
          <span className="tagline">Human-reviewed technical records assistant</span>
        </div>
        <nav>
          <NavLink to="/projects" end>
            Projects
          </NavLink>
        </nav>
        {status && (
          <span className={`mode-pill ${status.live_mode_available ? 'live' : ''}`}>
            {status.live_mode_available ? `Live mode ready (${status.live_model})` : 'Demo mode only - no API key configured'}
          </span>
        )}
        {authEnabled && (
          <button className="small" onClick={handleLogout}>
            Log out
          </button>
        )}
      </header>
      {children}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppShell>
                <Routes>
                  <Route path="/projects" element={<ProjectList />} />
                  <Route path="/projects/:projectId" element={<ProjectOverview />} />
                  <Route path="/projects/:projectId/documents" element={<DocumentsPage />} />
                  <Route path="/projects/:projectId/documents/:documentId" element={<DocumentViewer />} />
                  <Route path="/projects/:projectId/findings" element={<FindingsList />} />
                  <Route path="/projects/:projectId/findings/:findingId" element={<FindingDetail />} />
                  <Route path="/projects/:projectId/export" element={<ExportScreen />} />
                </Routes>
              </AppShell>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
