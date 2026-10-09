import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api } from './api'
import type { ApiStatus } from './types'
import ProjectList from './pages/ProjectList'
import ProjectOverview from './pages/ProjectOverview'
import DocumentsPage from './pages/DocumentsPage'
import DocumentViewer from './pages/DocumentViewer'
import FindingsList from './pages/FindingsList'
import FindingDetail from './pages/FindingDetail'
import ExportScreen from './pages/ExportScreen'

export default function App() {
  const [status, setStatus] = useState<ApiStatus | null>(null)

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">
          Aviation Records Workspace
          <span className="tagline">Human-reviewed technical records assistant</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Projects
          </NavLink>
        </nav>
        {status && (
          <span className={`mode-pill ${status.live_mode_available ? 'live' : ''}`}>
            {status.live_mode_available ? `Live mode ready (${status.live_model})` : 'Demo mode only - no API key configured'}
          </span>
        )}
      </header>

      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectOverview />} />
        <Route path="/projects/:projectId/documents" element={<DocumentsPage />} />
        <Route path="/projects/:projectId/documents/:documentId" element={<DocumentViewer />} />
        <Route path="/projects/:projectId/findings" element={<FindingsList />} />
        <Route path="/projects/:projectId/findings/:findingId" element={<FindingDetail />} />
        <Route path="/projects/:projectId/export" element={<ExportScreen />} />
      </Routes>
    </div>
  )
}
