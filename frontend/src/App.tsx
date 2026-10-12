import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import RequireAuth from './components/RequireAuth'
import Landing from './pages/Landing'
import Login from './pages/Login'
import AppShell from './shell/AppShell'
import { FeedbackProvider } from './ui/feedback'
import { Skeleton } from './ui/primitives'

// The reviewer app (incl. the heavy PDF viewer) loads only after login, so the
// public landing page stays light.
const ProjectList = lazy(() => import('./pages/ProjectList'))
const ProjectOverview = lazy(() => import('./pages/ProjectOverview'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const DocumentViewer = lazy(() => import('./pages/DocumentViewer'))
const FindingsList = lazy(() => import('./pages/FindingsList'))
const FindingDetail = lazy(() => import('./pages/FindingDetail'))
const ExportScreen = lazy(() => import('./pages/ExportScreen'))

export default function App() {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppShell>
                  <Suspense
                    fallback={
                      <div className="page">
                        <Skeleton lines={4} />
                      </div>
                    }
                  >
                    <Routes>
                      <Route path="/projects" element={<ProjectList />} />
                      <Route path="/projects/:projectId" element={<ProjectOverview />} />
                      <Route path="/projects/:projectId/documents" element={<DocumentsPage />} />
                      <Route path="/projects/:projectId/documents/:documentId" element={<DocumentViewer />} />
                      <Route path="/projects/:projectId/findings" element={<FindingsList />} />
                      <Route path="/projects/:projectId/findings/:findingId" element={<FindingDetail />} />
                      <Route path="/projects/:projectId/export" element={<ExportScreen />} />
                      <Route path="*" element={<Navigate to="/projects" replace />} />
                    </Routes>
                  </Suspense>
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </FeedbackProvider>
    </AuthProvider>
  )
}
