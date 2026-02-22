"""GET/DELETE /api/connections — connection registry management."""
from fastapi import APIRouter, HTTPException
from api.ingest import _connection_registry, list_connections

router = APIRouter()


@router.get("/connections")
def get_connections():
    result = []
    for svc_name, conn_req in _connection_registry.items():
        result.append({
            "service_name": svc_name,
            "db_type": conn_req.db_type,
            "host": conn_req.host,
            "database": conn_req.database,
            "file_path": conn_req.file_path,
            "status": "connected",
        })
    return {"connections": result}


@router.delete("/connections/{service_name}")
def delete_connection(service_name: str):
    if service_name not in _connection_registry:
        raise HTTPException(404, detail=f"Service '{service_name}' not found.")
    del _connection_registry[service_name]
    # Best-effort: remove from OpenMetadata
    try:
        from integrations.openmetadata_client import OpenMetadataClient
        with OpenMetadataClient() as om:
            om.delete_service(service_name)
    except Exception:
        pass
    return {"message": f"Service '{service_name}' removed successfully."}
