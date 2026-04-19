"""Web Push (VAPID) — generate keys on startup, send push to admins on new alerts."""
import os
import json
import base64
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

try:
    from pywebpush import webpush, WebPushException
except Exception as e:  # pragma: no cover
    webpush = None
    WebPushException = Exception

logger = logging.getLogger("nacurutu.push")

ROOT_DIR = Path(__file__).parent
VAPID_DIR = ROOT_DIR / ".vapid"
VAPID_PRIV_PEM = VAPID_DIR / "priv.pem"
VAPID_PUB_B64 = VAPID_DIR / "pub.b64"

PHRASE_MAP = {
    "panic": "Pánico",
    "fire": "Fuego",
    "medical": "Asistencia",
    "on_way": "En camino",
    "here": "Estoy aquí",
    "silent": "Alerta silenciosa",
    "normal": "Alerta nueva",
}


def ensure_vapid_keys():
    """Generate VAPID keys once, reuse after. Idempotent."""
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
    pub_b64 = base64.urlsafe_b64encode(pub_raw).decode().rstrip("=")
    VAPID_PUB_B64.write_text(pub_b64)
    logger.info("Generated new VAPID key pair at %s", VAPID_DIR)


def get_vapid_public_key() -> str:
    if not VAPID_PUB_B64.exists():
        ensure_vapid_keys()
    return VAPID_PUB_B64.read_text().strip()


def get_vapid_private_pem_path() -> str:
    if not VAPID_PRIV_PEM.exists():
        ensure_vapid_keys()
    return str(VAPID_PRIV_PEM)


def _claims_email() -> str:
    email = os.environ.get("VAPID_CLAIMS_EMAIL") or os.environ.get("SUPER_ADMIN_EMAIL") or "admin@example.com"
    return email


async def send_push_to_admins(db, alert: dict):
    """Send web push to all admins subscribed for this alert's organization.

    alert must include id, type, organization_id, user_name, organization_name, timestamp.
    """
    if webpush is None:
        logger.warning("pywebpush not installed; skipping push")
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
    query = {
        "$or": [
            {"role": "super_admin"},
            {"role": "admin", "organization_id": org_id},
        ]
    }
    subs = await db.push_subscriptions.find(query, {"_id": 0}).to_list(1000)

    if not subs:
        return

    private_key = get_vapid_private_pem_path()
    claims_sub = f"mailto:{_claims_email()}"
    dead_endpoints = []

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": sub["keys"],
                },
                data=json.dumps(payload),
                vapid_private_key=private_key,
                vapid_claims={"sub": claims_sub},
                ttl=60,
            )
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):
                dead_endpoints.append(sub["endpoint"])
            logger.warning(f"Push failed ({status}): {e}")
        except Exception as e:
            logger.exception("Unexpected push error: %s", e)

    # Cleanup dead subscriptions
    for ep in dead_endpoints:
        await db.push_subscriptions.delete_one({"endpoint": ep})


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
