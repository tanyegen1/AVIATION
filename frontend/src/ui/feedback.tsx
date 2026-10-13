import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { Button } from './primitives'

/* ---------------- Toasts ---------------- */

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  title: string
  body?: string
}

interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
}

interface FeedbackApi {
  toast: (tone: ToastTone, title: string, body?: string) => void
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

const TOAST_ICON: Record<ToastTone, IconName> = { success: 'checkCircle', error: 'alertCircle', info: 'info' }

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = nextId.current++
      setToasts((t) => [...t.slice(-2), { id, tone, title, body }])
      window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500)
    },
    [dismiss],
  )

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  )

  const close = (value: boolean) => {
    pending?.resolve(value)
    setPending(null)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.tone}`}>
              <Icon name={TOAST_ICON[t.tone]} size={18} />
              <div className="toast-text">
                <div className="toast-title">{t.title}</div>
                {t.body && <div className="toast-body">{t.body}</div>}
              </div>
              <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
      {pending && (
        <Modal onClose={() => close(false)} title={pending.title}>
          {pending.body && <div className="modal-body-text">{pending.body}</div>}
          <div className="modal-actions">
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={pending.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {pending.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}

/* ---------------- Modal ---------------- */

export function Modal({
  title,
  onClose,
  children,
  width = 440,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Captured during the first render — before an autoFocus field inside
  // the dialog takes focus — so closing returns focus to the opener.
  const [restoreTo] = useState(() => document.activeElement as HTMLElement | null)

  // Dialog behaviour: Escape closes, Tab stays inside, focus moves in on
  // open (unless a field already took it via autoFocus) and goes back to
  // whatever had it before when the dialog closes.
  useEffect(() => {
    const panel = panelRef.current
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
    if (panel && !panel.contains(document.activeElement)) {
      const preferred = focusables().find((el) => !el.classList.contains('modal-close'))
      ;(preferred ?? panel).focus()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      } else if (e.key === 'Tab' && panel) {
        const list = focusables()
        if (!list.length) return
        const first = list[0]
        const last = list[list.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus()
    }
  }, [restoreTo])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
