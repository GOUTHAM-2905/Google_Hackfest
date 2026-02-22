"""POST /api/ingest — connect to DB, extract schema, push to OpenMetadata."""
import logging
import time
from fastapi import APIRouter, HTTPException

from core.db_connector import reflect_schema, create_engine_from_request, get_row_count, _get_default_schema
from integrations.openmetadata_client import OpenMetadataClient
from models.connection import ConnectionRequest, ConnectionResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory registry: service_name → ConnectionRequest (for later profiling/generation)
_connection_registry: dict[str, ConnectionRequest] = {}


def get_connection(service_name: str) -> ConnectionRequest:
    if service_name not in _connection_registry:
        raise HTTPException(404, detail=f"Service '{service_name}' not found. Please ingest it first.")
    return _connection_registry[service_name]


def list_connections() -> list[str]:
    return list(_connection_registry.keys())


@router.post("/ingest", response_model=ConnectionResponse, status_code=201)
def ingest(req: ConnectionRequest):
    """
    1. Validate DB connection
    2. Reflect schema (tables, columns, constraints)
    3. Register in OpenMetadata
    4. Return summary
    """
    t0 = time.time()
    try:
        tables = reflect_schema(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Ingestion failed")
        raise HTTPException(status_code=500, detail=f"Ingestion error: {e}")

    # Enrich with row counts
    try:
        engine = create_engine_from_request(req)
        schema = _get_default_schema(engine, req.db_type)
        for t in tables:
            try:
                t.row_count = get_row_count(engine, t.table_name, schema)
            except Exception:
                pass
        engine.dispose()
    except Exception:
        pass

    # Push to OpenMetadata
    with OpenMetadataClient() as om:
        try:
            om.create_or_update_service(req.service_name, req.db_type)
            db_name = req.database or "local"
            om.create_or_update_database(req.service_name, db_name)
            for t in tables:
                om_cols = [
                    {
                        "name": c.name,
                        "dataType": c.data_type,
                        "description": "",
                        "constraint": "PRIMARY_KEY" if c.is_primary_key else "FOREIGN_KEY" if c.is_foreign_key else None,
                    }
                    for c in t.columns
                ]
                try:
                    schema_name = schema or "main"
                    om.upsert_table(req.service_name, db_name, schema_name, t.table_name, om_cols)
                except Exception as e:
                    logger.warning("Could not push table %s to OpenMetadata: %s", t.table_name, e)
        except Exception as e:
            logger.warning("OpenMetadata push failed (non-fatal): %s", e)

    # Store in registry
    _connection_registry[req.service_name] = req

    return ConnectionResponse(
        service_name=req.service_name,
        tables_ingested=len(tables),
        duration_seconds=round(time.time() - t0, 2),
        tables=[t.table_name for t in tables],
    )
