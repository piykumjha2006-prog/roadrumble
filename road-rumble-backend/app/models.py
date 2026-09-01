from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Pothole(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lat: float
    lng: float
    timestamp: datetime = Field(default_factory=get_utc_now)
    confidence: float
    road_name: Optional[str] = Field(default=None, nullable=True)
    image_path: str
    hit_count: int = Field(default=1)
    last_seen: datetime = Field(default_factory=get_utc_now)
    complaint_status: str = Field(default="none")
    ward_number: Optional[str] = Field(default=None, nullable=True)
    contractor_info: Optional[str] = Field(default=None, nullable=True)
