import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import PublicBase


class UserRole(str, enum.Enum):
    PLATFORM_ADMIN = "platform_admin"
    ADMINISTRATOR = "administrator"
    SUPERVISOR = "supervisor"
    OPERATOR = "operator"


class User(PublicBase):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    # Nullable: OTP-only users (field workers) may not have a password
    hashed_password: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.OPERATOR)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Enterprise link
    enterprise_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("enterprises.id")
    )

    # Granular RBAC: per-user overrides on top of role defaults.
    # JSON dict of {"permission.name": true/false}.
    # null = use role defaults only.
    custom_permissions: Mapped[dict | None] = mapped_column(JSON, default=None)

    # Operator scope: which packhouse IDs this user can access.
    # null = all packhouses (admins/supervisors).
    # ["uuid1","uuid2"] = only these packhouses (operators).
    assigned_packhouses: Mapped[list | None] = mapped_column(JSON, default=None)

    # Language preference (ISO 639-1: en, fr, pt, es)
    preferred_language: Mapped[str] = mapped_column(String(5), default="en", server_default="en")

    # Tracks who created this account
    created_by: Mapped[str | None] = mapped_column(String(36))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    enterprise = relationship("Enterprise", back_populates="users")
