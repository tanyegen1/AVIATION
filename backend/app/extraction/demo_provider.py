"""Demo extraction provider.

Returns pre-written, fixture-based results for the bundled synthetic PDFs
only. It never fabricates results for an arbitrary upload - if a
document's hash isn't in the fixture map, it raises
`UnsupportedInDemoMode` so the caller can show the user a clear message
that live processing requires an API key (spec section 4).
"""
from __future__ import annotations

import json

from app.config import FIXTURES_DIR
from app.extraction.provider import ExtractionError, ExtractionProvider, ProviderPageResult, UnsupportedInDemoMode
from app.extraction.schema import PageExtractionResult

_FIXTURES_PATH = FIXTURES_DIR / "demo_fixtures.json"


def _load_fixtures() -> dict:
    if not _FIXTURES_PATH.exists():
        return {}
    with open(_FIXTURES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class DemoExtractionProvider(ExtractionProvider):
    mode = "demo"

    def __init__(self) -> None:
        self._fixtures = _load_fixtures()

    def is_supported(self, document_sha256: str) -> bool:
        return document_sha256 in self._fixtures

    def extract_page(
        self,
        *,
        document_sha256: str,
        single_page_pdf_bytes: bytes,
        page_number: int,
    ) -> ProviderPageResult:
        doc_fixture = self._fixtures.get(document_sha256)
        if doc_fixture is None:
            raise UnsupportedInDemoMode(
                "This document was not recognized as one of the bundled demo samples. "
                "Demo mode only simulates extraction for the included synthetic PDFs. "
                "To process your own documents, configure ANTHROPIC_API_KEY and switch to live mode."
            )
        page_fixture = doc_fixture.get("pages", {}).get(str(page_number))
        if page_fixture is None:
            # A page beyond what the fixture defines: simulate "nothing extractable".
            page_fixture = {
                "document_category_guess": doc_fixture.get("document_category", "unknown_type"),
                "category_confidence": "low",
                "page_is_scanned_image": False,
                "fields": [],
                "notes": "No simulated data defined for this page in the demo fixture.",
            }
        if page_fixture.get("simulate_error"):
            raise ExtractionError(
                page_fixture.get("simulate_error_message", "Simulated transient extraction failure (demo fixture).")
            )

        result = PageExtractionResult.model_validate(page_fixture)
        return ProviderPageResult(
            extraction=result,
            model_id="demo-simulated",
            input_tokens=None,
            output_tokens=None,
        )
