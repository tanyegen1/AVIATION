import { useState } from 'react'
import { Document as PdfDocument, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

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

  return (
    <div className="viewer-panel">
      <div className="viewer-controls">
        <button className="small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Prev
        </button>
        <span>
          Page {page} {numPages ? `of ${numPages}` : ''}
        </span>
        <button className="small" disabled={!!numPages && page >= numPages} onClick={() => onPage(page + 1)}>
          Next →
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <PdfDocument
        file={fileUrl}
        onLoadSuccess={(doc) => {
          setNumPages(doc.numPages)
          onNumPages?.(doc.numPages)
        }}
        onLoadError={(e) => setError(`Could not render PDF: ${e.message}`)}
        loading={<div style={{ color: '#ccc', padding: 20 }}>Loading PDF…</div>}
      >
        <Page pageNumber={page} width={520} />
      </PdfDocument>
    </div>
  )
}
