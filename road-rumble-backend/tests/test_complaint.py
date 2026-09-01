from pathlib import Path
from PIL import Image as PILImage
import pytest
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app
from app.database import get_session
from app.models import Pothole

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


def test_generate_complaint_success(client: TestClient, session: Session, tmp_path: Path):
    # Create a real small test JPEG file
    img_dir = Path("uploads")
    img_dir.mkdir(exist_ok=True)
    test_img_path = img_dir / "test_complaint_99.jpg"
    img = PILImage.new("RGB", (100, 100), color="red")
    img.save(test_img_path)

    p = Pothole(
        lat=12.9716,
        lng=77.5946,
        confidence=0.88,
        road_name="100 Feet Rd, Indiranagar",
        image_path=str(test_img_path),
        hit_count=3,
        ward_number="Ward 112",
        contractor_info="ABC Infrastructure Ltd",
        complaint_status="none",
    )
    session.add(p)
    session.commit()
    session.refresh(p)

    response = client.post(f"/api/potholes/{p.id}/complaint")
    assert response.status_code == 200
    data = response.json()

    assert data["pdf_url"] == f"/complaints/{p.id}.pdf"
    assert "mailto:grievance@example.gov.in" in data["mailto"]

    prefilled = data["prefilled"]
    assert prefilled["road_name"] == "100 Feet Rd, Indiranagar"
    assert prefilled["coordinates"] == "12.9716, 77.5946"
    assert prefilled["ward_number"] == "Ward 112"
    assert prefilled["contractor_info"] == "ABC Infrastructure Ltd"

    # Verify complaint PDF file was created on disk
    pdf_path = Path("complaints") / f"{p.id}.pdf"
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 0

    # Verify DB complaint_status updated to "generated"
    session.refresh(p)
    assert p.complaint_status == "generated"

    # Clean up test image
    if test_img_path.exists():
        test_img_path.unlink()


def test_generate_complaint_not_found(client: TestClient):
    response = client.post("/api/potholes/999/complaint")
    assert response.status_code == 404
    assert response.json()["detail"] == "Pothole not found"
