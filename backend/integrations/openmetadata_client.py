"""
OpenMetadata integration client.
Wraps the OpenMetadata REST API to store and retrieve schema metadata,
quality profiles, and AI-generated documentation.
"""
import logging
from typing import Optional
import httpx
import json

from config import settings

logger = logging.getLogger(__name__)

BASE = settings.OPENMETADATA_HOST.rstrip("/")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.OPENMETADATA_JWT_TOKEN}",
        "Content-Type": "application/json",
    }


class OpenMetadataClient:
    """Thin wrapper around the OpenMetadata v1 REST API."""

    def __init__(self):
        self.base = BASE
        self.client = httpx.Client(timeout=30, headers=_headers())

    # ── Service ───────────────────────────────────────────────────────────────

    def create_or_update_service(self, service_name: str, db_type: str) -> dict:
        """Create (or return existing) DatabaseService entity."""
        service_type_map = {
            "sqlite": "SQLite",
            "postgresql": "Postgres",
            "snowflake": "Snowflake",
            "sqlserver": "Mssql",
        }
        om_type = service_type_map.get(db_type.lower(), "SQLite")

        payload = {
            "name": service_name,
            "serviceType": om_type,
            "connection": {"config": {"type": om_type}},
        }
        resp = self.client.put(f"{self.base}/api/v1/services/databaseServices", json=payload)
        resp.raise_for_status()
        return resp.json()

    def get_service(self, service_name: str) -> Optional[dict]:
        resp = self.client.get(f"{self.base}/api/v1/services/databaseServices/name/{service_name}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def list_services(self) -> list[dict]:
        resp = self.client.get(f"{self.base}/api/v1/services/databaseServices?limit=100")
        resp.raise_for_status()
        return resp.json().get("data", [])

    # ── Database ──────────────────────────────────────────────────────────────

    def create_or_update_database(self, service_name: str, db_name: str) -> dict:
        payload = {
            "name": db_name,
            "service": service_name,
        }
        resp = self.client.put(f"{self.base}/api/v1/databases", json=payload)
        resp.raise_for_status()
        return resp.json()

    # ── Table ─────────────────────────────────────────────────────────────────

    def upsert_table(
        self,
        service_name: str,
        db_name: str,
        schema_name: str,
        table_name: str,
        columns: list[dict],
        description: str = "",
    ) -> dict:
        """Create or update a Table entity in OpenMetadata."""
        fqn = f"{service_name}.{db_name}.{schema_name}.{table_name}"
        payload = {
            "name": table_name,
            "databaseSchema": f"{service_name}.{db_name}.{schema_name}",
            "columns": columns,
            "description": description,
        }
        resp = self.client.put(f"{self.base}/api/v1/tables", json=payload)
        if resp.status_code not in (200, 201):
            logger.warning("upsert_table %s → %s: %s", fqn, resp.status_code, resp.text[:200])
        resp.raise_for_status()
        return resp.json()

    def get_table_by_name(self, fqn: str) -> Optional[dict]:
        resp = self.client.get(
            f"{self.base}/api/v1/tables/name/{fqn}",
            params={"fields": "columns,tableConstraints,profile"}
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def list_tables(self, service_name: str) -> list[dict]:
        resp = self.client.get(
            f"{self.base}/api/v1/tables",
            params={"database": service_name, "limit": 500, "fields": "description,tags"}
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    def patch_description(self, table_id: str, description: str) -> None:
        """Update only the description field on a table (PATCH)."""
        patch = [{"op": "add", "path": "/description", "value": description}]
        resp = self.client.patch(
            f"{self.base}/api/v1/tables/{table_id}",
            content=json.dumps(patch),
            headers={**_headers(), "Content-Type": "application/json-patch+json"},
        )
        resp.raise_for_status()

    def patch_extension(self, table_id: str, key: str, value: str) -> None:
        """Store arbitrary key-value in the table's extension map."""
        patch = [{"op": "add", "path": f"/extension/{key}", "value": value}]
        resp = self.client.patch(
            f"{self.base}/api/v1/tables/{table_id}",
            content=json.dumps(patch),
            headers={**_headers(), "Content-Type": "application/json-patch+json"},
        )
        resp.raise_for_status()

    def get_undocumented_tables(self, service_name: str) -> list[dict]:
        """Return tables that have no description set yet."""
        all_tables = self.list_tables(service_name)
        return [t for t in all_tables if not t.get("description", "").strip()]

    def patch_column_description(self, table_id: str, column_name: str, description: str) -> None:
        """Update only the description of a specific column (PATCH)."""
        # Note: OpenMetadata uses /columns/<index>/description for patching by index,
        # or we have to find the column by name in the UI/model.
        # However, the most reliable way in v1 for a specific column is to use /columns/N/description
        # if we know the index, but we can also use the field path if the API supports it.
        # A safer way without index is to get the table first, but let's try the common /columns/<name>/description path
        # if the server supports it, otherwise we'll need a different approach.
        # Standard OM patch for columns: /columns/i/description
        table = self.get_table_by_name(table_id) # if table_id is FQN
        if not table: # maybe table_id is actually UUID
             resp = self.client.get(f"{self.base}/api/v1/tables/{table_id}?fields=columns")
             table = resp.json()
        
        cols = table.get("columns", [])
        idx = next((i for i, c in enumerate(cols) if c["name"] == column_name), None)
        if idx is not None:
            patch = [{"op": "add", "path": f"/columns/{idx}/description", "value": description}]
            self.client.patch(
                f"{self.base}/api/v1/tables/{table['id']}",
                content=json.dumps(patch),
                headers={**_headers(), "Content-Type": "application/json-patch+json"},
            ).raise_for_status()

    def search_tables(self, query: str, service_name: Optional[str] = None) -> list[dict]:
        params = {"q": query, "index": "table_search_index", "from": 0, "size": 10}
        resp = self.client.get(f"{self.base}/api/v1/search/query", params=params)
        if resp.status_code != 200:
            return []
        hits = resp.json().get("hits", {}).get("hits", [])
        results = [h["_source"] for h in hits]
        if service_name:
            results = [r for r in results if service_name in r.get("fullyQualifiedName", "")]
        return results

    # ── TableProfile ──────────────────────────────────────────────────────────

    def create_table_profile(self, table_fqn: str, profile_payload: dict) -> None:
        resp = self.client.put(
            f"{self.base}/api/v1/tables/{table_fqn}/tableProfile",
            json=profile_payload,
        )
        if resp.status_code not in (200, 201):
            logger.warning("create_table_profile %s → %s", table_fqn, resp.status_code)

    # ── Cleanup ───────────────────────────────────────────────────────────────

    def delete_service(self, service_name: str) -> None:
        svc = self.get_service(service_name)
        if not svc:
            return
        svc_id = svc["id"]
        resp = self.client.delete(
            f"{self.base}/api/v1/services/databaseServices/{svc_id}",
            params={"hardDelete": True, "recursive": True},
        )
        resp.raise_for_status()

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
