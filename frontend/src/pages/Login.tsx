import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { ApiError } from '../api'
import { BrandMark } from '../components/Brand'
import { PlaneSvg } from '../landing/Plane'
import { useDarkPageBackground } from './Landing'
import '../landing/landing.css'

export default function Login() {
  const { loading, authEnabled, authenticated, login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  useDarkPageBackground()

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
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="lp-nav-brand" aria-label="RecordBridge home">
          <BrandMark size={30} />
          <span className="lp-nav-name">RecordBridge</span>
        </Link>
      </header>

      <main className="lp-login">
        <div className="lp-sky" aria-hidden="true">
          <div className="lp-stars" />
          <div className="lp-cloud c1" />
          <div className="lp-cloud c3" />
          <div className="lp-flightline f2">
            <div className="lp-flyer">
              <span className="lp-contrail" />
              <PlaneSvg size={30} className="lp-flyer-plane" />
            </div>
          </div>
        </div>

        <form className="lp-login-card" onSubmit={handleSubmit}>
          <BrandMark size={56} className="lp-login-mark" />
          <h1>Enter workspace</h1>
          <p className="lp-login-sub">This workspace is private. Enter the access password to continue.</p>

          {error && (
            <div className="lp-login-error" role="alert">
              {error}
            </div>
          )}

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />

          <button className="lp-btn lp-btn-primary" type="submit" disabled={submitting || !password}>
            {submitting ? 'Checking…' : 'Enter'}
          </button>

          <Link to="/" className="lp-login-back">
            ← Back to RecordBridge
          </Link>
        </form>
      </main>
    </div>
  )
}
