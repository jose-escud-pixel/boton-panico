"""Pydantic models for the ÑACURUTU SEGURIDAD panic system."""
from datetime import datetime, timezone
from typing import Optional, List, Literal
import uuid

from pydantic import BaseModel, Field, EmailStr, ConfigDict, model_validator


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
UserStatus = Literal["active", "disabled"]
AccessType = Literal["permanent", "annual", "custom"]


class CrudPermissions(BaseModel):
    view: bool = False
    create: bool = False
    edit: bool = False
    delete: bool = False


class Permissions(BaseModel):
    """Permisos granulares por módulo.

    Compatibilidad legacy:
    - Si llega payload viejo con {view,create,edit,delete} a nivel raíz,
      se replica en todos los módulos.
    """
    dashboard: CrudPermissions = Field(default_factory=lambda: CrudPermissions(view=True))
    alerts: CrudPermissions = Field(default_factory=lambda: CrudPermissions(view=True))
    users: CrudPermissions = Field(default_factory=CrudPermissions)
    organizations: CrudPermissions = Field(default_factory=CrudPermissions)
    online_users: CrudPermissions = Field(default_factory=CrudPermissions)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_flat_permissions(cls, value):
        if not isinstance(value, dict):
            return value
        has_modules = any(
            k in value for k in ("dashboard", "alerts", "users", "organizations", "online_users")
        )
        if has_modules:
            return value
        if any(k in value for k in ("view", "create", "edit", "delete")):
            flat = {
                "view": bool(value.get("view", False)),
                "create": bool(value.get("create", False)),
                "edit": bool(value.get("edit", False)),
                "delete": bool(value.get("delete", False)),
            }
            return {
                "dashboard": {"view": flat["view"], "create": False, "edit": False, "delete": False},
                "alerts": dict(flat),
                "users": dict(flat),
                "organizations": dict(flat),
                "online_users": {"view": flat["view"], "create": False, "edit": False, "delete": False},
            }
        return value


class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    password: str
    name: str
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole = "client"
    organization_id: str
    permissions: Permissions = Field(default_factory=Permissions)
    status: UserStatus = "active"
    access_type: AccessType = "permanent"
    access_start: Optional[str] = None  # ISO date "2026-01-01"
    access_end: Optional[str] = None    # ISO date "2026-12-31"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    organization_id: Optional[str] = None
    permissions: Optional[Permissions] = None
    password: Optional[str] = None
    status: Optional[UserStatus] = None
    access_type: Optional[AccessType] = None
    access_start: Optional[str] = None
    access_end: Optional[str] = None
    # Device management (super_admin/admin puede desvincular forzando null)
    device_id: Optional[str] = None
    device_brand: Optional[str] = None
    device_model: Optional[str] = None
    device_platform: Optional[str] = None
    device_os_version: Optional[str] = None
    device_app_build: Optional[int] = None


class DeviceBind(BaseModel):
    """Info del dispositivo enviada por Capacitor al primer login exitoso."""
    device_id: str  # Capacitor Device.identifier
    brand: Optional[str] = None
    model: Optional[str] = None
    platform: Optional[str] = None  # "android" | "ios"
    os_version: Optional[str] = None
    app_build: Optional[int] = None


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: Optional[EmailStr] = None
    name: str
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: UserRole
    organization_id: Optional[str] = None
    permissions: Permissions = Field(default_factory=Permissions)
    created_at: str
    created_by_id: Optional[str] = None
    created_by_name: Optional[str] = None
    created_by_email: Optional[str] = None
    created_by_username: Optional[str] = None
    status: UserStatus = "active"
    access_type: AccessType = "permanent"
    access_start: Optional[str] = None
    access_end: Optional[str] = None
    # Device info (auto-captured)
    device_id: Optional[str] = None
    device_brand: Optional[str] = None
    device_model: Optional[str] = None
    device_platform: Optional[str] = None
    device_os_version: Optional[str] = None
    device_app_build: Optional[int] = None
    device_bound_at: Optional[str] = None
    device_last_seen: Optional[str] = None


class LoginRequest(BaseModel):
    # "identifier" acepta username o email. Se mantiene "email" como
    # alias legacy para no romper clientes viejos.
    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# ---------- Alerts ----------
# panic, fire, medical, on_way, here = nuevos tipos; silent, normal = legacy (compatibilidad)
AlertType = Literal["panic", "fire", "medical", "on_way", "here", "silent", "normal", "device_alarm"]
AlertStatus = Literal["pending", "in_process", "completed"]


class GeoLocation(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: List[float]  # [lng, lat]


class AlertCreate(BaseModel):
    type: AlertType
    message: Optional[str] = None
    image_url: Optional[str] = None  # base64 data URL
    audio_url: Optional[str] = None  # base64 data URL
    location: GeoLocation  # REQUERIDA - toda alerta debe llevar ubicación


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
    user_phone: Optional[str] = None
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


# ---------- Tickets ----------
TicketStatus = Literal["open", "in_process", "resolved", "closed"]
TicketPriority = Literal["low", "medium", "high", "urgent"]
TicketCategory = Literal["app", "account", "technical", "other"]


class TicketCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10)
    category: TicketCategory = "other"
    priority: TicketPriority = "medium"


class TicketMessage(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


class TicketStatusUpdate(BaseModel):
    status: TicketStatus
    note: Optional[str] = None


# ---------- Devices (Hikvision / IP Cameras / Alarm Panels) ----------
DeviceType = Literal["nvr", "dvr", "ipcam", "panel_alarma"]
DeviceStatus = Literal["active", "inactive"]

# Tipos de evento Hikvision que se aceptan
HikvisionEventType = Literal[
    "VMD",            # Video Motion Detection
    "linedetection",  # Cruce de línea
    "fielddetection", # Intrusión en zona
    "IO",             # Entrada digital / PIR
    "videoloss",      # Pérdida de video
    "tamperdetection",# Tamper
]

AlarmProtocol = Literal["http_webhook", "adm_cid"]

# Severidad de eventos ADM-CID / SIA DC-09
# alarm   → crea alerta de emergencia en el sistema
# warning → crea alerta marcada como advertencia (no llama push)
# info    → solo emite evento vía Socket.IO, sin alerta en DB
# ignore  → descarta silenciosamente (test periódico, apertura/cierre, etc.)
EventSeverity = Literal["alarm", "warning", "info", "ignore"]


class EventRule(BaseModel):
    """Regla de enrutamiento de eventos Contact ID / SIA DC-09 por prefijo de código."""
    event_code_prefix: str = Field(min_length=1, max_length=4)
    # Prefijos Contact ID: "1"=alarmas, "2"=bypass, "3"=trouble, "4"=open/close, "6"=test
    severity: EventSeverity
    description: Optional[str] = None  # Etiqueta visible en UI

AlarmBrand = Literal[
    "hikvision_axpro",  # Hikvision AX Pro
    "ajax",             # Ajax Systems
    "dsc",              # DSC (Johnson Controls)
    "paradox",          # Paradox Security
    "bosch",            # Bosch Security
    "texecom",          # Texecom
    "honeywell",        # Honeywell / Resideo
    "napco",            # Napco Security
    "generic",          # Genérico / otro
]


class DeviceLocation(BaseModel):
    """Ubicación fija del dispositivo para insertar en alertas."""
    lat: float
    lng: float


class DeviceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    device_type: DeviceType = "ipcam"
    ip: Optional[str] = None           # IP local del dispositivo (referencia)
    channel: Optional[str] = None      # Canal o descripción (ej: "Canal 1 - Entrada")
    organization_id: str
    event_types: List[HikvisionEventType] = Field(default_factory=lambda: ["VMD", "linedetection", "fielddetection", "IO"])
    location: Optional[DeviceLocation] = None
    alarm_protocol: AlarmProtocol = "http_webhook"   # http_webhook o adm_cid
    alarm_brand: AlarmBrand = "generic"               # Marca del panel de alarma
    group_name: Optional[str] = None                  # Grupo visual (ej: "Edificio A", "Piso 3")
    notes: Optional[str] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    device_type: Optional[DeviceType] = None
    ip: Optional[str] = None
    channel: Optional[str] = None
    organization_id: Optional[str] = None
    event_types: Optional[List[HikvisionEventType]] = None
    location: Optional[DeviceLocation] = None
    status: Optional[DeviceStatus] = None
    alarm_protocol: Optional[AlarmProtocol] = None
    alarm_brand: Optional[AlarmBrand] = None
    group_name: Optional[str] = None
    notes: Optional[str] = None
    event_rules: Optional[List[EventRule]] = None     # Reglas de enrutamiento ADM-CID


class Device(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    token: str = Field(default_factory=lambda: str(uuid.uuid4()).replace("-", ""))  # Token webhook
    name: str
    device_type: DeviceType = "ipcam"
    ip: Optional[str] = None
    channel: Optional[str] = None
    organization_id: str
    organization_name: Optional[str] = None
    event_types: List[str] = Field(default_factory=list)
    location: Optional[DeviceLocation] = None
    status: DeviceStatus = "active"
    alarm_protocol: AlarmProtocol = "http_webhook"
    alarm_brand: AlarmBrand = "generic"
    alarm_account_code: Optional[str] = None  # Código ADM-CID de 4 chars hex (auto-generado)
    group_name: Optional[str] = None          # Grupo visual (ej: "Edificio A")
    event_rules: List[EventRule] = Field(default_factory=list)  # Reglas Contact ID → severidad
    notes: Optional[str] = None
    last_event_at: Optional[str] = None
    last_event_type: Optional[str] = None
    last_seen_at: Optional[str] = None        # Última vez que el panel envió cualquier mensaje
    created_at: str = Field(default_factory=utc_now_iso)
