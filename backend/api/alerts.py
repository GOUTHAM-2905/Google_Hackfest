"""
GET /api/alerts/{service_name} — Data quality alert tracking across profiling runs.
Persists profile history to JSON, surfaces drops and anomalies.
"""
import json
import logging
import os
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger(__name__)

HISTORY_DIR = os.path.join(os.path.dirname(__file__), "..", "_history")
os.makedirs(HISTORY_DIR, exist_ok=True)

ALERT_THRESHOLD_DROP = 5.0   # alert if score drops more than 5 points


def _history_path(service_name: str, table_name: str) -> str:
    safe = service_name.replace("/", "_")
    return os.path.join(HISTORY_DIR, f"{safe}__{table_name}.json")


def record_profile(service_name: str, table_name: str, score: float, grade: str):
    """Append a profiling result to the history file. Called after each profile run."""
    path = _history_path(service_name, table_name)
    history = []
    if os.path.exists(path):
        try:
            with open(path) as f:
                history = json.load(f)
        except Exception:
            history = []
    history.append({
        "profiled_at": datetime.now(timezone.utc).isoformat(),
        "score": score,
        "grade": grade,
    })
    # Keep last 50 runs
    history = history[-50:]
    with open(path, "w") as f:
        json.dump(history, f, indent=2)


@router.get("/alerts/{service_name}")
def get_alerts(service_name: str):
    """
    Compare latest profile run to previous for each table.
    Returns a list of alerts where quality score dropped significantly.
    """
    safe = service_name.replace("/", "_")
    alerts = []
    trend_data = {}

    for fname in os.listdir(HISTORY_DIR):
        if not fname.startswith(safe + "__") or not fname.endswith(".json"):
            continue
        table_name = fname[len(safe) + 2:-5]
        path = os.path.join(HISTORY_DIR, fname)
        try:
            with open(path) as f:
                history = json.load(f)
        except Exception:
            continue

        trend_data[table_name] = history

        if len(history) >= 2:
            latest = history[-1]
            previous = history[-2]
            drop = previous["score"] - latest["score"]
            if drop >= ALERT_THRESHOLD_DROP:
                alerts.append({
                    "table": table_name,
                    "severity": "critical" if drop >= 15 else "warning",
                    "message": f"Quality score dropped {round(drop, 1)} points "
                               f"({previous['grade']} → {latest['grade']})",
                    "previous_score": previous["score"],
                    "current_score": latest["score"],
                    "profiled_at": latest["profiled_at"],
                })

    alerts.sort(key=lambda a: a["previous_score"] - a["current_score"], reverse=True)
    return {
        "service_name": service_name,
        "alert_count": len(alerts),
        "alerts": alerts,
        "trend": trend_data,
    }
