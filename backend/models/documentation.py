"""Pydantic schemas for AI-generated documentation artifacts."""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DocumentationArtifact(BaseModel):
    table_name: str
    fully_qualified_name: str = ""
    business_summary: str
    usage_recommendations: str
    quality_score: float            # 0–100
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    model_used: str = "qwen2.5-coder:3b"
    columns: list[dict] = []       # [{name, data_type, description}]


class GenerationResult(BaseModel):
    table_name: str
    status: str                    # "success" | "error"
    business_summary: Optional[str] = None
    usage_recommendations: Optional[str] = None
    quality_score: Optional[float] = None
    error: Optional[str] = None


class GenerationResponse(BaseModel):
    service_name: str
    tables_documented: int
    duration_seconds: float
    results: list[GenerationResult]
