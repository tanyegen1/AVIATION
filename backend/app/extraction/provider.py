"""Provider-agnostic extraction interface.

Exactly one provider is active per request (demo or live, decided by the
processing job's `mode`). Adding a second AI vendor later means writing
a new class that implements `ExtractionProvider` - nothing else in the
app should import a provider module directly except via this interface.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.extraction.schema import PageExtractionResult


class ExtractionError(Exception):
    """Raised for any failure extracting a single page. Caller decides retry/skip."""


class UnsupportedInDemoMode(ExtractionError):
    """Raised by the demo provider when no fixture matches the uploaded document."""


@dataclass
class ProviderPageResult:
    extraction: PageExtractionResult
    model_id: str | None
    input_tokens: int | None
    output_tokens: int | None


class ExtractionProvider(ABC):
    mode: str  # "demo" | "live"

    @abstractmethod
    def extract_page(
        self,
        *,
        document_sha256: str,
        single_page_pdf_bytes: bytes,
        page_number: int,
    ) -> ProviderPageResult:
        """Extract structured fields from one page of a document."""
        raise NotImplementedError
