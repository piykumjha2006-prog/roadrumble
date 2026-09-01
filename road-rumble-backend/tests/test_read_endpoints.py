from datetime import datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session
from app.models import Pothole, get_utc_now

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


def test_get_all_potholes_empty(client: TestClient):
    response = client.get("/api/potholes")
    assert response.status_code == 200
    assert response.json() == []


def test_get_all_potholes_and_ordering(client: TestClient, session: Session):
    now = get_utc_now()
    old_time = now - timedelta(hours=2)
    new_time = now - timedelta(minutes=10)

    p1 = Pothole(
        lat=12.9716,
        lng=77.5946,
        confidence=0.70,
        image_path="uploads/1.jpg",
        last_seen=old_time,
        timestamp=old_time,
    )
    p2 = Pothole(
        lat=13.0000,
        lng=77.6000,
        confidence=0.90,
        image_path="uploads/2.jpg",
        last_seen=new_time,
        timestamp=new_time,
    )

    session.add(p1)
    session.add(p2)
    session.commit()

    response = client.get("/api/potholes")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Ordered by last_seen desc (newer record p2 first)
    assert data[0]["id"] == 2
    assert data[1]["id"] == 1


def test_filter_by_min_confidence(client: TestClient, session: Session):
    now = get_utc_now()
    p1 = Pothole(
        lat=12.97,
        lng=77.59,
        confidence=0.60,
        image_path="uploads/1.jpg",
        last_seen=now,
        timestamp=now,
    )
    p2 = Pothole(
        lat=12.98,
        lng=77.60,
        confidence=0.85,
        image_path="uploads/2.jpg",
        last_seen=now,
        timestamp=now,
    )

    session.add(p1)
    session.add(p2)
    session.commit()

    response = client.get("/api/potholes?min_confidence=0.80")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 2
    assert data[0]["confidence"] == 0.85


def test_filter_by_since(client: TestClient, session: Session):
    now = get_utc_now()
    past_time = now - timedelta(days=5)
    recent_time = now - timedelta(hours=1)

    p1 = Pothole(
        lat=12.97,
        lng=77.59,
        confidence=0.80,
        image_path="uploads/1.jpg",
        last_seen=past_time,
        timestamp=past_time,
    )
    p2 = Pothole(
        lat=12.98,
        lng=77.60,
        confidence=0.85,
        image_path="uploads/2.jpg",
        last_seen=recent_time,
        timestamp=recent_time,
    )

    session.add(p1)
    session.add(p2)
    session.commit()

    cutoff_time = (now - timedelta(days=1)).isoformat() + "Z"
    response = client.get(f"/api/potholes?since={cutoff_time}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == 2


def test_get_pothole_by_id_success(client: TestClient, session: Session):
    now = get_utc_now()
    p = Pothole(
        lat=12.9716,
        lng=77.5946,
        confidence=0.88,
        road_name="Indiranagar 100ft Rd",
        image_path="uploads/1.jpg",
        last_seen=now,
        timestamp=now,
    )
    session.add(p)
    session.commit()

    response = client.get("/api/potholes/1")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == 1
    assert data["road_name"] == "Indiranagar 100ft Rd"
    assert data["image_url"] == "/uploads/1.jpg"


def test_get_pothole_by_id_not_found(client: TestClient):
    response = client.get("/api/potholes/999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Pothole not found"
