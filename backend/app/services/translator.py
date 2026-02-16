"""
Translation utilities for Izana AI.

Primary translation is handled by OpenAI LLM in chat.py.
This module is retained for potential RunPod-based translation as a future alternative.
"""

import os
import logging
import httpx
from typing import Optional

logger = logging.getLogger("izana.translator")

SUPPORTED_LANGUAGES = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
    "es": "Spanish",
    "ja": "Japanese",
}


def get_language_name(code: str) -> str:
    """Convert a language code to its full name."""
    return SUPPORTED_LANGUAGES.get(code, "English")


def is_supported_language(code: str) -> bool:
    """Check if a language code is supported."""
    return code in SUPPORTED_LANGUAGES


class RunPodTranslator:
    """Translator service using RunPod serverless endpoint (optional fallback)."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint_id: Optional[str] = None,
    ):
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        self.endpoint_id = endpoint_id or os.getenv("RUNPOD_ENDPOINT_ID")
        self.base_url = (
            f"https://api.runpod.ai/v2/{self.endpoint_id}/runsync"
            if self.endpoint_id else None
        )
        self.timeout = 30.0
        self.enabled = bool(self.api_key and self.endpoint_id)

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def translate(self, text: str, target_lang: str) -> str:
        """Translate text to the target language using RunPod."""
        if not self.enabled:
            logger.debug("RunPod translator not configured, returning original text")
            return text

        payload = {
            "input": {
                "prompt": f"Translate medical text to {target_lang}. Return ONLY translation: {text}",
                "max_tokens": 1000,
                "temperature": 0.1,
            }
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.base_url,
                    headers=self._get_headers(),
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()

                output = result.get("output", {})
                if isinstance(output, str):
                    return output.strip()
                elif isinstance(output, dict):
                    return output.get("text", output.get("response", "")).strip()

                logger.warning("Unexpected RunPod response format")
                return text

        except httpx.TimeoutException:
            logger.warning(f"RunPod translation timed out for target={target_lang}")
            return text
        except httpx.HTTPStatusError as e:
            logger.warning(f"RunPod HTTP error: {e.response.status_code}")
            return text
        except Exception as e:
            logger.warning(f"RunPod translation error: {e}")
            return text
