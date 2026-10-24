from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from blackbox.core.config import settings

# Ensure the SQLite data directory exists before the engine is created.
_url = settings.database_url
if _url.startswith("sqlite"):
    _path_part = _url.split("///", 1)[-1]
    if _path_part and not _path_part.startswith(":"):
        Path(_path_part).parent.mkdir(parents=True, exist_ok=True)

engine = create_async_engine(_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
