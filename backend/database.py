"""Async SQLAlchemy engine and session factory for The Cortex backend.

Reads DATABASE_URL from the environment.  The default matches the Dagster
backend (invincible-agent) so both services share the same bpmn_catalog table.
"""

import logging
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = logging.getLogger("cortex.db")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://iagent:iagent@localhost:5432/iagent",
)

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=5, max_overflow=10)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    """FastAPI dependency — yields an AsyncSession, auto-closes on exit."""
    async with async_session_factory() as session:
        yield session


async def init_db() -> None:
    """Verify DB connectivity at startup (does NOT create tables)."""
    try:
        async with engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        logger.info("Database connection verified (%s)", DATABASE_URL.split("@")[-1])
    except Exception as exc:
        logger.warning("Database unavailable — BPMN catalog endpoints will fail: %s", exc)
