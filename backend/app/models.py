from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field

class Pothole(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lat: float = Field(index=True)
    lng: float = Field(index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = Field(default=0.85)
    road_name: Optional[str] = Field(default=None)
    image_path: str = Field(default="")
    hit_count: int = Field(default=1)
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    complaint_status: str = Field(default="none") # "none" | "generated" | "submitted"

class PotholeResponse(SQLModel):
    id: int
    lat: float
    lng: float
    timestamp: str
    confidence: float
    road_name: Optional[str] = None
    image_url: str
    hit_count: int
    last_seen: str
    complaint_status: str

class ComplaintResponse(SQLModel):
    pdf_url: str
    mailto: str
    prefilled: dict
