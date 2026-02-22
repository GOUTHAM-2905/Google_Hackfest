"""POST /api/plot — execute SQL and return chart-ready + table-ready data.

Used by the chat interface to:
  1. Show a results table for any executed SQL
  2. Render inline SVG charts (bar / pie / line) when a plot is requested
"""
import logging
import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from api.ingest import get_connection
from core.db_connector import create_engine_from_request

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_ROWS = 500   # safety cap


class PlotRequest(BaseModel):
    service_name: str
    sql: str
    chart_type: str = "bar"   # bar | pie | line | horizontal_bar


@router.post("/plot")
def run_plot(req: PlotRequest):
    """
    Execute arbitrary SQL and return:
      - rows      : list of dicts (capped at MAX_ROWS)
      - columns   : ordered column names
      - row_count : total rows returned (before cap)
      - duration_ms: query execution time in milliseconds
      - label_col / value_col: inferred from types for charting
      - chart_type : echoed back for the frontend
    """
    try:
        conn_req = get_connection(req.service_name)
    except Exception:
        raise HTTPException(404, detail=f"Connection '{req.service_name}' not found. Make sure the database is connected.")

    engine = create_engine_from_request(conn_req)
    t0 = time.monotonic()
    try:
        with engine.connect() as con:
            result = con.execute(text(req.sql))
            cols = list(result.keys())
            all_rows = result.fetchall()
            duration_ms = round((time.monotonic() - t0) * 1000)
            rows = [dict(zip(cols, r)) for r in all_rows[:MAX_ROWS]]
    except Exception as e:
        duration_ms = round((time.monotonic() - t0) * 1000)
        raise HTTPException(400, detail=f"SQL error ({duration_ms}ms): {e}")
    finally:
        engine.dispose()

    if not rows:
        return {
            "columns": cols, "rows": [], "chart_type": req.chart_type,
            "label_col": None, "value_col": None,
            "row_count": 0, "total_rows": 0, "duration_ms": duration_ms,
            "truncated": False,
        }

    # Infer label + value columns for charting
    sample = rows[0]
    label_col = next((c for c in cols if not isinstance(sample.get(c), (int, float))), cols[0])
    value_col = next((c for c in cols if isinstance(sample.get(c), (int, float))), None)

    # Serialise (Decimal / datetime → str/float)
    def _coerce(v):
        if isinstance(v, (int, float)):
            return float(v)
        return str(v) if v is not None else None

    clean_rows = [{k: _coerce(v) for k, v in r.items()} for r in rows]

    return {
        "columns":    cols,
        "rows":       clean_rows,
        "chart_type": req.chart_type,
        "label_col":  label_col,
        "value_col":  value_col,
        "row_count":  len(clean_rows),
        "total_rows": len(all_rows),
        "duration_ms": duration_ms,
        "truncated":  len(all_rows) > MAX_ROWS,
    }
