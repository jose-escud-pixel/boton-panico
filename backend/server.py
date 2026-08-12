"""ÑACURUTU SEGURIDAD – Main FastAPI + Socket.IO server."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import socketio
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, Body, UploadFile, File
from fastapi.responses import FileResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from audit import write_audit
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user_from_db,
)
from models import (
    OrganizationCreate,
    OrganizationUpdate,
    UserCreate,
    UserUpdate,
    LoginRequest,
    ChangePasswordRequest,
    DeviceBind,
    AlertCreate,
    AlertStatusUpdate,
    Permissions,
)
from push import (
    ensure_vapid_keys,
    get_vapid_public_key,
    send_push_to_admins,
    build_subscription_doc,
    build_fcm_token_doc,
)
from seed import seed_initial_data

# ---------- Logging ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("nacurutu")
UPLOAD_MAX_IMAGE_BYTES = 50 * 1024 * 1024  # 50MB
UPLOAD_DIR = ROOT_DIR / "uploads" / "alerts"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ONLINE_USERS = {}  # user_id -> dict(info)
SID_TO_USER = {}   # sid -> user_id

# ---------- MongoDB ----------
mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

# ---------- Socket.IO ----------
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ, auth):
    token = None
    if auth and isinstance(auth, dict):
        token = auth.get("token")
    if not token:
        logger.info(f"Socket {sid} connected without auth")
        await sio.disconnect(sid)
        return False
    try:
        payload = decode_token(token)
    except HTTPException:
        await sio.disconnect(sid)
        return False
    role = payload.get("role")
    org_id = payload.get("organization_id")
    user_id = payload.get("sub")
    # Join organization room for admins; super_admin joins all
    if role == "super_admin":
        await sio.enter_room(sid, "super_admin")
        await sio.enter_room(sid, "admins")
    elif role == "admin":
        await sio.enter_room(sid, "admins")
        if org_id:
            await sio.enter_room(sid, f"org:{org_id}")
    else:
        if org_id:
            await sio.enter_room(sid, f"org:{org_id}")
    db_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0}) if user_id else None
    now = datetime.now(timezone.utc).isoformat()
    if user_id:
        ONLINE_USERS[user_id] = {
            "user_id": user_id,
            "sid": sid,
            "connected_at": now,
            "last_seen_at": now,
            "role": role,
            "organization_id": org_id,
            "name": (db_user or {}).get("name"),
            "email": (db_user or {}).get("email"),
            "phone": (db_user or {}).get("phone"),
        }
        SID_TO_USER[sid] = user_id
    logger.info(f"Socket {sid} connected as {role} org={org_id}")
    return True


@sio.event
async def disconnect(sid):
    uid = SID_TO_USER.pop(sid, None)
    if uid:
        info = ONLINE_USERS.get(uid)
        if info and info.get("sid") == sid:
            ONLINE_USERS.pop(uid, None)
    logger.info(f"Socket {sid} disconnected")


# ---------- FastAPI ----------
app = FastAPI(title="ÑACURUTU SEGURIDAD API")
api = APIRouter(prefix="/api")


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True, sparse=True)
    await db.organizations.create_index("name")
    await db.alerts.create_index("organization_id")
    await db.alerts.create_index("timestamp")
    await db.alerts.create_index([("organization_id", 1), ("archived", 1), ("status", 1), ("timestamp", -1)])
    await db.alerts.create_index([("user_id", 1), ("archived", 1), ("timestamp", -1)])
    await db.alerts.create_index([("type", 1), ("archived", 1), ("timestamp", -1)])
    await db.push_subscriptions.create_index("endpoint", unique=True)
    await db.push_subscriptions.create_index("user_id")
    await db.fcm_tokens.create_index("token", unique=True)
    await db.fcm_tokens.create_index("user_id")
    await db.audit_logs.create_index("ts")
    await db.audit_logs.create_index("organization_id")
    ensure_vapid_keys()
    # Inicializar Firebase de forma explícita al arrancar para ver errores de inmediato
    from push import _init_firebase
    if _init_firebase():
        logger.info("✅ Firebase OK — FCM listo para notificaciones nativas")
    else:
        logger.warning("⚠️ Firebase NO inicializado — FCM no enviará. Verifica backend/.firebase/service-account.json")
    await seed_initial_data(db)
    logger.info("Startup seeding complete")


@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()


# ---------- Auth dependency ----------
async def get_current_user(request: Request):
    return await get_current_user_from_db(db, request)


async def require_admin(user: dict = Depends(get_current_user)):
    if user["role"] not in ("super_admin", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def require_super_admin(user: dict = Depends(get_current_user)):
    if user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return user


def _has_permission(user: dict, module: str, action: str) -> bool:
    role = user.get("role")
    if role == "super_admin" or _is_owner(user):
        return True
    if role != "admin":
        return False
    p = user.get("permissions") or {}
    # Compatibilidad legacy: permisos planos aplican globalmente.
    if isinstance(p, dict) and action in p and isinstance(p.get(action), bool):
        return bool(p.get(action))
    module_perms = (p.get(module) or {}) if isinstance(p, dict) else {}
    return bool(module_perms.get(action))


def _client_permissions() -> dict:
    return {
        "dashboard": {"view": False, "create": False, "edit": False, "delete": False},
        "alerts": {"view": False, "create": False, "edit": False, "delete": False},
        "users": {"view": False, "create": False, "edit": False, "delete": False},
        "organizations": {"view": False, "create": False, "edit": False, "delete": False},
        "online_users": {"view": False, "create": False, "edit": False, "delete": False},
    }


def require_admin_permission(module: str, action: str):
    async def checker(user: dict = Depends(require_admin)):
        if not _has_permission(user, module, action):
            raise HTTPException(status_code=403, detail=f"Sin permiso: {module}.{action}")
        return user
    return checker


# ---------- Utils ----------
def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 12,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


def strip_sensitive(user_doc: dict) -> dict:
    user_doc.pop("_id", None)
    user_doc.pop("password_hash", None)
    return user_doc


def alert_summary(alert: dict) -> dict:
    """Return a lightweight alert shape for lists and socket events."""
    doc = dict(alert)
    doc.pop("_id", None)
    doc.pop("image_url", None)
    doc.pop("audio_url", None)
    doc.pop("history", None)
    doc["has_image"] = bool(alert.get("has_image") or alert.get("image_url"))
    doc["has_audio"] = bool(alert.get("has_audio") or alert.get("audio_url"))
    doc["history_count"] = len(alert.get("history") or [])
    return doc


# Cache de la versión requerida. Se invalida cada 30s para que un re-deploy
# sea detectado sin reiniciar el backend.
_version_cache = {"build": None, "ts": 0}


def _is_owner(user: dict) -> bool:
    """El usuario 'owner' es el super_admin cuyo email coincide con
    la variable de entorno SUPER_ADMIN_EMAIL o cuyo username coincide
    con SUPER_ADMIN_USERNAME. Este usuario tiene potestad
    sobre TODOS los demás usuarios (incluso otros super_admin), excepto
    sobre sí mismo (no puede eliminarse ni bajarse el rol).
    """
    owner_email = (os.environ.get("SUPER_ADMIN_EMAIL") or "").strip().lower()
    owner_username = (os.environ.get("SUPER_ADMIN_USERNAME") or "jose").strip().lower()
    user_email = (user.get("email") or "").strip().lower()
    user_username = (user.get("username") or "").strip().lower()
    return (owner_email and user_email == owner_email) or (
        owner_username and user_username == owner_username
    )


def _get_required_app_build() -> Optional[int]:
    """Lee el versionCode requerido desde version.json generado por
    build-android-apk.sh. Path configurable via env VERSION_JSON_PATH.
    Si el archivo no existe (dev/preview) retorna None → no se valida.
    """
    import json
    import os
    import time
    now = time.time()
    if now - _version_cache["ts"] < 30 and _version_cache["build"] is not None:
        return _version_cache["build"]
    path = os.environ.get("VERSION_JSON_PATH", "/var/www/boton-panico/downloads/version.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        build = int(data.get("versionCode", 0))
        if build > 0:
            _version_cache["build"] = build
            _version_cache["ts"] = now
            return build
    except (FileNotFoundError, json.JSONDecodeError, ValueError, OSError):
        return None
    return None


@api.get("/app/version")
async def app_version():
    """Endpoint público para que la app consulte la versión requerida.
    Útil para diagnóstico y para forzar chequeos desde el cliente.
    """
    build = _get_required_app_build()
    return {"versionCode": build, "enforced": build is not None}


@api.post("/app/device-bind")
async def device_bind(payload: DeviceBind, user: dict = Depends(get_current_user)):
    """Vincula (bind) un dispositivo a un usuario cliente.
    - Si el usuario NO tiene device_id → se guarda el del payload.
    - Si YA tiene device_id y coincide con el del payload → se actualiza info (modelo, build).
    - Si YA tiene device_id y es DIFERENTE → 423 Locked (reset requerido por admin).
    Admin y super_admin quedan exentos del lock.
    """
    if user.get("role") != "client":
        # Admins no se bloquean por device
        return {"ok": True, "skipped": True}

    saved = (user.get("device_id") or "").strip()
    incoming = payload.device_id.strip()
    now = datetime.now(timezone.utc).isoformat()

    if saved and saved != incoming:
        raise HTTPException(
            status_code=423,
            detail="Esta cuenta está vinculada a otro dispositivo. Contactá al administrador.",
        )

    update = {
        "device_id": incoming,
        "device_brand": payload.brand,
        "device_model": payload.model,
        "device_platform": payload.platform,
        "device_os_version": payload.os_version,
        "device_app_build": payload.app_build,
        "device_last_seen": now,
    }
    if not saved:
        # Primera vez que se bindea
        update["device_bound_at"] = now

    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True, "bound_at": update.get("device_bound_at")}


@api.post("/users/{user_id}/unbind-device")
async def unbind_device(user_id: str, user: dict = Depends(require_admin)):
    """Admin/Super Admin libera el device binding de un usuario (para que pueda
    loguearse desde un teléfono nuevo tras cambio de celular o similar)."""
    if not _has_permission(user, "users", "edit"):
        raise HTTPException(status_code=403, detail="Sin permiso: users.edit")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin" and target.get("organization_id") != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot unbind user from another org")
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {
            "device_id": "", "device_brand": "", "device_model": "",
            "device_platform": "", "device_os_version": "", "device_app_build": "",
            "device_bound_at": "", "device_last_seen": "",
        }},
    )
    return {"ok": True}


# ======================================================
# AUTH
# ======================================================
@api.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    # Acepta "identifier" (nuevo) o "email" (legacy). Busca en orden:
    # 1) username exacto (case-insensitive), 2) email exacto
    raw_id = (payload.identifier or payload.email or "").strip()
    if not raw_id:
        raise HTTPException(status_code=400, detail="Identificador requerido")
    identifier = raw_id.lower()

    user = None
    # Primero probamos username (no tiene '@')
    if "@" not in identifier:
        user = await db.users.find_one({"username": identifier})
    if not user:
        # Luego email exacto
        user = await db.users.find_one({"email": identifier})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await write_audit(
            db,
            action="auth.login_failed",
            actor_email=identifier,
            summary="Intento de login fallido",
            meta={"identifier": identifier},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # ------- Controles de acceso de cuenta -------
    # Estado activo/desactivado
    if user.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="Cuenta desactivada. Contactá al administrador.")

    # Ventana de acceso (clients con access_type != permanent)
    access_type = user.get("access_type", "permanent")
    if access_type != "permanent":
        today = datetime.now(timezone.utc).date().isoformat()
        start = user.get("access_start")
        end = user.get("access_end")
        if start and today < start:
            raise HTTPException(status_code=403, detail=f"Tu acceso comienza el {start}")
        if end and today > end:
            raise HTTPException(status_code=403, detail=f"Tu acceso expiró el {end}. Contactá al administrador.")

    # ------- Clientes: solo desde la app nativa -------
    # El frontend Capacitor envía el header X-App-Platform: native.
    # Cualquier otro valor (o ausencia) → bloqueado.
    if user.get("role") == "client":
        platform_header = request.headers.get("x-app-platform", "").lower()
        if platform_header != "native":
            raise HTTPException(
                status_code=403,
                detail="Acceso permitido sólo desde la app móvil ÑACURUTU Seguridad. Descargala e ingresá desde allí.",
            )

        # ------- Versión de la APK (solo informativo, no bloquea) -------
        # El check estricto fue deshabilitado a pedido del usuario: el banner
        # UpdateBanner sigue notificando al cliente cuando hay nueva versión,
        # pero el login ya no se bloquea por mismatch de build.
        # Si querés re-habilitar, descomentá el bloque:
        # required_build = _get_required_app_build()
        # if required_build is not None:
        #     try:
        #         app_build = int(request.headers.get("x-app-build", "0"))
        #     except (TypeError, ValueError):
        #         app_build = 0
        #     if app_build != required_build:
        #         raise HTTPException(status_code=426, detail="Versión desactualizada...")
        pass

        # ------- Device binding (1 teléfono por cliente) -------
        # Si el cliente ya tiene un device_id guardado, el del request debe coincidir.
        # Si no tiene ninguno guardado, se acepta cualquiera (se bindea en device-bind).
        incoming_device_id = (request.headers.get("x-device-id") or "").strip()
        saved_device_id = (user.get("device_id") or "").strip()
        if saved_device_id and incoming_device_id and saved_device_id != incoming_device_id:
            raise HTTPException(
                status_code=423,  # Locked
                detail=(
                    "Esta cuenta está vinculada a otro dispositivo. "
                    "Contactá al administrador para desvincularla."
                ),
            )

    access_token = create_access_token(
        user["id"], user.get("email") or user.get("username"), user["role"], user.get("organization_id")
    )
    refresh_token = create_refresh_token(user["id"])
    set_auth_cookies(response, access_token, refresh_token)
    if user["role"] in ("admin", "super_admin"):
        await write_audit(
            db,
            action="auth.login",
            actor_id=user["id"],
            actor_email=user.get("email"),
            actor_name=user.get("name"),
            organization_id=user.get("organization_id"),
            summary=f"Inicio de sesión ({user['role']})",
            meta={"role": user["role"]},
        )
    public = strip_sensitive(user)
    public["is_owner"] = _is_owner(public)
    return {
        "user": public,
        "access_token": access_token,
        # Se retorna también para clientes nativos que no dependen de cookies.
        "refresh_token": refresh_token,
    }


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    # Añadimos un flag `is_owner` para que el frontend pueda mostrar/ocultar
    # controles que sólo el dueño de la instalación puede ejecutar.
    user = dict(user)
    user["is_owner"] = _is_owner(user)
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.post("/auth/refresh")
async def refresh(
    request: Request,
    response: Response,
    payload: Optional[dict] = Body(None),
):
    token = request.cookies.get("refresh_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        token = (payload or {}).get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token(
        user["id"], user.get("email") or user.get("username"), user["role"], user.get("organization_id")
    )
    new_refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access_token, new_refresh)
    public = strip_sensitive(dict(user))
    public["is_owner"] = _is_owner(public)
    return {
        "ok": True,
        "user": public,
        "access_token": access_token,
        "refresh_token": new_refresh,
    }


@api.post("/auth/change-password")
async def change_password(
    payload: ChangePasswordRequest, user: dict = Depends(get_current_user)
):
    """El usuario autenticado cambia su propia contraseña.
    Requiere current_password. new_password mínimo 6 caracteres (validado en el schema)."""
    # Traer el hash actual desde DB (get_current_user no lo incluye)
    db_user = await db.users.find_one({"id": user["id"]})
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not verify_password(payload.current_password, db_user["password_hash"]):
        raise HTTPException(status_code=401, detail="Contraseña actual incorrecta")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="La nueva contraseña debe ser distinta de la actual")
    new_hash = hash_password(payload.new_password)
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password_hash": new_hash}}
    )
    return {"ok": True}


# ======================================================
# ORGANIZATIONS
# ======================================================
@api.get("/organizations")
async def list_orgs(user: dict = Depends(get_current_user)):
    if user["role"] == "admin" and not _has_permission(user, "organizations", "view"):
        raise HTTPException(status_code=403, detail="Sin permiso: organizations.view")
    if user["role"] == "super_admin":
        orgs = await db.organizations.find({}, {"_id": 0}).to_list(1000)
    else:
        orgs = await db.organizations.find(
            {"id": user.get("organization_id")}, {"_id": 0}
        ).to_list(1000)
    return orgs


@api.post("/organizations")
async def create_org(payload: OrganizationCreate, user: dict = Depends(require_super_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "logo_url": payload.logo_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.organizations.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api.put("/organizations/{org_id}")
async def update_org(
    org_id: str, payload: OrganizationUpdate, user: dict = Depends(require_admin)
):
    if user["role"] == "admin" and not _has_permission(user, "organizations", "edit"):
        raise HTTPException(status_code=403, detail="Sin permiso: organizations.edit")
    if user["role"] == "admin" and user.get("organization_id") != org_id:
        raise HTTPException(status_code=403, detail="Cannot edit another organization")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.organizations.update_one({"id": org_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    return org


@api.delete("/organizations/{org_id}")
async def delete_org(org_id: str, user: dict = Depends(require_super_admin)):
    res = await db.organizations.delete_one({"id": org_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"ok": True}


# ======================================================
# USERS
# ======================================================
@api.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    if not _has_permission(user, "users", "view"):
        raise HTTPException(status_code=403, detail="Sin permiso: users.view")
    if user["role"] == "super_admin":
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    else:
        users = await db.users.find(
            {"organization_id": user.get("organization_id")},
            {"_id": 0, "password_hash": 0},
        ).to_list(1000)
    return users


@api.get("/users/online")
async def list_online_users(user: dict = Depends(require_admin)):
    if not _has_permission(user, "online_users", "view"):
        raise HTTPException(status_code=403, detail="Sin permiso: online_users.view")

    if user["role"] == "super_admin":
        base_query = {}
    else:
        base_query = {"organization_id": user.get("organization_id")}

    users = await db.users.find(base_query, {"_id": 0, "password_hash": 0}).to_list(2000)
    org_ids = [u.get("organization_id") for u in users if u.get("organization_id")]
    org_docs = await db.organizations.find({"id": {"$in": org_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)
    org_map = {o["id"]: o.get("name") for o in org_docs}
    now_iso = datetime.now(timezone.utc).isoformat()
    out = []
    for u in users:
        online = ONLINE_USERS.get(u["id"])
        item = dict(u)
        item["organization_name"] = org_map.get(u.get("organization_id"))
        item["is_online"] = bool(online)
        item["online_connected_at"] = online.get("connected_at") if online else None
        item["online_last_seen_at"] = online.get("last_seen_at") if online else None
        item["snapshot_at"] = now_iso
        out.append(item)
    return out


@api.post("/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_admin)):
    if not _has_permission(user, "users", "create"):
        raise HTTPException(status_code=403, detail="Sin permiso: users.create")
    email = payload.email.lower() if payload.email else None
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    # Username obligatorio y único
    username = (payload.username or "").strip().lower()
    if not username:
        raise HTTPException(status_code=400, detail="Nombre de usuario requerido")
    if await db.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Nombre de usuario ya existe")
    if user["role"] == "admin" and payload.organization_id != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot assign to another org")
    # Only super_admin can create super_admin or admin
    if payload.role != "client" and user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can create admin users")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "username": username,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "first_name": payload.first_name,
        "last_name": payload.last_name,
        "phone": payload.phone,
        "role": payload.role,
        "organization_id": payload.organization_id,
        "permissions": payload.permissions.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": payload.status,
        "access_type": payload.access_type,
        "access_start": payload.access_start,
        "access_end": payload.access_end,
        # Quién dio de alta al usuario (administrador autenticado en esta petición)
        "created_by_id": user.get("id"),
        "created_by_name": user.get("name"),
        "created_by_email": user.get("email"),
        "created_by_username": user.get("username"),
    }
    if payload.role == "client":
        doc["permissions"] = _client_permissions()
    await db.users.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


@api.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_admin)):
    if not _has_permission(user, "users", "edit"):
        raise HTTPException(status_code=403, detail="Sin permiso: users.edit")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin" and target.get("organization_id") != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot edit user from another org")

    # Role hierarchy for security checks
    ROLE_LEVEL = {"super_admin": 3, "admin": 2, "client": 1}
    current_level = ROLE_LEVEL.get(user["role"], 0)
    target_level = ROLE_LEVEL.get(target.get("role"), 0)
    is_owner = _is_owner(user)

    is_self = target["id"] == user["id"]
    data = payload.model_dump(exclude_unset=True)

    # 1) Nadie puede modificar su propio rol (evita auto-escalada o auto-degradación)
    if is_self and "role" in data and data["role"] is not None and data["role"] != target.get("role"):
        raise HTTPException(status_code=403, detail="No puedes modificar tu propio rol")

    # 2) Nadie puede editar a un usuario con rol igual o mayor (a menos que sea a sí mismo)
    #    EXCEPCIÓN: el owner (SUPER_ADMIN_EMAIL) puede editar a otros super_admin.
    if not is_self and target_level >= current_level and not is_owner:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar a un usuario con rol igual o superior")

    # 3) Al asignar un rol, no puede ser mayor que el rol del que edita.
    #    El owner puede asignar super_admin a otros.
    if "role" in data and data["role"] is not None:
        new_level = ROLE_LEVEL.get(data["role"], 0)
        if new_level > current_level:
            raise HTTPException(status_code=403, detail="No puedes asignar un rol superior al tuyo")
        if new_level >= current_level and not is_self and not is_owner:
            raise HTTPException(status_code=403, detail="No puedes promover a un usuario a tu mismo nivel o superior")

    # 4) Admin no puede mover un usuario a otra organización
    if user["role"] == "admin" and "organization_id" in data and data["organization_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot move user to another org")

    update = {}
    if "password" in data and data["password"]:
        update["password_hash"] = hash_password(data.pop("password"))
    if "permissions" in data and data["permissions"] is not None:
        update["permissions"] = data.pop("permissions")
    # Validar unicidad del username si cambia
    if "username" in data and data["username"] is not None:
        new_username = data["username"].strip().lower() if data["username"] else None
        if new_username:
            conflict = await db.users.find_one({"username": new_username, "id": {"$ne": user_id}})
            if conflict:
                raise HTTPException(status_code=400, detail="Nombre de usuario ya existe")
        data["username"] = new_username
    for k, v in data.items():
        if v is not None:
            update[k] = v
    # Cliente: no se guardan permisos administrativos.
    final_role = update.get("role", target.get("role"))
    if final_role == "client":
        update["permissions"] = _client_permissions()
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": user_id}, {"$set": update})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    if not _has_permission(user, "users", "delete"):
        raise HTTPException(status_code=403, detail="Sin permiso: users.delete")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin" and target.get("organization_id") != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot delete user from another org")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    # No eliminar usuarios con rol igual o superior al propio
    # EXCEPCIÓN: el owner (SUPER_ADMIN_EMAIL) puede eliminar a cualquiera.
    ROLE_LEVEL = {"super_admin": 3, "admin": 2, "client": 1}
    if not _is_owner(user):
        if ROLE_LEVEL.get(target.get("role"), 0) >= ROLE_LEVEL.get(user["role"], 0):
            raise HTTPException(status_code=403, detail="No puedes eliminar a un usuario con rol igual o superior")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ======================================================
# ALERTS
# ======================================================
@api.post("/alerts")
async def create_alert(payload: AlertCreate, user: dict = Depends(get_current_user)):
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0})
    alert = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_email": user.get("email"),
        "user_phone": user.get("phone"),
        "organization_id": org_id,
        "organization_name": org["name"] if org else None,
        "type": payload.type,
        "status": "pending",
        "message": payload.message,
        "image_url": payload.image_url,
        "audio_url": payload.audio_url,
        "has_image": bool(payload.image_url),
        "has_audio": bool(payload.audio_url),
        "location": payload.location.model_dump() if payload.location else None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "history": [
            {
                "status": "pending",
                "changed_by": user["id"],
                "changed_by_name": user.get("name"),
                "changed_at": datetime.now(timezone.utc).isoformat(),
                "note": "Alert created",
            }
        ],
    }
    await db.alerts.insert_one(dict(alert))
    alert.pop("_id", None)
    await write_audit(
        db,
        action="alert.created",
        actor_id=user["id"],
        actor_email=user.get("email"),
        actor_name=user.get("name"),
        organization_id=org_id,
        entity_type="alert",
        entity_id=alert["id"],
        summary=f"Nueva alerta ({payload.type})",
        meta={"type": payload.type},
    )
    # Emit a lightweight event so media payloads never block the admin panel.
    summary = alert_summary(alert)
    await sio.emit("alert:new", summary, room="admins")
    await sio.emit("alert:new", summary, room=f"org:{org_id}")
    # Send web push to admins (works even with browser closed)
    try:
        await send_push_to_admins(db, alert)
    except Exception as e:
        logger.warning(f"send_push_to_admins failed: {e}")
    return alert


@api.post("/uploads/image")
async def upload_alert_image(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    _ = user  # autenticación requerida
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes")

    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    stored_name = f"{uuid.uuid4()}{ext}"
    stored_path = UPLOAD_DIR / stored_name

    size = 0
    try:
        with stored_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > UPLOAD_MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail="Imagen demasiado grande (máx 50MB)")
                out.write(chunk)
    except HTTPException:
        stored_path.unlink(missing_ok=True)
        raise
    except Exception as e:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar la imagen: {e}")
    finally:
        await file.close()

    base_path = os.environ.get("PUBLIC_BASE_PATH", "/boton-panico").rstrip("/")
    if not base_path.startswith("/"):
        base_path = "/" + base_path
    return {"url": f"{base_path}/api/uploads/alerts/{stored_name}", "size": size}


@api.post("/uploads/image-base64")
async def upload_alert_image_base64(
    payload: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Endpoint alternativo para apps nativas donde CapacitorHttp no maneja
    FormData binario correctamente. Recibe la imagen como data URL en base64
    y la guarda igual que el endpoint multipart normal."""
    import base64 as _b64
    _ = user  # autenticación requerida

    data_url: str = payload.get("data", "")
    filename: str = payload.get("filename", "foto-alerta.jpg")

    if not data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes (data URL)")

    # Separar encabezado de datos: "data:image/jpeg;base64,<datos>"
    _, _, encoded = data_url.partition(",")
    if not encoded:
        raise HTTPException(status_code=400, detail="Formato de data URL inválido")

    try:
        image_bytes = _b64.b64decode(encoded)
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo decodificar la imagen base64")

    if len(image_bytes) > UPLOAD_MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Imagen demasiado grande (máx 50MB)")

    ext = Path(filename).suffix.lower() or ".jpg"
    stored_name = f"{uuid.uuid4()}{ext}"
    stored_path = UPLOAD_DIR / stored_name

    try:
        stored_path.write_bytes(image_bytes)
    except Exception as e:
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"No se pudo guardar la imagen: {e}")

    base_path = os.environ.get("PUBLIC_BASE_PATH", "/boton-panico").rstrip("/")
    if not base_path.startswith("/"):
        base_path = "/" + base_path
    return {"url": f"{base_path}/api/uploads/alerts/{stored_name}", "size": len(image_bytes)}


@api.get("/uploads/alerts/{filename}")
async def get_uploaded_alert_image(filename: str):
    safe = Path(filename).name
    path = UPLOAD_DIR / safe
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    return FileResponse(str(path))


@api.get("/alerts")
async def list_alerts(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    type: Optional[str] = None,
    organization_id: Optional[str] = None,
    user_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    archived: Optional[bool] = None,
    limit: int = Query(150, ge=1, le=500),
    include_media: bool = False,
):
    if user["role"] == "admin" and not _has_permission(user, "alerts", "view"):
        raise HTTPException(status_code=403, detail="Sin permiso: alerts.view")
    q = {}
    if user["role"] == "super_admin":
        if organization_id:
            q["organization_id"] = organization_id
    elif user["role"] == "admin":
        q["organization_id"] = user.get("organization_id")
    else:
        q["user_id"] = user["id"]
    if status:
        q["status"] = status
    if type:
        q["type"] = type
    if user_id:
        q["user_id"] = user_id
    # Por defecto no se muestran alertas archivadas. Para verlas
    # en el historial debe pasarse archived=true explícitamente.
    if archived is True:
        q["archived"] = True
    elif archived is False:
        q["archived"] = {"$ne": True}
    else:
        q["archived"] = {"$ne": True}
    if date_from or date_to:
        time_q = {}
        if date_from:
            time_q["$gte"] = date_from
        if date_to:
            time_q["$lte"] = date_to
        q["timestamp"] = time_q
    projection = {"_id": 0}
    if not include_media:
        projection.update({"image_url": 0, "audio_url": 0, "history": 0})
    alerts = await db.alerts.find(q, projection).sort("timestamp", -1).to_list(limit)
    if not include_media:
        alerts = [alert_summary(a) for a in alerts]
    return alerts


@api.get("/audit")
async def list_audit_logs(
    user: dict = Depends(require_admin),
    limit: int = Query(150, ge=1, le=500),
    skip: int = Query(0, ge=0),
    action: Optional[str] = None,
):
    clauses = []
    if user["role"] == "admin":
        clauses.append({"organization_id": user.get("organization_id")})
        clauses.append({"action": {"$ne": "auth.login_failed"}})
    if action:
        clauses.append({"action": action})
    query = {"$and": clauses} if len(clauses) > 1 else (clauses[0] if clauses else {})
    cursor = db.audit_logs.find(query, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    return await cursor.to_list(length=limit)


@api.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, user: dict = Depends(get_current_user)):
    alert = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if user["role"] == "admin" and alert["organization_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    if user["role"] == "client" and alert["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    return alert


@api.patch("/alerts/{alert_id}/status")
async def update_alert_status(
    alert_id: str, payload: AlertStatusUpdate, user: dict = Depends(require_admin)
):
    if not _has_permission(user, "alerts", "edit"):
        raise HTTPException(status_code=403, detail="Sin permiso: alerts.edit")
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if user["role"] == "admin" and alert["organization_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    history_entry = {
        "status": payload.status,
        "changed_by": user["id"],
        "changed_by_name": user.get("name"),
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "note": payload.note,
    }
    prev_status = alert.get("status")
    await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": payload.status}, "$push": {"history": history_entry}},
    )
    updated = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    await write_audit(
        db,
        action="alert.status_changed",
        actor_id=user["id"],
        actor_email=user.get("email"),
        actor_name=user.get("name"),
        organization_id=alert.get("organization_id"),
        entity_type="alert",
        entity_id=alert_id,
        summary=f"Alerta {payload.status}",
        meta={"from": prev_status, "to": payload.status, "note": payload.note},
    )
    summary = alert_summary(updated)
    await sio.emit("alert:updated", summary, room="admins")
    await sio.emit("alert:updated", summary, room=f"org:{alert['organization_id']}")
    return updated


@api.post("/alerts/archive")
async def archive_alerts(
    user: dict = Depends(require_admin),
    only_completed: bool = True,
):
    """Archiva alertas (soft delete). Por defecto solo las completadas.
    Admin solo archiva las de su organización. Super Admin las de todas.
    Las alertas archivadas no aparecen en el listado normal pero sí en el
    historial (pasando archived=true en GET /alerts).
    """
    if not _has_permission(user, "alerts", "delete"):
        raise HTTPException(status_code=403, detail="Sin permiso: alerts.delete")
    q = {"archived": {"$ne": True}}
    if only_completed:
        q["status"] = "completed"
    if user["role"] == "admin":
        q["organization_id"] = user.get("organization_id")

    archived_at = datetime.now(timezone.utc).isoformat()
    result = await db.alerts.update_many(
        q,
        {"$set": {
            "archived": True,
            "archived_at": archived_at,
            "archived_by": user["id"],
            "archived_by_name": user.get("name"),
        }},
    )
    # Notificar admins para que limpien sus dashboards
    await sio.emit("alerts:archived", {"count": result.modified_count, "archived_at": archived_at}, room="admins")
    return {"archived_count": result.modified_count}


# ======================================================
# DASHBOARD
# ======================================================
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require_admin)):
    if not _has_permission(user, "dashboard", "view"):
        raise HTTPException(status_code=403, detail="Sin permiso: dashboard.view")
    base_q = {}
    if user["role"] == "admin":
        base_q["organization_id"] = user.get("organization_id")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    from datetime import timedelta
    week_start_date = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_start_date = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    total = await db.alerts.count_documents(base_q)
    today_count = await db.alerts.count_documents({**base_q, "timestamp": {"$gte": today_start}})
    week_count = await db.alerts.count_documents({**base_q, "timestamp": {"$gte": week_start_date}})
    month_count = await db.alerts.count_documents({**base_q, "timestamp": {"$gte": month_start_date}})
    # by type (para dashboard con nuevas categorías + legacy)
    type_counts = {}
    for t in ["panic", "fire", "medical", "on_way", "here", "silent", "normal"]:
        c = await db.alerts.count_documents({**base_q, "type": t})
        if c > 0:
            type_counts[t] = c

    silent = await db.alerts.count_documents({**base_q, "type": "silent"})
    normal = await db.alerts.count_documents({**base_q, "type": "normal"})
    pending = await db.alerts.count_documents({**base_q, "status": "pending"})
    in_process = await db.alerts.count_documents({**base_q, "status": "in_process"})
    completed = await db.alerts.count_documents({**base_q, "status": "completed"})

    # by organization (only for super_admin)
    by_org = []
    if user["role"] == "super_admin":
        pipeline = [
            {"$group": {"_id": {"id": "$organization_id", "name": "$organization_name"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        agg = await db.alerts.aggregate(pipeline).to_list(100)
        by_org = [
            {"organization_id": a["_id"]["id"], "organization_name": a["_id"].get("name"), "count": a["count"]}
            for a in agg
        ]

    # daily last 7 days
    daily = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await db.alerts.count_documents({
            **base_q,
            "timestamp": {"$gte": day_start.isoformat(), "$lt": day_end.isoformat()},
        })
        daily.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    return {
        "total": total,
        "today": today_count,
        "week": week_count,
        "month": month_count,
        "by_type": {"silent": silent, "normal": normal},
        "type_counts": type_counts,
        "by_status": {"pending": pending, "in_process": in_process, "completed": completed},
        "by_organization": by_org,
        "daily": daily,
    }


# ======================================================
# WEB PUSH (VAPID)
# ======================================================
@api.get("/push/vapid-public-key")
async def push_vapid_public():
    return {"publicKey": get_vapid_public_key()}


@api.post("/push/subscribe")
async def push_subscribe(payload: dict, user: dict = Depends(get_current_user)):
    endpoint = payload.get("endpoint")
    keys = payload.get("keys")
    if not endpoint or not keys or "p256dh" not in keys or "auth" not in keys:
        raise HTTPException(status_code=400, detail="Invalid subscription payload")
    doc = build_subscription_doc(user, endpoint, keys)
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.post("/push/unsubscribe")
async def push_unsubscribe(payload: dict, user: dict = Depends(get_current_user)):
    endpoint = payload.get("endpoint")
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint required")
    await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
    return {"ok": True}


@api.post("/push/fcm-register")
async def push_fcm_register(payload: dict, user: dict = Depends(get_current_user)):
    """Register FCM token from native app (Android/iOS)."""
    token = payload.get("token")
    platform = payload.get("platform", "android")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    doc = build_fcm_token_doc(user, token, platform)
    await db.fcm_tokens.update_one(
        {"token": token},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.post("/push/fcm-unregister")
async def push_fcm_unregister(payload: dict, user: dict = Depends(get_current_user)):
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    await db.fcm_tokens.delete_one({"token": token, "user_id": user["id"]})
    return {"ok": True}


# ---------- CORS ----------
app.include_router(api)

# Si CORS_ORIGINS contiene "*" usamos regex para hacer eco del Origin header.
# Necesario porque allow_origins=["*"] + allow_credentials=True es una combinación
# que los navegadores rechazan (la respuesta debe llevar el origin exacto, no "*").
# El admin APK sirve desde https://localhost y necesita credenciales para cookies.
_cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
_origins_list = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
if "*" in _origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origin_regex=".*",
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=_origins_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Wrap FastAPI with Socket.IO ASGI app (mounted at /api/socket.io so it passes through k8s ingress)
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/api/socket.io")

# Supervisor points to `server:app` — so we need `app` to be the ASGI app with socket support.
# Reassign `app` to the ASGI wrapper so supervisor picks it up.
# Keep the original FastAPI instance internally accessible via `asgi_app.other_asgi_app` if needed.
app = asgi_app  # type: ignore
