"""Push notifications: Web Push (VAPID) + FCM (Firebase Cloud Messaging) for native apps."""
import os
import json
import base64
import logging
from pathlib import Path
from datetime import datetime, timezone

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

try:
    from pywebpush import webpush, WebPushException
except Exception:
    webpush = None
    WebPushException = Exception

try:
    import firebase_admin
    from firebase_admin import credentials, messaging
except Exception:
    firebase_admin = None
    messaging = None

logger = logging.getLogger("nacurutu.push")

ROOT_DIR = Path(__file__).parent
VAPID_DIR = ROOT_DIR / ".vapid"
VAPID_PRIV_PEM = VAPID_DIR / "priv.pem"
VAPID_PUB_B64 = VAPID_DIR / "pub.b64"

FIREBASE_DIR = ROOT_DIR / ".firebase"
FIREBASE_SA_JSON = FIREBASE_DIR / "service-account.json"

PHRASE_MAP = {
    "panic": "Pánico",
    "fire": "Fuego",
    "medical": "Asistencia",
    "on_way": "En camino",
    "here": "Estoy aquí",
    "silent": "Alerta silenciosa",
    "normal": "Alerta nueva",
}

_firebase_initialized = False


def _init_firebase():
    """Initialize Firebase Admin SDK once. Idempotent."""
    global _firebase_initialized
    if _firebase_initialized:
        return True
    if firebase_admin is None:
        logger.warning("firebase-admin not installed")
        return False
    if not FIREBASE_SA_JSON.exists():
        logger.warning(f"Firebase service account not found at {FIREBASE_SA_JSON}")
        return False
    try:
        cred = credentials.Certificate(str(FIREBASE_SA_JSON))
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized")
        return True
    except Exception as e:
        logger.exception(f"Firebase init failed: {e}")
        return False


# ------------------ VAPID (Web Push) ------------------
def ensure_vapid_keys():
    if VAPID_PRIV_PEM.exists() and VAPID_PUB_B64.exists():
        return
    VAPID_DIR.mkdir(parents=True, exist_ok=True)
    priv = ec.generate_private_key(ec.SECP256R1())
    pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    VAPID_PRIV_PEM.write_bytes(pem)
    pub_raw = priv.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    VAPID_PUB_B64.write_text(base64.urlsafe_b64encode(pub_raw).decode().rstrip("="))
    logger.info("Generated new VAPID key pair at %s", VAPID_DIR)


def get_vapid_public_key() -> str:
    if not VAPID_PUB_B64.exists():
        ensure_vapid_keys()
    return VAPID_PUB_B64.read_text().strip()


def get_vapid_private_pem_path() -> str:
    if not VAPID_PRIV_PEM.exists():
        ensure_vapid_keys()
    return str(VAPID_PRIV_PEM)


# ------------------ Helpers ------------------
def _claims_email() -> str:
    return os.environ.get("VAPID_CLAIMS_EMAIL") or os.environ.get("SUPER_ADMIN_EMAIL") or "admin@example.com"


def build_subscription_doc(user: dict, endpoint: str, keys: dict) -> dict:
    return {
        "user_id": user["id"],
        "organization_id": user.get("organization_id"),
        "role": user.get("role"),
        "endpoint": endpoint,
        "keys": keys,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user.get("email"),
    }


def build_fcm_token_doc(user: dict, token: str, platform: str) -> dict:
    return {
        "user_id": user["id"],
        "organization_id": user.get("organization_id"),
        "role": user.get("role"),
        "token": token,
        "platform": platform,  # 'android' | 'ios' | 'web'
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user.get("email"),
    }


def _admin_query(org_id):
    return {
        "$or": [
            {"role": "super_admin"},
            {"role": "admin", "organization_id": org_id},
        ]
    }


# ------------------ FCM (native apps) ------------------
async def _send_fcm_to_admins(db, alert: dict):
    if not _init_firebase():
        return
    org_id = alert.get("organization_id")
    tokens_docs = await db.fcm_tokens.find(_admin_query(org_id), {"_id": 0}).to_list(1000)
    # Separar tokens por rol y plataforma para customizar la notificación
    admin_tokens = [t["token"] for t in tokens_docs if t.get("token")]
    if not admin_tokens:
        return

    phrase = PHRASE_MAP.get(alert.get("type"), "Nueva alerta")
    title = f"🚨 {phrase.upper()}"
    body = f"{alert.get('user_name', 'Usuario')} — {alert.get('organization_name') or ''}"

    # Canal dedicado para admins — sirena custom + bypassDnd + full-screen intent.
    # El archivo de sonido debe existir en android/app/src/main/res/raw/siren.ogg
    # El canal se crea automáticamente desde la app al primer mensaje.
    message = messaging.MulticastMessage(
        tokens=admin_tokens,
        notification=messaging.Notification(title=title, body=body),
        data={
            "alertId": str(alert.get("id", "")),
            "alertType": str(alert.get("type", "")),
            "organizationId": str(alert.get("organization_id", "")),
            "timestamp": str(alert.get("timestamp", "")),
            "isPanic": "true" if alert.get("type") == "panic" else "false",
        },
        android=messaging.AndroidConfig(
            priority="high",
            notification=messaging.AndroidNotification(
                sound="siren",  # busca android/app/src/main/res/raw/siren.ogg
                channel_id="nacurutu_admin_panic",
                default_vibrate_timings=False,
                vibrate_timings_millis=[0, 500, 200, 500, 200, 500],
                visibility="public",
                priority="max",
                notification_count=1,
            ),
        ),
        apns=messaging.APNSConfig(
            headers={"apns-priority": "10"},
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    alert=messaging.ApsAlert(title=title, body=body),
                    sound="siren.caf",
                    badge=1,
                    content_available=True,
                    mutable_content=True,
                )
            ),
        ),
    )

    try:
        response = messaging.send_each_for_multicast(message)
        logger.info(f"FCM sent: success={response.success_count} failure={response.failure_count}")
        # Clean invalid tokens
        if response.failure_count > 0:
            for i, resp in enumerate(response.responses):
                if not resp.success:
                    err = resp.exception
                    code = getattr(err, "code", "") if err else ""
                    if code in ("registration-token-not-registered", "invalid-argument", "invalid-registration-token"):
                        await db.fcm_tokens.delete_one({"token": admin_tokens[i]})
                        logger.info("Deleted invalid FCM token")
    except Exception as e:
        logger.exception(f"FCM send failed: {e}")


# ------------------ Web Push (VAPID) ------------------
async def _send_webpush_to_admins(db, alert: dict):
    if webpush is None:
        return
    phrase = PHRASE_MAP.get(alert.get("type"), "Nueva alerta")
    payload = {
        "title": f"🚨 {phrase.upper()}",
        "body": f"{alert.get('user_name', 'Usuario')} — {alert.get('organization_name') or ''}",
        "alertId": alert.get("id"),
        "alertType": alert.get("type"),
        "organizationId": alert.get("organization_id"),
        "timestamp": alert.get("timestamp"),
    }

    org_id = alert.get("organization_id")
    subs = await db.push_subscriptions.find(_admin_query(org_id), {"_id": 0}).to_list(1000)
    if not subs:
        return

    private_key = get_vapid_private_pem_path()
    claims_sub = f"mailto:{_claims_email()}"
    dead = []

    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=json.dumps(payload),
                vapid_private_key=private_key,
                vapid_claims={"sub": claims_sub},
                ttl=60,
            )
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                dead.append(sub["endpoint"])
            logger.warning(f"Web push failed ({status}): {e}")
        except Exception as e:
            logger.exception("Unexpected push error: %s", e)

    for ep in dead:
        await db.push_subscriptions.delete_one({"endpoint": ep})


# ------------------ Public API ------------------
async def send_push_to_admins(db, alert: dict):
    """Send push via both FCM (native apps) and Web Push (browsers)."""
    await _send_fcm_to_admins(db, alert)
    await _send_webpush_to_admins(db, alert)
