import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session, select
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session, engine
from app.models import Pothole
from seed import seed_potholes, reset_db_and_uploads

test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture(name="session")
def session_fixture():
    SQLModel.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        yield session
    SQLModel.metadata.drop_all(test_engine)


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_seed_and_reset_endpoints(client: TestClient):
    # 1. Trigger Seed API
    res_seed = client.post("/api/seed")
    assert res_seed.status_code == 200
    assert res_seed.json()["status"] == "ok"
    assert res_seed.json()["count"] == 6

    # Verify potholes can be retrieved
    res_list = client.get("/api/potholes")
    assert res_list.status_code == 200
    potholes = res_list.json()
    assert len(potholes) == 6

    # 2. Trigger Reset API
    res_reset = client.post("/api/reset")
    assert res_reset.status_code == 200
    assert res_reset.json()["status"] == "ok"

    # Verify database is empty
    res_empty = client.get("/api/potholes")
    assert res_empty.status_code == 200
    assert res_empty.json() == []


def test_seed_and_reset_cli():
    # Test seed_potholes function directly
    count = seed_potholes(12.9716, 77.5946)
    assert count == 6

    # Test reset_db_and_uploads function directly
    reset_db_and_uploads()

    with Session(engine) as session:
        records = session.exec(select(Pothole)).all()
        assert len(records) == 0
