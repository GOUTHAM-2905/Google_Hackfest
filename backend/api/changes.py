"""GET /api/changes/{service_name} — lightweight change detection.

Runs only SELECT COUNT(*) on every table (~milliseconds).
Returns row counts and signals which tables changed vs last snapshot.
Used by the frontend to decide whether a full re-profile is needed.
"""
import logging
from fastapi import APIRouter, HTTPException
from sqlalchemy import create_engine, text, inspect

from api.ingest import get_connection

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory snapshot: service → {table_name: row_count}
_snapshots: dict[str, dict[str, int]] = {}


def _build_url(conn_req) -> str:
    if conn_req.db_type == "sqlite":
        return f"sqlite:///{conn_req.file_path}"
    p = conn_req.port or 5432
    user = conn_req.username or "postgres"
    pwd = conn_req.password or ""
    return f"postgresql+psycopg2://{user}:{pwd}@{conn_req.host}:{p}/{conn_req.database}"


@router.get("/changes/{service_name}")
def check_changes(service_name: str):
    """
    Lightweight endpoint: runs only COUNT(*) per table.
    Returns:
      - current_counts: {table: row_count}
      - changed_tables: list of table names whose counts differ from last snapshot
      - is_first_check: True if no snapshot existed yet
    """
    try:
        conn_req = get_connection(service_name)
    except Exception:
        raise HTTPException(404, detail=f"Connection '{service_name}' not found")

    try:
        url = _build_url(conn_req)
        engine = create_engine(url, pool_pre_ping=True)
        insp = inspect(engine)
        tables = insp.get_table_names(schema=None)

        current_counts: dict[str, int] = {}
        with engine.connect() as con:
            for tbl in tables:
                try:
                    row = con.execute(text(f'SELECT COUNT(*) FROM "{tbl}"')).scalar()
                    current_counts[tbl] = int(row or 0)
                except Exception as e:
                    logger.warning("COUNT failed for %s.%s: %s", service_name, tbl, e)
        engine.dispose()
    except Exception as e:
        raise HTTPException(500, detail=f"Change check failed: {e}")

    prev = _snapshots.get(service_name, {})
    is_first = not bool(prev)

    changed: list[str] = []
    for tbl, cnt in current_counts.items():
        if tbl not in prev or prev[tbl] != cnt:
            changed.append(tbl)
    # Also flag tables that disappeared
    for tbl in prev:
        if tbl not in current_counts:
            changed.append(tbl)

    # Always update snapshot
    _snapshots[service_name] = current_counts

    return {
        "service_name": service_name,
        "current_counts": current_counts,
        "changed_tables": changed,
        "is_first_check": is_first,
        "has_changes": bool(changed) and not is_first,
    }
