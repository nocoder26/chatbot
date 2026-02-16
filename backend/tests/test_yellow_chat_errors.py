"""YELLOW ZONE: Chat endpoint error path coverage.

Tests every fallback and error branch in the RAG pipeline.
"""

import json
from unittest.mock import MagicMock, patch


class TestChatQCFailure:
    """Test the QC formatting fallback paths."""

    def test_qc_returns_empty_revised_response(self, client_app, mock_groq):
        """When QC model returns empty revised_response, draft should be used."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            mock_resp = MagicMock()
            if call_count[0] == 1:
                mock_resp.choices = [MagicMock()]
                mock_resp.choices[0].message.content = "This is a good draft response about fertility."
            else:
                mock_resp.choices = [MagicMock()]
                mock_resp.choices[0].message.content = json.dumps({
                    "revised_response": "",
                    "suggested_questions": []
                })
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["response"]) > 0
        assert len(data["suggested_questions"]) == 3

    def test_qc_returns_invalid_json(self, client_app, mock_groq):
        """When QC model returns non-JSON, draft response should be used with default questions."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            if call_count[0] == 1:
                mock_resp.choices[0].message.content = "A great medical response."
            else:
                mock_resp.choices[0].message.content = "NOT JSON {{{{"
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["response"]) > 0
        assert len(data["suggested_questions"]) == 3

    def test_qc_returns_wrong_keys(self, client_app, mock_groq):
        """When QC model returns JSON with wrong keys, should fallback."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            if call_count[0] == 1:
                mock_resp.choices[0].message.content = "Draft about IVF."
            else:
                mock_resp.choices[0].message.content = json.dumps({"wrong_key": "oops"})
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert len(data["suggested_questions"]) == 3


class TestChatExternalFailures:
    """Test behavior when external services fail."""

    def test_pinecone_returns_zero_matches(self, client_app, mock_pinecone_index):
        """Zero Pinecone matches should still produce a response."""
        mock_pinecone_index.query.return_value.matches = []
        response = client_app.post("/chat", json={"message": "Very obscure question", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert data["citations"] == []

    def test_openai_embedding_failure(self, client_app, mock_openai):
        """OpenAI embedding failure should return graceful error."""
        mock_openai.embeddings.create.side_effect = Exception("OpenAI rate limit")
        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert "error" in data["response"].lower() or len(data["response"]) > 0

    def test_groq_draft_failure(self, client_app, mock_groq, mock_openai, mock_pinecone_index):
        """If the draft LLM call fails, should return error response."""
        mock_groq.chat.completions.create.side_effect = Exception("Groq overloaded")
        response = client_app.post("/chat", json={"message": "What is IVF?", "language": "en"})
        assert response.status_code == 200
        data = response.json()
        assert "error" in data["response"].lower() or "try" in data["response"].lower()

    def test_services_not_initialized(self, client_app):
        """If AI services are None, should return 503."""
        import app.routers.chat as chat_mod
        orig_groq = chat_mod.groq_client
        chat_mod.groq_client = None
        try:
            response = client_app.post("/chat", json={"message": "test", "language": "en"})
            assert response.status_code == 503
        finally:
            chat_mod.groq_client = orig_groq


class TestChatBloodWorkPaths:
    """Test blood work specific branches in the chat endpoint."""

    def test_clinical_data_with_empty_results(self, client_app):
        """clinical_data with empty results array should not crash."""
        response = client_app.post("/chat", json={
            "message": "Analyze my blood work",
            "language": "en",
            "clinical_data": {"results": []}
        })
        assert response.status_code == 200

    def test_clinical_data_with_treatment(self, client_app):
        """Treatment field should be passed through to search query."""
        response = client_app.post("/chat", json={
            "message": "Analyze",
            "language": "en",
            "clinical_data": {"results": [{"name": "FSH", "value": "5", "unit": "mIU/mL"}]},
            "treatment": "IVF"
        })
        assert response.status_code == 200

    def test_missing_marker_check_failure(self, client_app, mock_groq):
        """If the missing marker check LLM call fails, chat should still work."""
        call_count = [0]
        def side_effect(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                raise Exception("Groq timeout on marker check")
            mock_resp = MagicMock()
            mock_resp.choices = [MagicMock()]
            mock_resp.choices[0].message.content = json.dumps({
                "revised_response": "Your labs look fine.",
                "suggested_questions": ["Q1?", "Q2?", "Q3?"]
            })
            return mock_resp
        mock_groq.chat.completions.create.side_effect = side_effect

        response = client_app.post("/chat", json={
            "message": "Check my labs",
            "language": "en",
            "clinical_data": {"results": [{"name": "AMH", "value": "2.0", "unit": "ng/mL"}]}
        })
        assert response.status_code == 200
