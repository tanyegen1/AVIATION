"""PDF validation and page access backed by PyMuPDF.

A page with no extractable text is not assumed to be blank - it is
treated as a scanned/image page and rendered to an image for the AI
provider instead. We never treat failed text extraction as proof of an
empty page (spec section 5).
"""
from __future__ import annotations

from dataclasses import dataclass

import pymupdf


class PdfValidationError(Exception):
    """Raised for password-protected, corrupt, or otherwise unreadable PDFs."""


@dataclass
class PdfInfo:
    page_count: int
    is_encrypted: bool


def validate_and_inspect(content: bytes) -> PdfInfo:
    try:
        doc = pymupdf.open(stream=content, filetype="pdf")
    except Exception as exc:  # pymupdf raises generic exceptions on malformed input
        raise PdfValidationError(f"File could not be read as a PDF: {exc}") from exc

    try:
        if doc.is_encrypted:
            # needs_pass True even after open() for PDFs with an owner-only password
            if not doc.authenticate(""):
                raise PdfValidationError(
                    "This PDF is password-protected. Remove the password and re-upload."
                )
        page_count = doc.page_count
        if page_count == 0:
            raise PdfValidationError("This PDF has no pages.")
        return PdfInfo(page_count=page_count, is_encrypted=bool(doc.is_encrypted))
    finally:
        doc.close()


MIN_CHARS_FOR_DIGITAL_PAGE = 20


def page_text(content: bytes, page_number_1based: int) -> str:
    doc = pymupdf.open(stream=content, filetype="pdf")
    try:
        page = doc[page_number_1based - 1]
        return page.get_text("text") or ""
    finally:
        doc.close()


def page_is_scanned(content: bytes, page_number_1based: int) -> bool:
    text = page_text(content, page_number_1based)
    return len(text.strip()) < MIN_CHARS_FOR_DIGITAL_PAGE


def render_page_png(content: bytes, page_number_1based: int, zoom: float = 2.0) -> bytes:
    doc = pymupdf.open(stream=content, filetype="pdf")
    try:
        page = doc[page_number_1based - 1]
        matrix = pymupdf.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=matrix)
        return pix.tobytes("png")
    finally:
        doc.close()


def extract_single_page_pdf_bytes(content: bytes, page_number_1based: int) -> bytes:
    """Return a new single-page PDF containing just this page, for sending to the AI provider."""
    src = pymupdf.open(stream=content, filetype="pdf")
    try:
        out = pymupdf.open()
        out.insert_pdf(src, from_page=page_number_1based - 1, to_page=page_number_1based - 1)
        return out.tobytes()
    finally:
        src.close()
