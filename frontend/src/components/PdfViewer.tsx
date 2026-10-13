import { useEffect, useState } from 'react'
import { Document as PdfDocument, Page, Thumbnail, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Icon } from '../ui/Icon'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2]
// Past this many pages the rail shows numbered tiles instead of rendered
// thumbnails, so a long document doesn't render every page up front.
const MAX_THUMBNAILS = 40

export type PageStats = Record<number, { total: number; unreviewed: number }>

export default function PdfViewer({
  fileUrl,
  page,
  onPage,
  onNumPages,
  pageStats,
}: {
  fileUrl: string
  page: number
  onPage: (p: number) => void
  onNumPages?: (n: number) => void
  pageStats?: PageStats
}) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(2)
  const [fitWidth, setFitWidth] = useState(560)
  // Callback ref: the canvas only mounts once react-pdf has loaded the file.
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null)

  // Fit the page to the panel width; zoom multiplies that.
  useEffect(() => {
    if (!canvasEl || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setFitWidth(Math.max(240, Math.floor(entry.contentRect.width - 32))))
    ro.observe(canvasEl)
    return () => ro.disconnect()
  }, [canvasEl])

  // Keep the current page's thumbnail visible in the rail.
  useEffect(() => {
    document.querySelector('.viewer-rail .is-current')?.scrollIntoView({ block: 'nearest' })
  }, [page, numPages])

  const width = Math.round(fitWidth * ZOOMS[zoomIdx])
  const showRail = !!numPages && numPages > 1

  return (
    <div className="viewer-panel">
      <div className="viewer-controls">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" title="Previous page ( [ )">
          <Icon name="chevronLeft" />
        </button>
        <span className="page-indicator">
          Page {page}
          {numPages ? ` of ${numPages}` : ''}
        </span>
        <button
          className="icon-btn"
          disabled={!!numPages && page >= numPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          title="Next page ( ] )"
        >
          <Icon name="chevronRight" />
        </button>
        <span className="spacer" />
        <button className="icon-btn" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => z - 1)} aria-label="Zoom out">
          <Icon name="zoomOut" />
        </button>
        <button className="zoom-reset" onClick={() => setZoomIdx(2)} title="Fit to width">
          {Math.round(ZOOMS[zoomIdx] * 100)}%
        </button>
        <button className="icon-btn" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((z) => z + 1)} aria-label="Zoom in">
          <Icon name="zoomIn" />
        </button>
        <a className="icon-btn" href={fileUrl} target="_blank" rel="noreferrer" aria-label="Open original PDF" title="Open original PDF">
          <Icon name="external" />
        </a>
      </div>
      {error ? (
        <div className="viewer-canvas">
          <div className="error-banner">{error}</div>
        </div>
      ) : (
        <PdfDocument
          className="viewer-body"
          file={fileUrl}
          onLoadSuccess={(doc) => {
            setNumPages(doc.numPages)
            onNumPages?.(doc.numPages)
          }}
          onLoadError={(e) => setError(`Could not render PDF: ${e.message}`)}
          onItemClick={({ pageNumber }) => onPage(pageNumber)}
          loading={<div className="viewer-loading">Loading PDF…</div>}
        >
          {showRail && (
            <nav className="viewer-rail" aria-label="Pages">
              {Array.from({ length: numPages! }, (_, i) => i + 1).map((p) => {
                const stats = pageStats?.[p]
                const inner = (
                  <>
                    {stats && stats.unreviewed > 0 && (
                      <span className="rail-badge" title={`${stats.unreviewed} unreviewed field(s)`}>
                        {stats.unreviewed}
                      </span>
                    )}
                    {stats && stats.total > 0 && stats.unreviewed === 0 && (
                      <span className="rail-badge is-done" title="All fields on this page reviewed">
                        <Icon name="check" size={10} strokeWidth={3} />
                      </span>
                    )}
                    <span className="rail-num">{p}</span>
                  </>
                )
                const cls = `rail-page ${p === page ? 'is-current' : ''}`
                // react-pdf's Thumbnail is itself a link (clicks go to the
                // Document's onItemClick), so it can't sit inside a button.
                return numPages! <= MAX_THUMBNAILS ? (
                  <div key={p} className={cls} aria-current={p === page ? 'page' : undefined}>
                    <Thumbnail pageNumber={p} width={76} loading={<div className="rail-blank" />} />
                    {inner}
                  </div>
                ) : (
                  <button key={p} className={cls} onClick={() => onPage(p)} aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}>
                    <div className="rail-blank" />
                    {inner}
                  </button>
                )
              })}
            </nav>
          )}
          <div className="viewer-canvas" ref={setCanvasEl}>
            <Page pageNumber={page} width={width} loading={<div className="viewer-loading">Rendering page…</div>} />
          </div>
        </PdfDocument>
      )}
    </div>
  )
}
