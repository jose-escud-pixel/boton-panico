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
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

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
    logger.info(f"Socket {sid} connected as {role} org={org_id}")
    return True


@sio.event
async def disconnect(sid):
    logger.info(f"Socket {sid} disconnected")


# ---------- FastAPI ----------
app = FastAPI(title="ÑACURUTU SEGURIDAD API")
api = APIRouter(prefix="/api")


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.organizations.create_index("name")
    await db.alerts.create_index("organization_id")
    await db.alerts.create_index("timestamp")
    await db.push_subscriptions.create_index("endpoint", unique=True)
    await db.push_subscriptions.create_index("user_id")
    await db.fcm_tokens.create_index("token", unique=True)
    await db.fcm_tokens.create_index("user_id")
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


# ======================================================
# AUTH
# ======================================================
@api.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
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

    access_token = create_access_token(
        user["id"], user["email"], user["role"], user.get("organization_id")
    )
    refresh_token = create_refresh_token(user["id"])
    set_auth_cookies(response, access_token, refresh_token)
    return {"user": strip_sensitive(user), "access_token": access_token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token(
        user["id"], user["email"], user["role"], user.get("organization_id")
    )
    new_refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access_token, new_refresh)
    return {"ok": True}


# ======================================================
# ORGANIZATIONS
# ======================================================
@api.get("/organizations")
async def list_orgs(user: dict = Depends(get_current_user)):
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
    if user["role"] == "super_admin":
        users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    else:
        users = await db.users.find(
            {"organization_id": user.get("organization_id")},
            {"_id": 0, "password_hash": 0},
        ).to_list(1000)
    return users


@api.post("/users")
async def create_user(payload: UserCreate, user: dict = Depends(require_admin)):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already in use")
    if user["role"] == "admin" and payload.organization_id != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot assign to another org")
    # Only super_admin can create super_admin or admin
    if payload.role != "client" and user["role"] != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can create admin users")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "organization_id": payload.organization_id,
        "permissions": payload.permissions.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": payload.status,
        "access_type": payload.access_type,
        "access_start": payload.access_start,
        "access_end": payload.access_end,
    }
    await db.users.insert_one(dict(doc))
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


@api.put("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin" and target.get("organization_id") != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot edit user from another org")

    # Role hierarchy for security checks
    ROLE_LEVEL = {"super_admin": 3, "admin": 2, "client": 1}
    current_level = ROLE_LEVEL.get(user["role"], 0)
    target_level = ROLE_LEVEL.get(target.get("role"), 0)

    is_self = target["id"] == user["id"]
    data = payload.model_dump(exclude_unset=True)

    # 1) Nadie puede modificar su propio rol (evita auto-escalada o auto-degradación)
    if is_self and "role" in data and data["role"] is not None and data["role"] != target.get("role"):
        raise HTTPException(status_code=403, detail="No puedes modificar tu propio rol")

    # 2) Nadie puede editar a un usuario con rol igual o mayor (a menos que sea a sí mismo)
    if not is_self and target_level >= current_level:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar a un usuario con rol igual o superior")

    # 3) Al asignar un rol, no puede ser mayor que el rol del que edita
    if "role" in data and data["role"] is not None:
        new_level = ROLE_LEVEL.get(data["role"], 0)
        if new_level > current_level:
            raise HTTPException(status_code=403, detail="No puedes asignar un rol superior al tuyo")
        if new_level >= current_level and not is_self:
            raise HTTPException(status_code=403, detail="No puedes promover a un usuario a tu mismo nivel o superior")

    # 4) Admin no puede mover un usuario a otra organización
    if user["role"] == "admin" and "organization_id" in data and data["organization_id"] != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot move user to another org")

    update = {}
    if "password" in data and data["password"]:
        update["password_hash"] = hash_password(data.pop("password"))
    if "permissions" in data and data["permissions"] is not None:
        update["permissions"] = data.pop("permissions")
    for k, v in data.items():
        if v is not None:
            update[k] = v
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": user_id}, {"$set": update})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "admin" and target.get("organization_id") != user.get("organization_id"):
        raise HTTPException(status_code=403, detail="Cannot delete user from another org")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    # No eliminar usuarios con rol igual o superior al propio
    ROLE_LEVEL = {"super_admin": 3, "admin": 2, "client": 1}
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
        "organization_id": org_id,
        "organization_name": org["name"] if org else None,
        "type": payload.type,
        "status": "pending",
        "message": payload.message,
        "image_url": payload.image_url,
        "audio_url": payload.audio_url,
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
    # Emit socket.io event to admins
    await sio.emit("alert:new", alert, room="admins")
    await sio.emit("alert:new", alert, room=f"org:{org_id}")
    # Send web push to admins (works even with browser closed)
    try:
        await send_push_to_admins(db, alert)
    except Exception as e:
        logger.warning(f"send_push_to_admins failed: {e}")
    return alert


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
    limit: int = Query(200, le=1000),
):
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
    alerts = (
        await db.alerts.find(q, {"_id": 0})
        .sort("timestamp", -1)
        .to_list(limit)
    )
    return alerts


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
    await db.alerts.update_one(
        {"id": alert_id},
        {"$set": {"status": payload.status}, "$push": {"history": history_entry}},
    )
    updated = await db.alerts.find_one({"id": alert_id}, {"_id": 0})
    await sio.emit("alert:updated", updated, room="admins")
    await sio.emit("alert:updated", updated, room=f"org:{alert['organization_id']}")
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# Wrap FastAPI with Socket.IO ASGI app (mounted at /api/socket.io so it passes through k8s ingress)
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/api/socket.io")

# Supervisor points to `server:app` — so we need `app` to be the ASGI app with socket support.
# Reassign `app` to the ASGI wrapper so supervisor picks it up.
# Keep the original FastAPI instance internally accessible via `asgi_app.other_asgi_app` if needed.
app = asgi_app  # type: ignore
