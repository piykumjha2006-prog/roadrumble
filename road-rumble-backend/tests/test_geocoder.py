import io
import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlmodel import SQLModel, create_engine, Session
from sqlmodel.pool import StaticPool

from app.main import app, process_reverse_geocode
from app.database import get_session
from app.models import Pothole
from app.geocoder import NominatimGeocoder, GoogleGeocoder, get_geocoder

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


@pytest.mark.asyncio
async def test_nominatim_geocoder_cache():
    geocoder = NominatimGeocoder()
    cache_key = (12.9716, 77.5946)
    geocoder._cache[cache_key] = "100 Feet Rd, Indiranagar, Bengaluru"

    res = await geocoder.reverse_geocode(12.9716, 77.5946)
    assert res == "100 Feet Rd, Indiranagar, Bengaluru"


@pytest.mark.asyncio
async def test_geocoder_failure_resilience():
    geocoder = NominatimGeocoder()
    with patch("httpx.AsyncClient.get", side_effect=Exception("Network error")):
        res = await geocoder.reverse_geocode(0.0, 0.0)
        assert res is None


def test_pluggable_geocoder_factory(monkeypatch):
    monkeypatch.setenv("GEOCODER", "nominatim")
    g1 = get_geocoder()
    assert isinstance(g1, NominatimGeocoder)

    monkeypatch.setenv("GEOCODER", "google")
    g2 = get_geocoder()
    assert isinstance(g2, GoogleGeocoder)


@pytest.mark.asyncio
async def test_process_reverse_geocode_background(session: Session):
    p = Pothole(
        lat=12.9716,
        lng=77.5946,
        confidence=0.90,
        image_path="uploads/1.jpg",
        road_name=None,
    )
    session.add(p)
    session.commit()
    session.refresh(p)

    mock_geocoder = AsyncMock()
    mock_geocoder.reverse_geocode.return_value = "MG Road, Bengaluru"

    with patch("app.main.get_geocoder", return_value=mock_geocoder), patch(
        "app.main.engine", test_engine
    ):
        await process_reverse_geocode(p.id, 12.9716, 77.5946)

    # Re-fetch pothole to verify road_name was updated
    session.refresh(p)
    assert p.road_name == "MG Road, Bengaluru"
