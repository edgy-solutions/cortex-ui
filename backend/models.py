"""SQLAlchemy models for The Cortex backend."""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    pass


class BpmnCatalog(Base):
    """Persisted BPMN workflow definitions."""

    __tablename__ = "bpmn_catalog"

    workflow_id: Mapped[str] = mapped_column(
        String(64), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    bpmn_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<BpmnCatalog workflow_id={self.workflow_id!r} name={self.name!r}>"
