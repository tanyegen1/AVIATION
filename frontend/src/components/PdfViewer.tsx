import { useEffect, useRef, useState } from 'react'
import { Document as PdfDocument, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Icon } from '../ui/Icon'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2]

export default function PdfViewer({
  fileUrl,
  page,
  onPage,
  onNumPages,
}: {
  fileUrl: string
  page: number
  onPage: (p: number) => void
  onNumPages?: (n: number) => void
}) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(2)
  const [fitWidth, setFitWidth] = useState(560)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Fit the page to the panel width; zoom multiplies that.
  useEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setFitWidth(Math.max(240, Math.floor(entry.contentRect.width - 32))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const width = Math.round(fitWidth * ZOOMS[zoomIdx])

  return (
    <div className="viewer-panel">
      <div className="viewer-controls">
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="chevronLeft" />
        </button>
        <span className="page-indicator">
          Page {page}
          {numPages ? ` of ${numPages}` : ''}
        </span>
        <button className="icon-btn" disabled={!!numPages && page >= numPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="chevronRight" />
        </button>
        <span className="spacer" />
        <button className="icon-btn" disabled={zoomIdx === 0} onClick={() => setZoomIdx((z) => z - 1)} aria-label="Zoom out">
          <Icon name="zoomOut" />
        </button>
        <span style={{ minWidth: 42, textAlign: 'center' }}>{Math.round(ZOOMS[zoomIdx] * 100)}%</span>
        <button className="icon-btn" disabled={zoomIdx === ZOOMS.length - 1} onClick={() => setZoomIdx((z) => z + 1)} aria-label="Zoom in">
          <Icon name="zoomIn" />
        </button>
        <a className="icon-btn" href={fileUrl} target="_blank" rel="noreferrer" aria-label="Open original PDF" title="Open original PDF">
          <Icon name="external" />
        </a>
      </div>
      <div className="viewer-canvas" ref={canvasRef}>
        {error ? (
          <div className="error-banner">{error}</div>
        ) : (
          <PdfDocument
            file={fileUrl}
            onLoadSuccess={(doc) => {
              setNumPages(doc.numPages)
              onNumPages?.(doc.numPages)
            }}
            onLoadError={(e) => setError(`Could not render PDF: ${e.message}`)}
            loading={<div className="viewer-loading">Loading PDF…</div>}
          >
            <Page pageNumber={page} width={width} loading={<div className="viewer-loading">Rendering page…</div>} />
          </PdfDocument>
        )}
      </div>
    </div>
  )
}
