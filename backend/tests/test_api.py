import os
import base64
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from app.main import app
from app.database import get_session

TEST_DB = "test_road_rumble.db"
test_engine = create_engine(f"sqlite:///{TEST_DB}", connect_args={"check_same_thread": False})

TINY_JPEG_BYTES = base64.b64decode("slash9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=")

def override_get_session():
    with Session(test_engine) as session:
        yield session

app.dependency_overrides[get_session] = override_get_session
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    SQLModel.metadata.create_all(test_engine)
    yield
    SQLModel.metadata.drop_all(test_engine)
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_post_pothole_and_5m_dedup():
    dummy_file = ("test.jpg", TINY_JPEG_BYTES, "image/jpeg")

    # 1. First POST: should create NEW pothole record
    res1 = client.post(
        "/api/potholes",
        data={
            "lat": "12.9716",
            "lng": "77.5946",
            "timestamp": "2026-08-31T10:22:05Z",
            "confidence": "0.85"
        },
        files={"image": dummy_file}
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "new"
    assert data1["record"]["hit_count"] == 1
    pothole_id = data1["record"]["id"]

    # 2. Second POST within 2 meters (same location): should return "duplicate" & bump hit_count to 2
    dummy_file2 = ("test2.jpg", TINY_JPEG_BYTES, "image/jpeg")
    res2 = client.post(
        "/api/potholes",
        data={
            "lat": "12.97161",
            "lng": "77.59461",
            "timestamp": "2026-08-31T10:25:00Z",
            "confidence": "0.90"
        },
        files={"image": dummy_file2}
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "duplicate"
    assert data2["record"]["id"] == pothole_id
    assert data2["record"]["hit_count"] == 2
    assert data2["record"]["confidence"] == 0.90

def test_get_potholes_list():
    dummy_file = ("test.jpg", TINY_JPEG_BYTES, "image/jpeg")
    client.post(
        "/api/potholes",
        data={
            "lat": "12.9352",
            "lng": "77.6245",
            "timestamp": "2026-08-31T10:22:05Z",
            "confidence": "0.78"
        },
        files={"image": dummy_file}
    )

    res = client.get("/api/potholes")
    assert res.status_code == 200
    items = res.json()
    assert isinstance(items, list)
    assert len(items) >= 1
    assert "image_url" in items[0]

def test_generate_complaint():
    dummy_file = ("test.jpg", TINY_JPEG_BYTES, "image/jpeg")
    res_post = client.post(
        "/api/potholes",
        data={
            "lat": "12.9784",
            "lng": "77.6408",
            "timestamp": "2026-08-31T10:22:05Z",
            "confidence": "0.88"
        },
        files={"image": dummy_file}
    )
    p_id = res_post.json()["record"]["id"]

    res_complaint = client.post(f"/api/potholes/{p_id}/complaint")
    assert res_complaint.status_code == 200
    c_data = res_complaint.json()
    assert "pdf_url" in c_data
    assert "mailto" in c_data
    assert c_data["pdf_url"].endswith(f"{p_id}.pdf")

def test_spa_serving():
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "Road Rumble" in res.text or "<div id=\"root\">" in res.text

