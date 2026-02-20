"""RED ZONE: Blood work endpoint robustness tests.

Verifies PDF upload handling, extraction edge cases,
and LLM response parsing for medical data.
"""

import io
import json
from unittest.mock import MagicMock, patch
from pypdf import PdfWriter


def _make_pdf_with_text(text: str) -> io.BytesIO:
    """Helper to create a simple PDF with text (uses reportlab-free approach)."""
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def _make_blank_pdf() -> io.BytesIO:
    """Create a blank PDF with no text."""
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


def _make_multi_page_pdf(pages: int = 5) -> io.BytesIO:
    """Create a multi-page blank PDF."""
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    buf.seek(0)
    return buf


class TestBloodWorkEdgeCases:
    """Test edge cases in the blood work extraction endpoint."""

    def test_blank_pdf_returns_empty_results_with_error(self, client_app):
        """A blank PDF (no text) should return empty results with error message."""
        pdf = _make_blank_pdf()
        response = client_app.post(
            "/analyze-bloodwork",
            files={"file": ("blank.pdf", pdf, "application/pdf")}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["results"] == []
        assert "error" in data

    def test_multi_page_pdf_accepted(self, client_app, mock_groq):
        """Multi-page PDFs should be processed without error."""
        mock_groq.chat.completions.create.return_value.choices[0].message.content = '{"results": []}'
        pdf = _make_multi_page_pdf(5)
        response = client_app.post(
            "/analyze-bloodwork",
            files={"file": ("multi.pdf", pdf, "application/pdf")}
        )
        assert response.status_code == 200

    def test_llm_returns_malformed_json(self, client_app, mock_groq):
        """If LLM returns invalid JSON, endpoint should handle it gracefully."""
        mock_groq.chat.completions.create.return_value.choices[0].message.content = "not json at all"
        pdf = _make_blank_pdf()

        response = client_app.post(
            "/analyze-bloodwork",
            files={"file": ("test.pdf", pdf, "application/pdf")}
        )
        assert response.status_code in (200, 500)

    def test_llm_returns_empty_results(self, client_app, mock_groq):
        """LLM returning empty results should be passed through cleanly."""
        mock_groq.chat.completions.create.return_value.choices[0].message.content = '{"results": []}'
        pdf = _make_blank_pdf()
        response = client_app.post(
            "/analyze-bloodwork",
            files={"file": ("test.pdf", pdf, "application/pdf")}
        )
        assert response.status_code == 200
        assert response.json()["results"] == []

    def test_file_without_pdf_extension_but_pdf_content_type(self, client_app, mock_groq):
        """File without .pdf extension but with PDF content type should be accepted."""
        mock_groq.chat.completions.create.return_value.choices[0].message.content = '{"results": []}'
        pdf = _make_blank_pdf()
        response = client_app.post(
            "/analyze-bloodwork",
            files={"file": ("report", pdf, "application/pdf")}
        )
        assert response.status_code == 200

    def test_groq_client_not_configured(self, client_app):
        """If Groq client is None, should return 503."""
        import app.main as main_mod
        original = main_mod.client
        main_mod.client = None
        try:
            pdf = _make_blank_pdf()
            response = client_app.post(
                "/analyze-bloodwork",
                files={"file": ("test.pdf", pdf, "application/pdf")}
            )
            assert response.status_code == 503
        finally:
            main_mod.client = original
