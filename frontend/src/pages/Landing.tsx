import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark, BrandWordmark } from '../components/Brand'
import { PlaneShape, PlaneSvg } from '../landing/Plane'
import { clamp01, prefersReducedMotion, useReveal, useScrollProgress } from '../landing/scroll'
import '../landing/landing.css'

/* ------------------------------------------------------------------ */
/* Shared page chrome                                                  */
/* ------------------------------------------------------------------ */

export function useDarkPageBackground() {
  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#010f24'
    return () => {
      document.body.style.background = prev
    }
  }, [])
}

function LandingNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <a href="#top" className="lp-nav-brand" aria-label="RecordBridge home">
        <BrandMark size={30} />
        <span className="lp-nav-name">RecordBridge</span>
      </a>
      <nav className="lp-nav-links">
        <a href="#flight-plan">How it works</a>
        <a href="#evidence">Evidence</a>
        <a href="#checks">Checks</a>
      </nav>
      <Link to="/login" className="lp-btn lp-btn-primary lp-btn-sm">
        Enter workspace
      </Link>
      <div className="lp-progress" aria-hidden="true">
        <div className="lp-progress-bar" />
        <PlaneSvg size={16} className="lp-progress-plane" />
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  const ref = useRef<HTMLElement>(null)
  useScrollProgress(ref, (p) => ref.current?.style.setProperty('--hp', p.toFixed(4)), 'exit')

  return (
    <section ref={ref} className="lp-hero" id="top">
      <div className="lp-sky" aria-hidden="true">
        <div className="lp-stars" />
        <div className="lp-cloud c1" />
        <div className="lp-cloud c2" />
        <div className="lp-cloud c3" />
        <div className="lp-flightline f1">
          <div className="lp-flyer">
            <span className="lp-contrail" />
            <PlaneSvg size={64} className="lp-flyer-plane" />
          </div>
        </div>
        <div className="lp-flightline f2">
          <div className="lp-flyer">
            <span className="lp-contrail" />
            <PlaneSvg size={30} className="lp-flyer-plane" />
          </div>
        </div>
      </div>

      <div className="lp-hero-content">
        <span className="lp-eyebrow lp-load lp-d1">Aviation technical records · Human-reviewed</span>
        <div className="lp-hero-wordmark lp-load lp-d2">
          <BrandWordmark height={120} className="lp-wordmark-img" />
          <span className="lp-glint" aria-hidden="true" />
        </div>
        <h1 className="lp-hero-title lp-load lp-d3">
          Bridge raw maintenance documents to <em>reviewed, evidence-backed</em> records.
        </h1>
        <p className="lp-hero-sub lp-load lp-d4">
          Upload component status sheets and release records. RecordBridge extracts the fields, cites the exact page
          and excerpt for each one, and flags discrepancies — then a qualified reviewer makes every call.
        </p>
        <div className="lp-hero-cta lp-load lp-d5">
          <Link to="/login" className="lp-btn lp-btn-primary">
            Enter workspace →
          </Link>
          <a href="#flight-plan" className="lp-btn lp-btn-ghost">
            See the flight plan
          </a>
        </div>
      </div>

      <div className="lp-runway" aria-hidden="true">
        <div className="lp-runway-surface">
          <div className="lp-runway-center" />
          <div className="lp-runway-edge left" />
          <div className="lp-runway-edge right" />
        </div>
      </div>

      <a href="#flight-plan" className="lp-scroll-cue" aria-label="Scroll down">
        <span>Scroll for takeoff</span>
        <i />
      </a>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Flight plan: a route that draws itself as you scroll                */
/* ------------------------------------------------------------------ */

const STAGES = [
  {
    code: 'DEP',
    phase: 'Departure',
    title: 'Upload',
    body: 'Drop in component status sheets and maintenance/release records as PDFs. Each file is checked for type, size, page count and password protection, and exact duplicates are caught by hash — originals are preserved untouched.',
  },
  {
    code: 'CLB',
    phase: 'Climb',
    title: 'Extract',
    body: 'Pages are processed in bounded batches, starting from a page range you choose. Every value keeps its page number and verbatim excerpt. Anything unreadable stays empty — never a plausible guess.',
  },
  {
    code: 'CRZ',
    phase: 'Cruise',
    title: 'Match',
    body: 'Records are linked by part number and serial number together — never by a "similar" serial. Matches are suggestions until a reviewer confirms them.',
  },
  {
    code: 'APP',
    phase: 'Approach',
    title: 'Check',
    body: 'A small, explicit rules engine flags missing identifiers, conflicting values and decreasing usage — and only when component, chronology and usage basis are genuinely comparable.',
  },
  {
    code: 'LDG',
    phase: 'Landing',
    title: 'Review & export',
    body: 'Open the evidence page, correct a field (the original is kept), confirm or dismiss findings, then export a CSV and PDF report with scope, checks run and open uncertainties.',
  },
]

const STOPS = [0.02, 0.26, 0.5, 0.74, 0.98]

// Same route shape at two scales: the compact one is drawn in a smaller
// coordinate space so labels and the plane stay legible on a phone.
const ROUTES = {
  wide: {
    viewBox: '0 0 1200 560',
    d: 'M 70 470 C 250 480, 300 170, 470 180 S 700 460, 860 360 S 1050 110, 1140 100',
    planeScale: 0.85,
    labelY: -26,
  },
  compact: {
    viewBox: '0 0 600 330',
    d: 'M 40 280 C 125 286, 150 100, 235 106 S 350 272, 430 212 S 525 64, 565 58',
    planeScale: 0.62,
    labelY: -22,
  },
}

type RouteLayout = keyof typeof ROUTES

function useRouteLayout(mapRef: RefObject<HTMLDivElement | null>): RouteLayout {
  const [layout, setLayout] = useState<RouteLayout>(() =>
    typeof window !== 'undefined' && window.innerWidth < 760 ? 'compact' : 'wide',
  )
  useEffect(() => {
    const el = mapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      setLayout(entry.contentRect.width < 720 ? 'compact' : 'wide')
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapRef])
  return layout
}

function FlightPlan() {
  const reduced = prefersReducedMotion()
  const mapRef = useRef<HTMLDivElement>(null)
  const layout = useRouteLayout(mapRef)
  const route = ROUTES[layout]
  const sectionRef = useRef<HTMLElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const trailRef = useRef<SVGPathElement>(null)
  const planeRef = useRef<SVGGElement>(null)
  const lenRef = useRef(0)
  const [nodes, setNodes] = useState<{ x: number; y: number }[]>([])
  const [active, setActive] = useState(0)

  const place = (t: number) => {
    const path = pathRef.current
    const len = lenRef.current
    if (!path || !len) return
    if (trailRef.current) trailRef.current.style.strokeDashoffset = String(len * (1 - t))
    const at = t * len
    const p = path.getPointAtLength(at)
    const a = path.getPointAtLength(Math.max(0, at - 1))
    const b = path.getPointAtLength(Math.min(len, at + 1))
    const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    planeRef.current?.setAttribute('transform', `translate(${p.x} ${p.y}) rotate(${deg}) scale(${route.planeScale})`)
    let idx = 0
    STOPS.forEach((s, i) => {
      if (t >= s - 0.015) idx = i
    })
    setActive((prev) => (prev === idx ? prev : idx))
  }

  useLayoutEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    lenRef.current = len
    if (trailRef.current) trailRef.current.style.strokeDasharray = String(len)
    setNodes(STOPS.map((s) => path.getPointAtLength(s * len)))
    if (reduced) place(1)
    else window.dispatchEvent(new Event('scroll')) // re-sync the plane to the current scroll position
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  useScrollProgress(
    sectionRef,
    (p) => {
      const t = clamp01((p - 0.04) / 0.9)
      sectionRef.current?.style.setProperty('--fp', t.toFixed(4))
      place(t)
    },
    'pin',
  )

  const stage = STAGES[active]

  return (
    <section ref={sectionRef} className={`lp-flight ${reduced ? 'is-static' : ''}`} id="flight-plan">
      <div className="lp-flight-sticky">
        <div className="lp-flight-head">
          <span className="lp-eyebrow">Flight plan</span>
          <h2 className="lp-h2">From raw PDF to reviewed record, in five legs.</h2>
        </div>

        <div className="lp-flight-body">
        <div className="lp-flight-map" ref={mapRef}>
          <svg
            viewBox={route.viewBox}
            preserveAspectRatio="xMidYMid meet"
            className={`lp-flight-svg is-${layout}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="lp-trail" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#5aa2ff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#a8d8ff" stopOpacity="1" />
              </linearGradient>
              <filter id="lp-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path ref={pathRef} d={route.d} className="lp-route-ghost" />
            <path ref={trailRef} d={route.d} className="lp-route" stroke="url(#lp-trail)" filter="url(#lp-glow)" />
            {nodes.map((n, i) => (
              <g key={i} className={`lp-node ${i <= active ? 'is-on' : ''} ${i === active ? 'is-current' : ''}`} transform={`translate(${n.x} ${n.y})`}>
                <circle r="16" className="lp-node-halo" />
                <circle r="7" className="lp-node-dot" />
                <text y={route.labelY} textAnchor="middle" className="lp-node-code">
                  {STAGES[i].code}
                </text>
              </g>
            ))}
            <g ref={planeRef} className="lp-route-plane" filter="url(#lp-glow)">
              <PlaneShape />
            </g>
          </svg>
        </div>

        {!reduced && (
          <aside className="lp-flight-aside">
            <ol className="lp-leg-list">
              {STAGES.map((s, i) => (
                <li key={s.code} className={i === active ? 'is-current' : i < active ? 'is-done' : ''}>
                  <span>{s.code}</span>
                  {s.title}
                </li>
              ))}
            </ol>
            <div className="lp-stage-card is-live" key={active}>
              <div className="lp-stage-meta">
                <span>{stage.code}</span> {stage.phase} · leg {active + 1} of {STAGES.length}
              </div>
              <h3>{stage.title}</h3>
              <p>{stage.body}</p>
              <div className="lp-stage-pips">
                {STAGES.map((s, i) => (
                  <i key={s.code} className={i <= active ? 'is-on' : ''} />
                ))}
              </div>
            </div>
          </aside>
        )}
        </div>

        {reduced && (
          <div className="lp-stage-list">
            {STAGES.map((s) => (
              <div key={s.code} className="lp-stage-card">
                <div className="lp-stage-meta">
                  <span>{s.code}</span> {s.phase}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Evidence: a sample page is read line by line as you scroll          */
/* ------------------------------------------------------------------ */

const DOC_LINES: { text: string; smudge?: boolean }[] = [
  { text: 'Part Number: PN-1000-A' },
  { text: 'Serial Number: SN-100234' },
  { text: 'Component Description: ', smudge: true },
  { text: 'Release Date: 2024-01-10' },
  { text: 'Flight Hours at Release: 1500 (since new)' },
  { text: 'Work Order Reference: WO-55521' },
]

const FIELDS: { label: string; value: string | null; excerpt: string | null }[] = [
  { label: 'Part number', value: 'PN-1000-A', excerpt: 'Part Number: PN-1000-A' },
  { label: 'Serial number', value: 'SN-100234', excerpt: 'Serial Number: SN-100234' },
  { label: 'Description', value: null, excerpt: null },
  { label: 'Release date', value: '2024-01-10', excerpt: 'Release Date: 2024-01-10' },
  { label: 'Flight hours', value: '1500 · since new', excerpt: 'Flight Hours at Release: 1500 (since new)' },
  { label: 'Work order', value: 'WO-55521', excerpt: 'Work Order Reference: WO-55521' },
]

function Evidence() {
  const ref = useRef<HTMLElement>(null)
  const [step, setStep] = useState(prefersReducedMotion() ? DOC_LINES.length : 0)

  useScrollProgress(
    ref,
    (p) => {
      const t = clamp01((p - 0.05) / 0.8)
      ref.current?.style.setProperty('--ep', t.toFixed(4))
      const s = Math.min(DOC_LINES.length, Math.floor(t * (DOC_LINES.length + 0.3)))
      setStep((prev) => (prev === s ? prev : s))
    },
    'pin',
  )

  return (
    <section ref={ref} className="lp-evidence" id="evidence">
      <div className="lp-evidence-sticky">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Evidence, not guesswork</span>
          <h2 className="lp-h2">Every value keeps its receipt.</h2>
          <p className="lp-lead">
            Each extracted field carries the page it came from and the exact text that supports it — checked against the
            page's own text where the PDF is digital. If a value can't be read, it stays empty and goes to a reviewer.
          </p>
        </div>

        <div className="lp-evidence-stage">
          <div className="lp-doc">
            <div className="lp-doc-banner">Synthetic sample · not a real record</div>
            <div className="lp-doc-title">Component Maintenance / Release Record</div>
            {DOC_LINES.map((l, i) => (
              <div key={i} className={`lp-doc-line ${step > i ? 'is-read' : ''}`}>
                {l.text}
                {l.smudge && <span className="lp-smudge" />}
              </div>
            ))}
            <div className="lp-doc-foot">Page 1 of 1</div>
            <div className="lp-doc-scan" aria-hidden="true" />
          </div>

          <div className="lp-fields">
            <div className="lp-fields-head">
              <span>Extracted fields</span>
              <span className="lp-fields-count">
                {Math.min(step, FIELDS.length)}/{FIELDS.length}
              </span>
            </div>
            {FIELDS.map((f, i) => (
              <div key={f.label} className={`lp-chip ${step > i ? 'is-in' : ''} ${f.value === null ? 'is-null' : ''}`}>
                <div className="lp-chip-top">
                  <span className="lp-chip-label">{f.label}</span>
                  <span className={`lp-chip-badge ${f.value === null ? 'warn' : 'ok'}`}>
                    {f.value === null ? 'Needs review' : 'Text verified'}
                  </span>
                </div>
                <div className="lp-chip-value">{f.value ?? 'null — unreadable'}</div>
                <div className="lp-chip-meta">
                  {f.excerpt ? `p.1 · “${f.excerpt}”` : 'p.1 · left empty, never guessed'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Checks: a departure board of what the rules engine does (and not)   */
/* ------------------------------------------------------------------ */

function FlapText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="lp-flap" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ animationDelay: `${delay + i * 28}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}

const BOARD = [
  { code: 'RB-101', check: 'Required identifiers', scope: 'Missing or unreadable, per review template', status: 'ACTIVE', tone: 'ok' },
  { code: 'RB-202', check: 'Conflicting values', scope: 'Confirmed matches only', status: 'ACTIVE', tone: 'ok' },
  { code: 'RB-303', check: 'Decreasing usage', scope: 'Comparable component, dates, units & basis', status: 'ACTIVE', tone: 'ok' },
  { code: 'RB-404', check: 'Expected document', scope: 'Only when your template requires it', status: 'ON REQUEST', tone: 'hold' },
  { code: 'RB-000', check: 'Airworthiness verdict', scope: 'Never issued — a human decides', status: 'CANCELLED', tone: 'stop' },
]

function Checks() {
  const boardRef = useReveal<HTMLDivElement>(0.25)
  return (
    <section className="lp-checks" id="checks">
      <div className="lp-section-head">
        <span className="lp-eyebrow">Rules, not verdicts</span>
        <h2 className="lp-h2">Small, explicit checks. Nothing on autopilot.</h2>
        <p className="lp-lead">
          No model is asked "is this compliant?". Discrepancies come from plain, inspectable rules — and when identity,
          chronology or usage basis is unclear, the answer is "needs review", never a guess.
        </p>
      </div>

      <div ref={boardRef} className="lp-board">
        <div className="lp-board-head">
          <span>Check</span>
          <span className="lp-board-scope-h">Scope</span>
          <span>Status</span>
        </div>
        {BOARD.map((row, i) => (
          <div key={row.code} className="lp-board-row">
            <div className="lp-board-check">
              <span className="lp-board-code">{row.code}</span>
              <FlapText text={row.check.toUpperCase()} delay={i * 160} />
            </div>
            <div className="lp-board-scope">{row.scope}</div>
            <div className={`lp-board-status ${row.tone}`}>
              <FlapText text={row.status} delay={i * 160 + 300} />
            </div>
          </div>
        ))}
      </div>

      <p className="lp-board-note">“No findings” means no findings from the selected checks — never “compliant”.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Principles                                                          */
/* ------------------------------------------------------------------ */

const PRINCIPLES = [
  {
    title: 'Nothing fabricated',
    body: 'Unreadable values stay empty. Demo mode is labelled as simulated and never pretends to be a live AI result.',
    icon: (
      <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4" />
    ),
  },
  {
    title: 'Evidence you can open',
    body: 'Jump from any field or finding straight to its page. A cited page is a lead to check — not proof on its own.',
    icon: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l6 6" />
      </>
    ),
  },
  {
    title: 'Corrections keep history',
    body: 'Fix a value and the original stays on record. Findings that relied on it are marked for re-review.',
    icon: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2" />,
  },
  {
    title: 'Humans make the call',
    body: 'Matches are suggestions, findings are prompts. Confirm, dismiss, resolve — with notes and timestamps.',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
  },
]

function Principles() {
  const gridRef = useReveal<HTMLDivElement>(0.15)
  return (
    <section className="lp-principles">
      <div className="lp-section-head">
        <span className="lp-eyebrow">Built for review</span>
        <h2 className="lp-h2">Designed around the reviewer, not around the AI.</h2>
      </div>
      <div ref={gridRef} className="lp-principle-grid">
        {PRINCIPLES.map((p, i) => (
          <div key={p.title} className="lp-principle" style={{ transitionDelay: `${i * 110}ms` }}>
            <svg viewBox="0 0 24 24" className="lp-principle-icon" aria-hidden="true">
              {p.icon}
            </svg>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Final call to action: the plane takes off as the section arrives    */
/* ------------------------------------------------------------------ */

function Takeoff() {
  const ref = useRef<HTMLElement>(null)
  useScrollProgress(ref, (p) => ref.current?.style.setProperty('--tp', p.toFixed(4)), 'pass')
  return (
    <section ref={ref} className="lp-takeoff">
      <div className="lp-takeoff-plane" aria-hidden="true">
        <span className="lp-contrail" />
        <PlaneSvg size={90} />
      </div>
      <BrandMark size={64} className="lp-takeoff-mark" />
      <h2 className="lp-h2">Cleared for takeoff.</h2>
      <p className="lp-lead">The workspace is private. Enter with your access password to start a review.</p>
      <Link to="/login" className="lp-btn lp-btn-primary lp-btn-lg">
        Enter workspace →
      </Link>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-brand">
        <BrandWordmark height={22} />
      </div>
      <p>
        RecordBridge supports human review of aviation technical records. It does not certify airworthiness,
        authenticate documents, or issue regulatory compliance decisions.
      </p>
      <span className="lp-footer-small">© {new Date().getFullYear()} RecordBridge</span>
    </footer>
  )
}

/* ------------------------------------------------------------------ */

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null)
  useDarkPageBackground()

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      rootRef.current?.style.setProperty('--pp', (max > 0 ? clamp01(window.scrollY / max) : 0).toFixed(4))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div ref={rootRef} className="lp">
      <LandingNav />
      <main>
        <Hero />
        <FlightPlan />
        <Evidence />
        <Checks />
        <Principles />
        <Takeoff />
      </main>
      <Footer />
    </div>
  )
}
