import pytest
from datetime import datetime
from core.export_builder import build_json, build_markdown
from models.documentation import DocumentationArtifact
from models.quality import TableQualityProfile

@pytest.fixture
def mock_artifact():
    return DocumentationArtifact(
        table_name="users",
        fully_qualified_name="public.users",
        business_summary="Stores user profiles.",
        usage_recommendations="Join with orders.",
        quality_score=90.0,
        columns=[
            {"name": "id", "data_type": "int", "is_primary_key": True, "description": "Primary key"}
        ]
    )

@pytest.fixture
def mock_profile():
    return TableQualityProfile(
        table_name="users",
        row_count=1000,
        overall_completeness_pct=95.0,
        aggregate_score=90.0,
        grade="A",
        badge_color="green",
        columns=[]
    )

def test_build_json(mock_artifact, mock_profile):
    data = build_json(mock_artifact, mock_profile)
    assert data["table_name"] == "users"
    assert data["business_summary"] == "Stores user profiles."
    assert data["quality_profile"]["row_count"] == 1000

def test_build_markdown(mock_artifact, mock_profile):
    md = build_markdown(mock_artifact, mock_profile)
    assert "# users" in md
    assert "Stores user profiles." in md
    assert "90.0/100" in md
