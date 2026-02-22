"""Pydantic schemas for data quality metrics and statistics."""
from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ColumnStatistics(BaseModel):
    """Mathematical/statistical analysis per column."""
    column_name: str
    data_type: str = ""
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    mean: Optional[float] = None
    median: Optional[float] = None
    std_dev: Optional[float] = None
    top_values: list[dict] = Field(default_factory=list)  # [{value, count, pct}]
    histogram: list[dict] = Field(default_factory=list)   # [{bucket, count}]


class ColumnQuality(BaseModel):
    column_name: str
    completeness_pct: float = Field(..., ge=0.0, le=100.0)
    distinctness_pct: float = Field(..., ge=0.0, le=100.0)
    null_count: int
    distinct_count: int
    statistics: Optional[ColumnStatistics] = None


class TableQualityProfile(BaseModel):
    table_name: str
    row_count: int
    freshness_timestamp: Optional[datetime] = None
    overall_completeness_pct: float
    aggregate_score: float          # 0–100, weighted composite
    grade: str                      # A B C D F
    badge_color: str                # green amber red critical
    columns: list[ColumnQuality]
    profiled_at: datetime = Field(default_factory=datetime.utcnow)
