import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ApiError } from '../api'

export default function Login() {
  const { loading, authEnabled, authenticated, login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  if (!loading && (!authEnabled || authenticated)) {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from
    return <Navigate to={from?.pathname ?? '/projects'} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(password)
      navigate('/projects', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a few minutes before trying again.')
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Incorrect password.')
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="landing">
      <div className="landing-bg" aria-hidden="true" />
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          RecordBridge
        </Link>
      </header>

      <main className="login-card-wrap">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Enter workspace</h1>
          <p className="subtitle">This workspace is private. Enter the access password to continue.</p>

          {error && <div className="error-banner">{error}</div>}

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />

          <button className="primary large" type="submit" disabled={submitting || !password} style={{ marginTop: 16, width: '100%' }}>
            {submitting ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </main>
    </div>
  )
}
