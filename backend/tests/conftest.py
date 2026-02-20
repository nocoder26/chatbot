"""Shared test fixtures and configuration."""

import os
import json
import tempfile
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def test_env(tmp_path):
    """Set up isolated environment variables for every test."""
    env_vars = {
        "ADMIN_PIN": "test-pin-9876",
        "ADMIN_API_KEY": "test-admin-key-abc123",
        "ALLOWED_ORIGINS": "http://localhost:3000",
        "GAP_LOG_FILE": str(tmp_path / "gaps.json"),
        "FEEDBACK_LOG_FILE": str(tmp_path / "feedback.json"),
        "DOC_USAGE_LOG_FILE": str(tmp_path / "doc_usage.json"),
        "MAX_UPLOAD_SIZE_MB": "1",
        "MAX_MESSAGE_LENGTH": "2000",
        "GAP_SCORE_THRESHOLD": "0.3",
        "RERANK_TOP_N": "3",
    }
    with patch.dict(os.environ, env_vars, clear=False):
        yield env_vars


@pytest.fixture
def mock_groq():
    """Create a mock Groq client that returns controllable responses."""
    mock = MagicMock()
    mock_completion = MagicMock()
    mock_completion.choices = [MagicMock()]
    mock_completion.choices[0].message.content = json.dumps({
        "revised_response": "This is a test medical response about fertility.",
        "suggested_questions": [
            "What are the next steps?",
            "How does diet affect fertility?",
            "What tests should I consider?"
        ]
    })
    mock.chat.completions.create.return_value = mock_completion
    return mock


@pytest.fixture
def mock_openai():
    """Create a mock OpenAI client for embeddings."""
    mock = MagicMock()
    mock_emb = MagicMock()
    mock_emb.data = [MagicMock()]
    mock_emb.data[0].embedding = [0.1] * 1536
    mock.embeddings.create.return_value = mock_emb
    return mock


@pytest.fixture
def mock_pinecone_index():
    """Create a mock Pinecone index with realistic search results."""
    mock = MagicMock()
    match1 = MagicMock()
    match1.score = 0.85
    match1.metadata = {
        "text": "IVF is an assisted reproductive technology involving fertilization outside the body.",
        "source": "art-booklet.pdf"
    }
    match2 = MagicMock()
    match2.score = 0.78
    match2.metadata = {
        "text": "Success rates depend on age, egg quality, and embryo quality.",
        "source": "fertility-evaluation.pdf"
    }
    match3 = MagicMock()
    match3.score = 0.72
    match3.metadata = {
        "text": "AMH levels indicate ovarian reserve and help guide treatment.",
        "source": "ovarian_reserve_predicting_fertility.pdf"
    }
    mock_resp = MagicMock()
    mock_resp.matches = [match1, match2, match3]
    mock.query.return_value = mock_resp
    return mock


@pytest.fixture
def mock_cohere():
    """Create a mock Cohere client for reranking."""
    mock = MagicMock()
    rerank_result_0 = MagicMock()
    rerank_result_0.index = 0
    rerank_result_0.relevance_score = 0.95
    rerank_result_1 = MagicMock()
    rerank_result_1.index = 2
    rerank_result_1.relevance_score = 0.88
    rerank_result_2 = MagicMock()
    rerank_result_2.index = 1
    rerank_result_2.relevance_score = 0.75
    mock_rerank = MagicMock()
    mock_rerank.results = [rerank_result_0, rerank_result_1, rerank_result_2]
    mock.rerank.return_value = mock_rerank
    return mock


@pytest.fixture
def client_app(mock_groq, mock_openai, mock_pinecone_index, mock_cohere):
    """Create a fully mocked FastAPI test client."""
    import app.routers.chat as chat_module
    chat_module.groq_client = mock_groq
    chat_module.openai_client = mock_openai
    chat_module.index = mock_pinecone_index
    chat_module.cohere_client = mock_cohere

    import app.main as main_module
    main_module.client = mock_groq

    from app.main import app
    return TestClient(app)
