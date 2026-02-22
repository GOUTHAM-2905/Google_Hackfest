"""Application settings loaded from .env file."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Ollama
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5-coder:3b"
    OLLAMA_TIMEOUT_SECONDS: int = 120

    # OpenMetadata
    OPENMETADATA_HOST: str = "http://localhost:8585"
    OPENMETADATA_JWT_TOKEN: str = ""

    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173"

    # Profiling
    MAX_PROFILE_ROWS: int = 10_000_000
    FRESHNESS_COLUMNS: str = "updated_at,modified_at,created_at,timestamp,date_modified,last_updated"

    # Logging
    LOG_LEVEL: str = "INFO"

    @property
    def freshness_column_list(self) -> list[str]:
        return [c.strip() for c in self.FRESHNESS_COLUMNS.split(",") if c.strip()]


settings = Settings()
