"""Live provider behaviour without calling the real API: the request shape,
and that every failure becomes an ExtractionError (a failed page), never an
exception that escapes the job loop."""
from types import SimpleNamespace

import pytest

from app.extraction import anthropic_provider as ap
from app.extraction.provider import ExtractionError
from app.extraction.schema import PageExtractionResult


class _FakeMessages:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def _provider(result):
    provider = ap.AnthropicExtractionProvider.__new__(ap.AnthropicExtractionProvider)
    provider.model_id = "claude-opus-5-5"
    messages = _FakeMessages(result)
    provider._client = SimpleNamespace(beta=SimpleNamespace(messages=messages))
    return provider, messages


def _response(**overrides):
    base = dict(
        stop_reason="end_turn",
        stop_details=None,
        parsed_output=PageExtractionResult(
            document_category_guess="unknown_type", category_confidence="low", fields=[], page_is_scanned_image=False
        ),
        model="claude-opus-5-5",
        usage=SimpleNamespace(input_tokens=1200, output_tokens=300),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _extract(provider):
    return provider.extract_page(document_sha256="x", single_page_pdf_bytes=b"%PDF-1.4", page_number=1)


def test_request_uses_structured_output_effort_and_refusal_fallback():
    provider, messages = _provider(_response())
    result = _extract(provider)
    call = messages.calls[0]
    assert call["output_format"] is PageExtractionResult
    assert call["output_config"] == {"effort": ap.ANTHROPIC_EFFORT}
    assert call["fallbacks"] == "default"
    assert call["betas"] == [ap.FALLBACK_BETA]
    assert call["max_tokens"] >= 16000
    assert call["messages"][0]["content"][0]["source"]["media_type"] == "application/pdf"
    assert result.model_id == "claude-opus-5-5"
    assert (result.input_tokens, result.output_tokens) == (1200, 300)


def test_served_model_is_recorded_when_a_fallback_answered():
    provider, _ = _provider(_response(model="claude-opus-5"))
    assert _extract(provider).model_id == "claude-opus-5"


@pytest.mark.parametrize(
    "response, message",
    [
        (_response(stop_reason="refusal", stop_details=SimpleNamespace(category="cyber"), parsed_output=None), "declined"),
        (_response(stop_reason="max_tokens", parsed_output=None), "cut off"),
        (_response(parsed_output=None), "parsed structured result"),
    ],
)
def test_unusable_responses_fail_the_page(response, message):
    provider, _ = _provider(response)
    with pytest.raises(ExtractionError, match=message):
        _extract(provider)


def test_unexpected_parse_errors_fail_the_page_instead_of_escaping():
    provider, _ = _provider(ValueError("1 validation error for PageExtractionResult"))
    with pytest.raises(ExtractionError, match="valid structured result"):
        _extract(provider)


def test_real_sdk_request_and_parse_offline():
    """Runs the real anthropic SDK against an in-process HTTP transport:
    checks the wire request (beta header, fallbacks, effort, JSON schema
    from the Pydantic model) and that a structured response is parsed."""
    import json

    import anthropic
    import httpx2 as httpx

    seen = {}
    answer = {
        "document_category_guess": "component_status_sheet",
        "category_confidence": "high",
        "page_is_scanned_image": False,
        "fields": [
            {
                "field_name": "serial_number",
                "qualifier": None,
                "raw_value": "SN-100234",
                "normalized_value": None,
                "evidence_text": "Serial Number: SN-100234",
                "self_reported_confidence": "high",
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["beta"] = request.headers.get("anthropic-beta")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": [{"type": "text", "text": json.dumps(answer)}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1500, "output_tokens": 220},
            },
        )

    provider = ap.AnthropicExtractionProvider.__new__(ap.AnthropicExtractionProvider)
    provider.model_id = "claude-opus-5-5"
    provider._client = anthropic.Anthropic(
        api_key="test-key", http_client=httpx.Client(transport=httpx.MockTransport(handler)), max_retries=0
    )

    result = _extract(provider)

    assert seen["url"].endswith("/v1/messages?beta=true")
    assert ap.FALLBACK_BETA in seen["beta"]
    body = seen["body"]
    assert body["fallbacks"] == "default"
    assert body["output_config"]["effort"] == ap.ANTHROPIC_EFFORT
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert "fields" in body["output_config"]["format"]["schema"]["properties"]
    assert "thinking" not in body  # adaptive by default; disabling it is a 400 on current models
    assert result.extraction.fields[0].raw_value == "SN-100234"
    assert result.model_id == "claude-opus-5-5"
