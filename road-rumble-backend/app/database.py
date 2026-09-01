import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_FILE = "road_rumble.db"
DATABASE_URL = f"sqlite:///{DATABASE_FILE}"

# sqlite check_same_thread=False for multi-threaded async FastAPI context
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}, echo=True
)


def init_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
