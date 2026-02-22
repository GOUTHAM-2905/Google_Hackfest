"""
Quality Profiler — SQL pushdown metrics and scoring engine.
Per spec: 08-scoring-engine-spec.md
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import text

from config import settings
from core.db_connector import create_engine_from_request, _get_default_schema
from models.connection import ConnectionRequest
from models.quality import ColumnQuality, TableQualityProfile, ColumnStatistics

logger = logging.getLogger(__name__)

WEIGHTS = {"completeness": 0.50, "uniqueness": 0.30, "freshness": 0.20}


# ── Individual metric queries ─────────────────────────────────────────────────

def _q(table: str, schema: Optional[str]) -> str:
    """Qualify a table name with schema if present."""
    return f'"{schema}"."{table}"' if schema else f'"{table}"'


def run_completeness(conn, table: str, col: str, schema: Optional[str]) -> tuple[float, int]:
    """Returns (completeness_pct, null_count)."""
    qt = _q(table, schema)
    row = conn.execute(text(
        f"SELECT COUNT(\"{col}\") * 100.0 / COUNT(*) AS pct, "
        f"COUNT(*) - COUNT(\"{col}\") AS null_count FROM {qt}"
    )).one()
    return round(float(row[0] or 0), 2), int(row[1] or 0)


def run_distinctness(conn, table: str, col: str, schema: Optional[str]) -> tuple[float, int]:
    """Returns (distinctness_pct, distinct_count)."""
    qt = _q(table, schema)
    row = conn.execute(text(
        f"SELECT COUNT(DISTINCT \"{col}\") * 100.0 / NULLIF(COUNT(*), 0) AS pct, "
        f"COUNT(DISTINCT \"{col}\") AS dc FROM {qt}"
    )).one()
    return round(float(row[0] or 0), 2), int(row[1] or 0)


def run_freshness(conn, table: str, schema: Optional[str], ts_cols: list[str]) -> Optional[datetime]:
    """Return MAX(timestamp_col) for the first matching timestamp column, or None."""
    qt = _q(table, schema)
    cols_in_table = [
        r[0] for r in conn.execute(text(
            f"SELECT name FROM pragma_table_info('{table}')"
            if "sqlite" in str(conn.engine.url) else
            f"SELECT column_name FROM information_schema.columns WHERE table_name='{table}'"
        ))
    ]
    for tc in ts_cols:
        if tc in cols_in_table:
            try:
                row = conn.execute(text(f'SELECT MAX("{tc}") FROM {qt}')).one()
                if row[0]:
                    if isinstance(row[0], datetime):
                        return row[0].replace(tzinfo=timezone.utc) if row[0].tzinfo is None else row[0]
                    return datetime.fromisoformat(str(row[0])).replace(tzinfo=timezone.utc)
            except Exception:
                continue
    return None


# ── Scoring engine (per spec §3) ─────────────────────────────────────────────

def compute_freshness_score(ts: Optional[datetime]) -> float:
    if ts is None:
        return 0.50
    now = datetime.now(timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    delta_h = (now - ts).total_seconds() / 3600
    if delta_h < 1:       return 1.00
    elif delta_h < 24:    return 0.90
    elif delta_h < 168:   return 0.75
    elif delta_h < 720:   return 0.50
    else:                 return 0.25


def compute_aggregate_score(
    col_scores: list[ColumnQuality],
    is_key_flags: list[bool],
    freshness_ts: Optional[datetime],
) -> tuple[float, str, str]:
    """Returns (aggregate_score_0_100, grade, badge_color)."""
    comp_avg = (sum(c.completeness_pct for c in col_scores) / len(col_scores) / 100.0) if col_scores else 0.0
    key_cols = [c for c, k in zip(col_scores, is_key_flags) if k]
    if key_cols:
        uniq_avg = sum(c.distinctness_pct for c in key_cols) / len(key_cols) / 100.0
    else:
        uniq_avg = 0.50
    fresh_score = compute_freshness_score(freshness_ts)
    agg = (
        comp_avg   * WEIGHTS["completeness"] +
        uniq_avg   * WEIGHTS["uniqueness"]   +
        fresh_score * WEIGHTS["freshness"]
    ) * 100.0
    agg = round(min(max(agg, 0.0), 100.0), 1)
    grade = "A" if agg >= 90 else "B" if agg >= 80 else "C" if agg >= 70 else "D" if agg >= 60 else "F"
    badge = "green" if agg >= 90 else "amber" if agg >= 70 else "red" if agg >= 50 else "critical"
    return agg, grade, badge


# ── Statistical analysis ─────────────────────────────────────────────────────

NUMERIC_TYPES = {"INTEGER", "INT", "BIGINT", "SMALLINT", "FLOAT", "DOUBLE", "REAL", "NUMERIC", "DECIMAL"}


def _run_statistics(
    conn, table: str, col_name: str, col_type: str, schema: Optional[str]
) -> Optional[ColumnStatistics]:
    """Compute min, max, mean, median, std_dev, top-5 values for a column."""
    qt = _q(table, schema)
    cq = f'"{col_name}"'
    dtype = str(col_type).upper().split("(")[0].strip()
    stats = ColumnStatistics(column_name=col_name, data_type=dtype)

    try:
        # Top-5 most frequent values (works for all types)
        top_rows = conn.execute(text(
            f"SELECT {cq}, COUNT(*) as cnt FROM {qt} WHERE {cq} IS NOT NULL "
            f"GROUP BY {cq} ORDER BY cnt DESC LIMIT 5"
        )).fetchall()
        total = conn.execute(text(f"SELECT COUNT(*) FROM {qt}")).scalar() or 1
        stats.top_values = [
            {"value": str(r[0]), "count": int(r[1]), "pct": round(int(r[1]) * 100.0 / total, 1)}
            for r in top_rows
        ]
    except Exception:
        pass

    # Numeric-only stats
    if dtype in NUMERIC_TYPES or any(t in dtype for t in ("INT", "FLOAT", "DOUBLE", "REAL", "NUMER", "DECIM")):
        try:
            row = conn.execute(text(
                f"SELECT MIN({cq}), MAX({cq}), AVG(CAST({cq} AS FLOAT)) FROM {qt} WHERE {cq} IS NOT NULL"
            )).one()
            stats.min_value = row[0]
            stats.max_value = row[1]
            stats.mean = round(float(row[2]), 4) if row[2] is not None else None
        except Exception:
            pass

        try:
            # Std deviation (SQLite lacks STDDEV — calculate manually with variance formula)
            if stats.mean is not None:
                var_row = conn.execute(text(
                    f"SELECT AVG((CAST({cq} AS FLOAT) - :mean) * (CAST({cq} AS FLOAT) - :mean)) "
                    f"FROM {qt} WHERE {cq} IS NOT NULL"
                ), {"mean": stats.mean}).scalar()
                if var_row is not None:
                    stats.std_dev = round(float(var_row) ** 0.5, 4)
        except Exception:
            pass

        # Median via row-numbering (approx, works in SQLite)
        try:
            median_row = conn.execute(text(
                f"SELECT AVG(CAST({cq} AS FLOAT)) FROM ("
                f"  SELECT {cq} FROM {qt} WHERE {cq} IS NOT NULL ORDER BY {cq} "
                f"  LIMIT 2 - (SELECT COUNT(*) FROM {qt} WHERE {cq} IS NOT NULL) % 2 "
                f"  OFFSET (SELECT (COUNT(*) - 1) / 2 FROM {qt} WHERE {cq} IS NOT NULL)"
                f")"
            )).scalar()
            if median_row is not None:
                stats.median = round(float(median_row), 4)
        except Exception:
            pass

    return stats


# ── Main profiling entry point ────────────────────────────────────────────────

def profile_table(req: ConnectionRequest, table_name: str) -> TableQualityProfile:
    """
    Run SQL pushdown profiling for a single table.
    Returns a TableQualityProfile.
    """
    freshness_hints = settings.freshness_column_list
    engine = create_engine_from_request(req)
    schema = _get_default_schema(engine, req.db_type)

    from sqlalchemy import inspect as sa_inspect
    insp = sa_inspect(engine)
    raw_columns = insp.get_columns(table_name, schema=schema)
    pk_cols = set(insp.get_pk_constraint(table_name, schema=schema).get("constrained_columns", []))

    col_scores: list[ColumnQuality] = []
    is_key_flags: list[bool] = []
    row_count = 0
    freshness_ts: Optional[datetime] = None

    with engine.connect() as conn:
        # Row count
        qt = _q(table_name, schema)
        row_count = conn.execute(text(f"SELECT COUNT(*) FROM {qt}")).scalar() or 0

        # Per-column metrics
        for col_info in raw_columns:
            col_name = col_info["name"]
            col_type = col_info.get("type", "TEXT")
            try:
                comp_pct, null_cnt = run_completeness(conn, table_name, col_name, schema)
                dist_pct, dist_cnt = run_distinctness(conn, table_name, col_name, schema)
            except Exception as e:
                logger.warning("Skipping column %s.%s: %s", table_name, col_name, e)
                continue

            stats = None
            try:
                stats = _run_statistics(conn, table_name, col_name, col_type, schema)
            except Exception as e:
                logger.debug("Stats skipped for %s.%s: %s", table_name, col_name, e)

            col_scores.append(ColumnQuality(
                column_name=col_name,
                completeness_pct=comp_pct,
                distinctness_pct=dist_pct,
                null_count=null_cnt,
                distinct_count=dist_cnt,
                statistics=stats,
            ))
            is_key_flags.append(col_name in pk_cols)

        # Freshness
        freshness_ts = run_freshness(conn, table_name, schema, freshness_hints)

    engine.dispose()

    overall_comp = (sum(c.completeness_pct for c in col_scores) / len(col_scores)) if col_scores else 0.0
    agg, grade, badge = compute_aggregate_score(col_scores, is_key_flags, freshness_ts)

    return TableQualityProfile(
        table_name=table_name,
        row_count=row_count,
        freshness_timestamp=freshness_ts,
        overall_completeness_pct=round(overall_comp, 2),
        aggregate_score=agg,
        grade=grade,
        badge_color=badge,
        columns=col_scores,
    )
