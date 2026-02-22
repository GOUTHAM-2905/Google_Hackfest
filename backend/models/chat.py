"""Pydantic schemas for the chat API."""
from typing import Optional, Literal
from pydantic import BaseModel


class ChatRequest(BaseModel):
    query: str
    database_context: Optional[str] = None   # service_name to narrow search


class ChatResponse(BaseModel):
    answer: str
    tables_referenced: list[str] = []
    intent: Literal["schema", "data", "general", "plot"]
    suggested_sql: Optional[str] = None
