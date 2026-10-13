import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Keeps a crash in one screen from blanking the whole app. A failed lazy
 *  chunk usually means a new version was deployed while this tab was open,
 *  so that case asks for a reload instead of showing an error. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating elsewhere clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const staleBuild = /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message)
    return (
      <div className="page">
        <div className="card">
          <div className="empty">
            <div className="empty-icon">
              <Icon name={staleBuild ? 'refresh' : 'alertCircle'} size={22} />
            </div>
            <h3>{staleBuild ? 'A new version is available' : 'Something went wrong on this screen'}</h3>
            <p>
              {staleBuild
                ? 'RecordBridge was updated while this tab was open. Reload to continue — your review work is saved.'
                : 'Your review work is saved on the server. Reload the page, or go back to your projects.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="btn btn-secondary btn-md" href="/projects">
                All projects
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
