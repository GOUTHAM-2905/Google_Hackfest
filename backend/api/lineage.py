"""GET /api/lineage/{service_name} — FK relationship graph with smart inference.

Two-pass approach:
  1. Real FK constraints from the database (via SQLAlchemy inspect)
  2. Inferred FKs from column naming conventions (e.g. customer_id → customers.id)
     using singular/plural matching so even unmigrated schemas get meaningful edges.
"""
import logging
from fastapi import APIRouter, HTTPException
from sqlalchemy import inspect as sa_inspect, text

from api.ingest import get_connection
from core.db_connector import create_engine_from_request, _get_default_schema

router = APIRouter()
logger = logging.getLogger(__name__)


# ── FK inference helpers ───────────────────────────────────────────────────────

def _candidates(col_name: str) -> list[str]:
    """Return possible referenced table names for a *_id column.

    customer_id  → ["customers", "customer"]
    order_id     → ["orders", "order"]
    staff_id     → ["staffs", "staff"]
    store_id     → ["stores", "store"]
    """
    if not col_name.endswith("_id"):
        return []
    stem = col_name[:-3]          # strip "_id"
    return [stem + "s", stem, stem + "es"]  # plural + singular + es-plural


def _infer_fks(
    table: str,
    columns: list[str],
    all_tables: set[str],
    existing_edges: set[tuple],
) -> list[dict]:
    """Infer foreign keys by matching *_id columns to existing table names."""
    inferred = []
    for col in columns:
        for candidate in _candidates(col):
            if candidate in all_tables and candidate != table:
                key = (table, candidate, col, "id")
                if key not in existing_edges:
                    inferred.append({
                        "source":        table,
                        "target":        candidate,
                        "source_column": col,
                        "target_column": "id",
                        "label":         f"{col} → {candidate}.id",
                        "inferred":      True,
                    })
                break   # only match the first candidate per column
    return inferred


# ── Route ──────────────────────────────────────────────────────────────────────

@router.get("/lineage/{service_name}")
def get_lineage(service_name: str):
    """Return nodes (tables) and edges (FK + inferred FK) for schema graph rendering."""
    try:
        conn_req = get_connection(service_name)
    except Exception:
        raise HTTPException(404, detail=f"Connection '{service_name}' not found")

    engine = create_engine_from_request(conn_req)
    schema = _get_default_schema(engine, conn_req.db_type)
    insp = sa_inspect(engine)

    table_names: list[str] = insp.get_table_names(schema=schema)
    all_tables = set(table_names)
    nodes: list[dict] = []
    edges: list[dict] = []
    existing_edge_keys: set[tuple] = set()

    for table in table_names:
        # Row count
        row_count = 0
        try:
            with engine.connect() as con:
                row_count = con.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar() or 0
        except Exception:
            pass

        nodes.append({"id": table, "label": table, "row_count": row_count})

        # ── Pass 1: real FK constraints ─────────────────────────────────────
        try:
            fks = insp.get_foreign_keys(table, schema=schema)
            for fk in fks:
                for src_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                    key = (table, fk["referred_table"], src_col, ref_col)
                    existing_edge_keys.add(key)
                    edges.append({
                        "source":        table,
                        "target":        fk["referred_table"],
                        "source_column": src_col,
                        "target_column": ref_col,
                        "label":         f"{src_col} → {fk['referred_table']}.{ref_col}",
                        "inferred":      False,
                    })
        except Exception as e:
            logger.warning("FK inspection failed for %s: %s", table, e)

    # ── Pass 2: infer FKs from column naming conventions ────────────────────
    for table in table_names:
        try:
            cols_info = insp.get_columns(table, schema=schema)
            col_names = [c["name"] for c in cols_info]
            inferred = _infer_fks(table, col_names, all_tables, existing_edge_keys)
            edges.extend(inferred)
            for e in inferred:
                logger.info("Inferred FK: %s.%s → %s.%s",
                            e["source"], e["source_column"],
                            e["target"], e["target_column"])
        except Exception as ex:
            logger.warning("Column inspection failed for %s: %s", table, ex)

    engine.dispose()

    return {
        "service_name": service_name,
        "node_count":   len(nodes),
        "edge_count":   len(edges),
        "nodes":        nodes,
        "edges":        edges,
    }
