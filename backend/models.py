"""Pydantic models for the ÑACURUTU SEGURIDAD panic system."""
from datetime import datetime, timezone
from typing import Optional, List, Literal
import uuid

from pydantic import BaseModel, Field, EmailStr, ConfigDict


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Organizations ----------
class OrganizationBase(BaseModel):
    name: str
    logo_url: Optional[str] = None  # Base64 data URL or http URL


class OrganizationCreate(OrganizationBase):
    pass


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None


class Organization(OrganizationBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=utc_now_iso)


# ---------- Users ----------
UserRole = Literal["super_admin", "admin", "client"]


class Permissions(BaseModel):
    create: bool = False
    edit: bool = False
    delete: bool = False
    view: bool = True


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = "client"
    organization_id: str
    permissions: Permissions = Field(default_factory=Permissions)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None
    organization_id: Optional[str] = None
    permissions: Optional[Permissions] = None
    password: Optional[str] = None


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: UserRole
    organization_id: Optional[str] = None
    permissions: Permissions = Field(default_factory=Permissions)
    created_at: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Alerts ----------
AlertType = Literal["silent", "normal"]
AlertStatus = Literal["pending", "in_process", "completed"]


class GeoLocation(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float]  # [lng, lat]


class AlertCreate(BaseModel):
    type: AlertType
    message: Optional[str] = None
    image_url: Optional[str] = None  # base64 data URL
    audio_url: Optional[str] = None  # base64 data URL
    location: Optional[GeoLocation] = None


class AlertStatusUpdate(BaseModel):
    status: AlertStatus
    note: Optional[str] = None


class AlertHistoryEntry(BaseModel):
    status: AlertStatus
    changed_by: str  # user id
    changed_by_name: Optional[str] = None
    changed_at: str = Field(default_factory=utc_now_iso)
    note: Optional[str] = None


class Alert(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    organization_id: str
    organization_name: Optional[str] = None
    type: AlertType
    status: AlertStatus = "pending"
    message: Optional[str] = None
    image_url: Optional[str] = None
    audio_url: Optional[str] = None
    location: Optional[GeoLocation] = None
    timestamp: str = Field(default_factory=utc_now_iso)
    history: List[AlertHistoryEntry] = Field(default_factory=list)
