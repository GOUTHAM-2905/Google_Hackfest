"""
Ollama REST API client.
Wraps POST /api/generate for text completion with retry logic.
"""
import logging
import time
from typing import Optional
import httpx

from config import settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Thin client for the Ollama local LLM server."""

    def __init__(self):
        self.host = settings.OLLAMA_HOST.rstrip("/")
        self.model = settings.OLLAMA_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT_SECONDS

    def is_healthy(self) -> tuple[bool, Optional[str]]:
        """Returns (True, model_name) if Ollama is reachable, (False, error) otherwise."""
        try:
            resp = httpx.get(f"{self.host}/api/version", timeout=5)
            resp.raise_for_status()
            return True, self.model
        except Exception as e:
            return False, str(e)

    def generate(self, prompt: str, max_retries: int = 3) -> str:
        """
        Call Ollama /api/generate and return the raw text response.
        Retries up to max_retries times on failure.
        """
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "num_ctx": 4096,
                "temperature": 0.2,
                "top_p": 0.9,
            },
        }
        last_err: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                logger.debug("Ollama generate attempt %d", attempt)
                resp = httpx.post(
                    f"{self.host}/api/generate",
                    json=payload,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                text = resp.json().get("response", "").strip()
                logger.debug("Ollama response length: %d chars", len(text))
                return text
            except Exception as e:
                last_err = e
                logger.warning("Ollama attempt %d/%d failed: %s", attempt, max_retries, e)
                if attempt < max_retries:
                    time.sleep(2 ** attempt)  # exponential back-off: 2s, 4s
        raise RuntimeError(f"Ollama failed after {max_retries} attempts: {last_err}")

    def chat(self, messages: list[dict], max_retries: int = 3) -> str:
        """
        Call Ollama /api/chat with a list of {role, content} messages.
        Returns the assistant's reply as a string.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"num_ctx": 4096, "temperature": 0.3},
        }
        last_err: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                resp = httpx.post(
                    f"{self.host}/api/chat",
                    json=payload,
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                return resp.json()["message"]["content"].strip()
            except Exception as e:
                last_err = e
                logger.warning("Ollama chat attempt %d/%d failed: %s", attempt, max_retries, e)
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"Ollama chat failed after {max_retries} attempts: {last_err}")
