import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import RequireAuth from './components/RequireAuth'
import Landing from './pages/Landing'
import Login from './pages/Login'
import AppShell from './shell/AppShell'
import { FeedbackProvider } from './ui/feedback'
import ErrorBoundary from './ui/ErrorBoundary'
import { Skeleton } from './ui/primitives'

// The reviewer app (incl. the heavy PDF viewer) loads only after login, so the
// public landing page stays light.
const ProjectList = lazy(() => import('./pages/ProjectList'))
const ProjectOverview = lazy(() => import('./pages/ProjectOverview'))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'))
const DocumentViewer = lazy(() => import('./pages/DocumentViewer'))
const FindingsInbox = lazy(() => import('./pages/FindingsInbox'))
const ExportScreen = lazy(() => import('./pages/ExportScreen'))

function ScreenBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

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
                  <ScreenBoundary>
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
                      {/* One route so the inbox keeps its state while the selection changes. */}
                      <Route path="/projects/:projectId/findings/:findingId?" element={<FindingsInbox />} />
                      <Route path="/projects/:projectId/export" element={<ExportScreen />} />
                      <Route path="*" element={<Navigate to="/projects" replace />} />
                    </Routes>
                  </Suspense>
                  </ScreenBoundary>
                </AppShell>
              </RequireAuth>
            }
          />
        </Routes>
      </FeedbackProvider>
    </AuthProvider>
  )
}
