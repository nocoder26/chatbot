import os
import httpx
from typing import Optional


class RunPodTranslator:
    """Translator service using RunPod serverless endpoint."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        endpoint_id: Optional[str] = None,
    ):
        self.api_key = api_key or os.getenv("RUNPOD_API_KEY")
        self.endpoint_id = endpoint_id or os.getenv("RUNPOD_ENDPOINT_ID")
        self.base_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/runsync"
        self.timeout = 30.0

    def _get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def translate(self, text: str, target_lang: str) -> str:
        """
        Translate text to the target language using RunPod.

        Args:
            text: The text to translate.
            target_lang: Target language (e.g., 'Tamil', 'Hindi', 'English').

        Returns:
            Translated text or original text with error prefix on failure.
        """
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

                # Extract translation from RunPod response
                output = result.get("output", {})
                if isinstance(output, str):
                    return output.strip()
                elif isinstance(output, dict):
                    return output.get("text", output.get("response", "")).strip()

                return f"[Translation Error]: {text}"

        except httpx.TimeoutException:
            return f"[Translation Error]: {text}"
        except httpx.HTTPStatusError:
            return f"[Translation Error]: {text}"
        except Exception:
            return f"[Translation Error]: {text}"

    async def detect_language(self, text: str) -> str:
        """
        Detect the language of the given text.

        Args:
            text: The text to analyze.

        Returns:
            2-letter ISO language code (e.g., 'en', 'ta', 'hi').
        """
        payload = {
            "input": {
                "prompt": f"What language is this text written in? Return ONLY the 2-letter ISO 639-1 code (e.g., en, ta, hi, te, ml, kn, bn, mr, gu, pa): {text}",
                "max_tokens": 10,
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

                # Extract language code from RunPod response
                output = result.get("output", {})
                if isinstance(output, str):
                    code = output.strip().lower()[:2]
                elif isinstance(output, dict):
                    code = output.get("text", output.get("response", "en")).strip().lower()[:2]
                else:
                    code = "en"

                return code

        except Exception:
            # Default to English on any error
            return "en"
