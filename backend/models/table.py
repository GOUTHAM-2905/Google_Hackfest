"""Pydantic schemas for table and column metadata."""
from typing import Optional
from pydantic import BaseModel


class ColumnMetadata(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    is_primary_key: bool = False
    is_foreign_key: bool = False
    foreign_key_ref: Optional[str] = None   # "other_table.column"
    ai_description: Optional[str] = None


class TableMetadata(BaseModel):
    table_name: str
    fully_qualified_name: str
    columns: list[ColumnMetadata]
    row_count: Optional[int] = None
    business_summary: Optional[str] = None
    usage_recommendations: Optional[str] = None
    is_documented: bool = False
