import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

load_dotenv()

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        raw_url = os.environ["DATABASE_URL"]
        async_url = raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        _engine = create_async_engine(async_url, pool_size=10, max_overflow=5)
    return _engine


@asynccontextmanager
async def get_session():
    async with AsyncSession(get_engine(), expire_on_commit=False) as session:
        yield session