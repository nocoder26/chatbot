"""YELLOW ZONE: Translation edge cases and Pydantic model validation.

Tests translation fallback paths and request model boundary validation.
"""

import json
from unittest.mock import MagicMock
import pytest


class TestTranslationEdgeCases:
    """Test Groq-based translation fallback behavior."""

    def test_translation_returns_very_short_text(self, client_app, mock_groq):
        """If translation returns <5 chars, original text should be used."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            if call_count[0] <= 2:
                mock_resp.choices[0].message.content = json.dumps({
                    "revised_response": "A thorough medical explanation.",
                    "suggested_questions": ["Q1?", "Q2?", "Q3?"]
                })
            else:
                mock_resp.choices[0].message.content = "ab"
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "ta"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["response"]) > 5

    def test_translation_groq_timeout(self, client_app, mock_groq):
        """If Groq times out during translation, original text should be returned."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            if call_count[0] <= 2:
                mock_resp.choices[0].message.content = json.dumps({
                    "revised_response": "This is the English response.",
                    "suggested_questions": ["Follow up 1?", "Follow up 2?", "Follow up 3?"]
                })
            else:
                raise Exception("Groq translation timeout")
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "hi"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["response"]) > 0
        assert len(data["suggested_questions"]) > 0

    def test_each_language_triggers_translation_calls(self, client_app, mock_groq):
        """Every non-English language should produce translation API calls."""
        for lang in ["ta", "hi", "te", "ml", "es", "ja"]:
            mock_groq.chat.completions.create.reset_mock()
            response = client_app.post("/chat", json={"message": "What is IVF?", "language": lang})
            assert response.status_code == 200
            assert mock_groq.chat.completions.create.call_count == 6


class TestPydanticValidation:
    """Test request model validation edge cases."""

    def test_chat_message_at_max_length(self, client_app):
        """Message exactly at max_length should be accepted."""
        response = client_app.post("/chat", json={
            "message": "x" * 2000,
            "language": "en"
        })
        assert response.status_code == 200

    def test_chat_message_one_over_max_length(self, client_app):
        """Message one char over max_length should be rejected."""
        response = client_app.post("/chat", json={
            "message": "x" * 2001,
            "language": "en"
        })
        assert response.status_code == 422

    def test_feedback_rating_boundary_1(self, client_app):
        """Rating of exactly 1 should be accepted."""
        response = client_app.post("/feedback", json={
            "question": "test", "answer": "test", "rating": 1
        })
        assert response.status_code == 200

    def test_feedback_rating_boundary_5(self, client_app):
        """Rating of exactly 5 should be accepted."""
        response = client_app.post("/feedback", json={
            "question": "test", "answer": "test", "rating": 5
        })
        assert response.status_code == 200

    def test_feedback_with_very_long_reason(self, client_app):
        """Very long reason text should be accepted (no limit on reason)."""
        response = client_app.post("/feedback", json={
            "question": "test", "answer": "test", "rating": 2,
            "reason": "This was not helpful because " * 100
        })
        assert response.status_code == 200

    def test_chat_with_unknown_extra_fields(self, client_app):
        """Extra fields in the request should be ignored by Pydantic."""
        response = client_app.post("/chat", json={
            "message": "What is IVF?",
            "language": "en",
            "unknown_field": "should be ignored",
            "interaction_count": 99
        })
        assert response.status_code == 200

    def test_feedback_rating_as_float(self, client_app):
        """Float rating should be coerced or rejected."""
        response = client_app.post("/feedback", json={
            "question": "test", "answer": "test", "rating": 3.5
        })
        assert response.status_code in (200, 422)

    def test_chat_missing_message_field(self, client_app):
        """Missing required message field should return 422."""
        response = client_app.post("/chat", json={"language": "en"})
        assert response.status_code == 422

    def test_feedback_missing_answer_field(self, client_app):
        """Missing required answer field should return 422."""
        response = client_app.post("/feedback", json={
            "question": "test", "rating": 3
        })
        assert response.status_code == 422
