import os
import sys

# Add the parent directory (backend) to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
import sqlite3
import tempfile
from fastapi.testclient import TestClient

from main import app

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def temp_sqlite_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    try:
        conn = sqlite3.connect(path)
        cur = conn.cursor()
        cur.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE);")
        cur.execute("INSERT INTO users (name, email) VALUES ('Test User', 'test@example.com');")
        conn.commit()
        conn.close()
        yield path
    finally:
        os.close(fd)
        os.remove(path)
