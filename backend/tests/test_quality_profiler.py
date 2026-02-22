import pytest
from core.quality_profiler import compute_aggregate_score, compute_freshness_score, profile_table
from models.quality import ColumnQuality
from models.connection import ConnectionRequest

def test_compute_freshness_score():
    score = compute_freshness_score(None)
    assert score == 0.50

def test_compute_aggregate_score():
    col_scores = [
        ColumnQuality(column_name="id", completeness_pct=100.0, distinctness_pct=100.0, null_count=0, distinct_count=100)
    ]
    flags = [True]
    agg, grade, badge = compute_aggregate_score(col_scores, flags, None)
    # Weights: comp: 0.5, uniq: 0.3, fresh: 0.2
    # comp = 1.0 * 0.5 = 0.5
    # uniq = 1.0 * 0.3 = 0.3
    # fresh = 0.5 * 0.2 = 0.1
    # total = 0.9 * 100 = 90.0
    assert agg == 90.0
    assert grade == "A"
    assert badge == "green"

def test_profile_table_sqlite(temp_sqlite_db):
    req = ConnectionRequest(db_type="sqlite", service_name="test_sqlite", file_path=temp_sqlite_db)
    profile = profile_table(req, "users")
    
    assert profile.table_name == "users"
    assert profile.row_count == 1
    assert profile.overall_completeness_pct == 100.0
    assert len(profile.columns) == 3
