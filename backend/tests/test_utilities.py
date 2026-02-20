"""Tests for utility functions: save_log, rerank_results, translate_with_groq."""

import json
import os
import asyncio
from unittest.mock import MagicMock
from app.routers.chat import save_log, rerank_results, SUPPORTED_LANGUAGES
from app.services.translator import (
    get_language_name,
    is_supported_language,
    RunPodTranslator,
)


class TestSaveLog:
    """Test JSON log file operations."""

    def test_creates_new_file(self, tmp_path):
        """Save log should create a new file if it doesn't exist."""
        filepath = str(tmp_path / "new_log.json")
        save_log(filepath, {"test": "data"})
        assert os.path.exists(filepath)
        with open(filepath) as f:
            data = json.load(f)
        assert len(data) == 1
        assert data[0]["test"] == "data"

    def test_appends_to_existing(self, tmp_path):
        """Save log should append to existing log file."""
        filepath = str(tmp_path / "existing.json")
        with open(filepath, "w") as f:
            json.dump([{"first": True}], f)

        save_log(filepath, {"second": True})
        with open(filepath) as f:
            data = json.load(f)
        assert len(data) == 2

    def test_rotation_at_500(self, tmp_path):
        """Log file should rotate to keep only last 500 entries."""
        filepath = str(tmp_path / "full_log.json")
        existing = [{"i": i} for i in range(500)]
        with open(filepath, "w") as f:
            json.dump(existing, f)

        save_log(filepath, {"i": 500})
        with open(filepath) as f:
            data = json.load(f)
        assert len(data) == 500
        assert data[-1]["i"] == 500
        assert data[0]["i"] == 1  # First entry was rotated out

    def test_handles_corrupt_file(self, tmp_path):
        """Save log should handle corrupt existing file gracefully."""
        filepath = str(tmp_path / "corrupt.json")
        with open(filepath, "w") as f:
            f.write("not json{{{")

        # Should not raise, but may log error
        save_log(filepath, {"new": True})
        # File might be overwritten or left as-is depending on error handling


class TestRerankResults:
    """Test Cohere reranking function."""

    def test_rerank_with_no_client(self):
        """Reranking with no client should return original docs."""
        import app.routers.chat as chat_mod
        original = chat_mod.cohere_client
        chat_mod.cohere_client = None
        try:
            docs = [MagicMock(), MagicMock()]
            result = rerank_results("query", docs)
            assert result == docs
        finally:
            chat_mod.cohere_client = original

    def test_rerank_with_empty_docs(self, mock_cohere):
        """Reranking with empty docs should return empty."""
        import app.routers.chat as chat_mod
        original = chat_mod.cohere_client
        chat_mod.cohere_client = mock_cohere
        try:
            result = rerank_results("query", [])
            assert result == []
        finally:
            chat_mod.cohere_client = original

    def test_rerank_reorders_by_relevance(self, mock_cohere):
        """Reranking should reorder documents by relevance score."""
        import app.routers.chat as chat_mod
        original = chat_mod.cohere_client
        chat_mod.cohere_client = mock_cohere
        try:
            docs = []
            for i in range(3):
                doc = MagicMock()
                doc.metadata = {"text": f"Document {i} text"}
                doc.score = 0.5
                docs.append(doc)

            result = rerank_results("test query", docs)
            assert len(result) == 3
            # First result should have highest relevance score
            assert result[0].score == 0.95
        finally:
            chat_mod.cohere_client = original

    def test_rerank_failure_returns_original(self, mock_cohere):
        """Reranking failure should return original documents."""
        import app.routers.chat as chat_mod
        original = chat_mod.cohere_client
        mock_cohere.rerank.side_effect = Exception("API error")
        chat_mod.cohere_client = mock_cohere
        try:
            docs = [MagicMock()]
            docs[0].metadata = {"text": "test"}
            result = rerank_results("query", docs)
            assert result == docs
        finally:
            chat_mod.cohere_client = original


class TestLanguageSupport:
    """Test language mapping and translation utilities."""

    def test_all_seven_languages_supported(self):
        """All 7 required languages should be in SUPPORTED_LANGUAGES."""
        expected = {"en", "ta", "hi", "te", "ml", "es", "ja"}
        assert set(SUPPORTED_LANGUAGES.keys()) == expected

    def test_language_names_correct(self):
        """Language names should match codes."""
        assert SUPPORTED_LANGUAGES["en"] == "English"
        assert SUPPORTED_LANGUAGES["ta"] == "Tamil"
        assert SUPPORTED_LANGUAGES["hi"] == "Hindi"
        assert SUPPORTED_LANGUAGES["te"] == "Telugu"
        assert SUPPORTED_LANGUAGES["ml"] == "Malayalam"
        assert SUPPORTED_LANGUAGES["es"] == "Spanish"
        assert SUPPORTED_LANGUAGES["ja"] == "Japanese"

    def test_get_language_name(self):
        """get_language_name should return correct name."""
        assert get_language_name("ta") == "Tamil"
        assert get_language_name("xx") == "English"  # default

    def test_is_supported_language(self):
        """is_supported_language should return correct boolean."""
        assert is_supported_language("en") is True
        assert is_supported_language("ta") is True
        assert is_supported_language("xx") is False

    def test_translator_languages_match_chat_languages(self):
        """Translator module and chat module should have same language set."""
        from app.services.translator import SUPPORTED_LANGUAGES as translator_langs
        from app.routers.chat import SUPPORTED_LANGUAGES as chat_langs
        assert translator_langs == chat_langs


class TestRunPodTranslator:
    """Test RunPod translator utility class."""

    def test_disabled_when_no_keys(self):
        """Translator should be disabled when API keys are missing."""
        translator = RunPodTranslator(api_key=None, endpoint_id=None)
        assert translator.enabled is False

    def test_enabled_when_keys_present(self):
        """Translator should be enabled when both keys are present."""
        translator = RunPodTranslator(api_key="key", endpoint_id="ep123")
        assert translator.enabled is True
        assert "ep123" in translator.base_url

    def test_disabled_returns_original_text(self):
        """Disabled translator should return original text."""
        translator = RunPodTranslator(api_key=None, endpoint_id=None)
        result = asyncio.get_event_loop().run_until_complete(
            translator.translate("Hello world", "Tamil")
        )
        assert result == "Hello world"
