from app.extraction.demo_provider import DemoExtractionProvider
from app.extraction.provider import ExtractionError, ExtractionProvider, ProviderPageResult, UnsupportedInDemoMode

_demo_singleton: DemoExtractionProvider | None = None


def get_provider(mode: str) -> ExtractionProvider:
    global _demo_singleton
    if mode == "demo":
        if _demo_singleton is None:
            _demo_singleton = DemoExtractionProvider()
        return _demo_singleton
    if mode == "live":
        from app.extraction.anthropic_provider import AnthropicExtractionProvider

        return AnthropicExtractionProvider()
    raise ValueError(f"Unknown extraction mode: {mode}")


__all__ = [
    "get_provider",
    "ExtractionError",
    "ExtractionProvider",
    "ProviderPageResult",
    "UnsupportedInDemoMode",
]
