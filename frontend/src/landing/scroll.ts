import { useEffect, useRef, type RefObject } from 'react'

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * pin:  0 when the section's top reaches the viewport top, 1 when its bottom
 *       reaches the viewport bottom (for tall sections with a sticky child).
 * pass: 0 when the section's top enters from below, 1 when it has fully left.
 * exit: 0 at the top of the page, 1 once the section has scrolled one full
 *       section-height out of view (hero parallax).
 */
export type ProgressMode = 'pin' | 'pass' | 'exit'

export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  onFrame: (progress: number) => void,
  mode: ProgressMode,
) {
  const cb = useRef(onFrame)
  cb.current = onFrame

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      let p: number
      if (mode === 'pin') p = -r.top / Math.max(1, r.height - vh)
      else if (mode === 'pass') p = (vh - r.top) / (vh + r.height)
      else p = -r.top / Math.max(1, r.height)
      cb.current(prefersReducedMotion() ? 1 : clamp01(p))
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
  }, [ref, mode])
}

/** Adds `is-in` to the element the first time it scrolls into view. */
export function useReveal<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [threshold])
  return ref
}
