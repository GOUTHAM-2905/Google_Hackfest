"""Pydantic schemas for database connection requests and responses."""
from typing import Optional, Literal
from pydantic import BaseModel, Field


class ConnectionRequest(BaseModel):
    db_type: Literal["sqlite", "postgresql"] = Field(..., description="Database engine type")
    service_name: str = Field(..., description="Unique name for this connection (used as ID in OpenMetadata)")

    # SQLite only
    file_path: Optional[str] = Field(None, description="Absolute path to .db file (SQLite only)")

    # PostgreSQL only
    host: Optional[str] = Field(None, description="Database host")
    port: Optional[int] = Field(5432, description="Database port")
    database: Optional[str] = Field(None, description="Database name")
    username: Optional[str] = Field(None, description="Username")
    password: Optional[str] = Field(None, description="Password")

    def get_sqlalchemy_url(self) -> str:
        if self.db_type == "sqlite":
            return f"sqlite:///{self.file_path}"
        return (
            f"postgresql+psycopg2://{self.username}:{self.password}"
            f"@{self.host}:{self.port}/{self.database}"
        )


class ConnectionResponse(BaseModel):
    service_name: str
    tables_ingested: int
    duration_seconds: float
    tables: list[str]


class ConnectionListItem(BaseModel):
    service_name: str
    db_type: str
    status: str
    tables_count: int
    last_profiled: Optional[str] = None
