import io
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session
from app.utils import haversine_distance

# Set up in-memory SQLite database engine for testing
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


def test_haversine_distance_zero():
    # Same point should return 0 distance
    dist = haversine_distance(12.9716, 77.5946, 12.9716, 77.5946)
    assert dist == 0.0


def test_haversine_distance_small_offset():
    # Offset of 0.00002 deg (~2.2 meters)
    dist = haversine_distance(12.9716, 77.5946, 12.971618, 77.594618)
    assert 1.0 < dist < 4.0


def test_dedup_radius(client: TestClient):
    fake_image_bytes = b"fake-jpg-content"

    # 1. First upload: New Pothole at (12.9716, 77.5946)
    response1 = client.post(
        "/api/potholes",
        data={
            "lat": "12.9716",
            "lng": "77.5946",
            "confidence": "0.80",
            "timestamp": "2026-08-31T10:00:00Z",
        },
        files={"image": ("test1.jpg", io.BytesIO(fake_image_bytes), "image/jpeg")},
    )
    assert response1.status_code == 201
    data1 = response1.json()
    assert data1["status"] == "new"
    assert data1["record"]["id"] == 1
    assert data1["record"]["hit_count"] == 1
    assert data1["record"]["confidence"] == 0.80
    assert data1["record"]["image_url"] == "/uploads/1.jpg"

    # 2. Second upload: Duplicate pothole ~2 meters away (12.971618, 77.594618)
    response2 = client.post(
        "/api/potholes",
        data={
            "lat": "12.971618",
            "lng": "77.594618",
            "confidence": "0.95",
            "timestamp": "2026-08-31T11:00:00Z",
        },
        files={"image": ("test2.jpg", io.BytesIO(fake_image_bytes), "image/jpeg")},
    )
    assert response2.status_code == 201
    data2 = response2.json()
    assert data2["status"] == "duplicate"
    assert data2["record"]["id"] == 1
    assert data2["record"]["hit_count"] == 2
    assert data2["record"]["confidence"] == 0.95  # Confidence updated to higher value

    # 3. Third upload: New pothole outside 5 meters radius (~60 meters away: 12.9721, 77.5946)
    response3 = client.post(
        "/api/potholes",
        data={
            "lat": "12.9721",
            "lng": "77.5946",
            "confidence": "0.75",
            "timestamp": "2026-08-31T12:00:00Z",
        },
        files={"image": ("test3.jpg", io.BytesIO(fake_image_bytes), "image/jpeg")},
    )
    assert response3.status_code == 201
    data3 = response3.json()
    assert data3["status"] == "new"
    assert data3["record"]["id"] == 2
    assert data3["record"]["hit_count"] == 1
    assert data3["record"]["image_url"] == "/uploads/2.jpg"
