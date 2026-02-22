"""
Database connector — SQLAlchemy engine factory and schema reflection.
Supports SQLite and PostgreSQL. Extracts tables, columns, types, PK/FK constraints.
"""
import logging
from typing import Optional
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

from models.connection import ConnectionRequest
from models.table import TableMetadata, ColumnMetadata

logger = logging.getLogger(__name__)


def create_engine_from_request(req: ConnectionRequest):
    """Build and test a SQLAlchemy engine from a ConnectionRequest."""
    url = req.get_sqlalchemy_url()
    engine = create_engine(url, pool_pre_ping=True)
    # Validate the connection immediately
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError as e:
        engine.dispose()
        raise ValueError(f"Could not connect to database: {e}") from e
    return engine


def reflect_schema(req: ConnectionRequest) -> list[TableMetadata]:
    """
    Reflect all tables from the target database.
    Returns a list of TableMetadata objects with columns and FK relationships.
    """
    engine = create_engine_from_request(req)
    insp = inspect(engine)

    schema_name = _get_default_schema(engine, req.db_type)
    table_names = insp.get_table_names(schema=schema_name)
    logger.info("Discovered %d tables in %s", len(table_names), req.service_name)

    tables: list[TableMetadata] = []
    for table_name in table_names:
        columns = _reflect_columns(insp, table_name, schema_name)
        # Mark primary keys
        pk_cols = set(insp.get_pk_constraint(table_name, schema=schema_name).get("constrained_columns", []))
        # Collect FK refs
        fk_map: dict[str, str] = {}
        for fk in insp.get_foreign_keys(table_name, schema=schema_name):
            for lc, rc in zip(fk["constrained_columns"], fk["referred_columns"]):
                fk_map[lc] = f"{fk['referred_table']}.{rc}"

        enriched_cols = []
        for col in columns:
            col.is_primary_key = col.name in pk_cols
            col.is_foreign_key = col.name in fk_map
            col.foreign_key_ref = fk_map.get(col.name)
            enriched_cols.append(col)

        db_part = req.database or (req.file_path.split('\\')[-1] if req.file_path else 'db')
        fqn = f"{req.service_name}.{db_part}.{schema_name or 'main'}.{table_name}"
        tables.append(TableMetadata(
            table_name=table_name,
            fully_qualified_name=fqn,
            columns=enriched_cols,
        ))

    engine.dispose()
    return tables


def _reflect_columns(insp, table_name: str, schema: Optional[str]) -> list[ColumnMetadata]:
    raw_cols = insp.get_columns(table_name, schema=schema)
    result = []
    for col in raw_cols:
        data_type = str(col["type"]).upper()
        # Simplify long type strings
        if "(" in data_type:
            data_type = data_type.split("(")[0]
        result.append(ColumnMetadata(
            name=col["name"],
            data_type=data_type,
            is_nullable=col.get("nullable", True),
        ))
    return result


def _get_default_schema(engine, db_type: str) -> Optional[str]:
    if db_type == "postgresql":
        return "public"
    return None   # SQLite has no schema concept


def get_row_count(engine, table_name: str, schema: Optional[str] = None) -> int:
    """Fetch row count for a single table using a pushdown COUNT query."""
    qualified = f'"{schema}"."{table_name}"' if schema else f'"{table_name}"'
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) FROM {qualified}"))
        return result.scalar() or 0
