import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { BrandMark } from '../components/Brand'
import type { ApiStatus, Project, ProjectSummary } from '../types'
import { Icon, type IconName } from '../ui/Icon'

interface ShellState {
  status: ApiStatus | null
  project: Project | null
  summary: ProjectSummary | null
  /** Re-fetch project + counts after any change that affects them. */
  refreshProject: () => void
}

const ShellContext = createContext<ShellState>({ status: null, project: null, summary: null, refreshProject: () => {} })

export function useShell(): ShellState {
  return useContext(ShellContext)
}

const SECTION_LABEL: Record<string, string> = {
  '': 'Overview',
  documents: 'Documents',
  findings: 'Findings',
  export: 'Export',
}

export default function AppShell({ children }: { children: ReactNode }) {
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  const location = useLocation()
  const navigate = useNavigate()
  const { authEnabled, logout } = useAuth()

  const [status, setStatus] = useState<ApiStatus | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
  }, [])

  const refreshProject = useCallback(() => {
    if (!projectId) {
      setProject(null)
      setSummary(null)
      return
    }
    api.getProject(projectId).then(setProject).catch(() => setProject(null))
    api.projectSummary(projectId).then(setSummary).catch(() => setSummary(null))
  }, [projectId])

  // Refresh on navigation (cheap, and keeps the sidebar counts honest).
  useEffect(refreshProject, [refreshProject, location.pathname])

  // While anything is processing, keep counts moving without a manual reload.
  const active = summary?.documents.active ?? 0
  useEffect(() => {
    if (!projectId || active === 0) return
    const t = window.setInterval(refreshProject, 2500)
    return () => window.clearInterval(t)
  }, [projectId, active, refreshProject])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const rest = match?.params['*'] ?? ''
  const sectionKey = rest.split('/')[0] ?? ''
  const hasDetail = rest.split('/').filter(Boolean).length > 1
  const base = projectId ? `/projects/${projectId}` : ''

  const items: { to: string; label: string; icon: IconName; end?: boolean; count?: number; tone?: string; hint?: string }[] = projectId
    ? [
        { to: base, label: 'Overview', icon: 'grid', end: true },
        { to: `${base}/documents`, label: 'Documents', icon: 'file', count: summary?.documents.total },
        {
          to: `${base}/findings`,
          label: 'Findings',
          icon: 'alert',
          count: summary?.findings.open,
          tone: summary && summary.findings.open > 0 ? 'warn' : undefined,
          hint: summary && summary.matches.suggested > 0 ? `${summary.matches.suggested} match${summary.matches.suggested === 1 ? '' : 'es'} to confirm` : undefined,
        },
        { to: `${base}/export`, label: 'Export', icon: 'download' },
      ]
    : []

  return (
    <ShellContext.Provider value={{ status, project, summary, refreshProject }}>
      <div className="shell">
        <aside className="sidebar">
          <Link to="/projects" className="sidebar-brand">
            <BrandMark size={26} />
            <span>RecordBridge</span>
          </Link>

          <nav className="sidebar-nav">
            <NavLink to="/projects" end className="sidebar-link">
              <Icon name="folder" />
              <span>All projects</span>
            </NavLink>

            {projectId && (
              <>
                <div className="sidebar-section" title={project?.name}>
                  {project?.name ?? 'Project'}
                </div>
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end} className="sidebar-link">
                    <Icon name={it.icon} />
                    <span className="sidebar-link-label">
                      {it.label}
                      {it.hint && <small>{it.hint}</small>}
                    </span>
                    {typeof it.count === 'number' && <span className={`sidebar-count ${it.tone ?? ''}`}>{it.count}</span>}
                  </NavLink>
                ))}
              </>
            )}
          </nav>

          <div className="sidebar-foot">
            {status && (
              <div className={`mode-card ${status.live_mode_available ? 'is-live' : 'is-demo'}`}>
                <div className="mode-card-title">
                  <span className="mode-dot" />
                  {status.live_mode_available ? 'Live mode' : 'Demo mode'}
                </div>
                <div className="mode-card-body">
                  {status.live_mode_available
                    ? `Live extraction available (${status.live_model}). Demo stays selectable per document.`
                    : 'Demo — synthetic documents and simulated extraction. No API key is configured.'}
                </div>
              </div>
            )}
            {authEnabled && (
              <button className="sidebar-link sidebar-logout" onClick={handleLogout}>
                <Icon name="logout" />
                <span>Log out</span>
              </button>
            )}
          </div>
        </aside>

        <div className="shell-main">
          <header className="topbar">
            <Link to="/projects" className="topbar-mark" aria-label="All projects">
              <BrandMark size={22} tone="navy" />
            </Link>
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link to="/projects">Projects</Link>
              {projectId && (
                <>
                  <Icon name="chevronRight" size={14} />
                  {sectionKey || hasDetail ? (
                    <Link to={base} className="crumb-project">
                      {project?.name ?? '…'}
                    </Link>
                  ) : (
                    <span className="crumb-project crumb-current">{project?.name ?? '…'}</span>
                  )}
                  {sectionKey && (
                    <>
                      <Icon name="chevronRight" size={14} />
                      {hasDetail ? (
                        <Link to={`${base}/${sectionKey}`}>{SECTION_LABEL[sectionKey] ?? sectionKey}</Link>
                      ) : (
                        <span className="crumb-current">{SECTION_LABEL[sectionKey] ?? sectionKey}</span>
                      )}
                    </>
                  )}
                </>
              )}
            </nav>
            <div className="topbar-right">
              {status && (
                <span className={`mode-pill ${status.live_mode_available ? 'is-live' : 'is-demo'}`} title={status.live_mode_available ? `Live: ${status.live_model}` : 'Demo — synthetic documents and simulated extraction'}>
                  <span className="mode-dot" />
                  {status.live_mode_available ? 'Live' : 'Demo'}
                </span>
              )}
              {authEnabled && (
                <button className="icon-btn topbar-logout" onClick={handleLogout} aria-label="Log out">
                  <Icon name="logout" />
                </button>
              )}
            </div>
          </header>

          <main className="shell-content">{children}</main>
        </div>

        {projectId && (
          <nav className="tabbar" aria-label="Project sections">
            {items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className="tabbar-link">
                <span className="tabbar-icon">
                  <Icon name={it.icon} size={20} />
                  {typeof it.count === 'number' && it.count > 0 && it.tone && <span className="tabbar-dot" />}
                </span>
                {it.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </ShellContext.Provider>
  )
}
