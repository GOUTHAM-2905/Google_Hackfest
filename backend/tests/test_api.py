import pytest
from unittest.mock import patch

def test_health_check(client):
    with patch("api.health._check_ollama", return_value={"status": "up", "error": None}), \
         patch("api.health._check_openmetadata", return_value={"status": "up", "error": None}):
        
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {
            "status": "ok",
            "services": {
                "ollama": {"status": "up", "error": None},
                "openmetadata": {"status": "up", "error": None}
            }
        }
