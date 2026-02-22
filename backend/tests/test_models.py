import pytest
from models.connection import ConnectionRequest, ConnectionResponse
from models.documentation import DocumentationArtifact
from models.quality import TableQualityProfile

def test_connection_request():
    req = ConnectionRequest(db_type="sqlite", service_name="test_sqlite", file_path="/tmp/test.db")
    assert req.db_type == "sqlite"
    assert req.get_sqlalchemy_url() == "sqlite:////tmp/test.db"

    req_pg = ConnectionRequest(
        db_type="postgresql", 
        service_name="test_pg", 
        host="localhost", 
        username="user", 
        password="password", 
        database="testdb"
    )
    assert req_pg.get_sqlalchemy_url() == "postgresql+psycopg2://user:password@localhost:5432/testdb"

def test_documentation_artifact():
    artifact = DocumentationArtifact(
        table_name="users",
        business_summary="A summary",
        usage_recommendations="Some recommendations",
        quality_score=95.0
    )
    assert artifact.table_name == "users"
    assert artifact.quality_score == 95.0

def test_table_quality_profile():
    profile = TableQualityProfile(
        table_name="users",
        row_count=100,
        overall_completeness_pct=99.0,
        aggregate_score=95.0,
        grade="A",
        badge_color="green",
        columns=[]
    )
    assert profile.grade == "A"
