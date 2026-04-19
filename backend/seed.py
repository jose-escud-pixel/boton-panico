"""Seed default organization and users on startup."""
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from auth import hash_password, verify_password


async def seed_initial_data(db):
    now_iso = datetime.now(timezone.utc).isoformat()

    # Default organization
    default_org = await db.organizations.find_one({"name": "ÑACURUTU SEGURIDAD"}, {"_id": 0})
    if not default_org:
        default_org = {
            "id": str(uuid.uuid4()),
            "name": "ÑACURUTU SEGURIDAD",
            "logo_url": "https://images.pexels.com/photos/66885/owl-yellow-eyes-white-bird-66885.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200&w=200",
            "created_at": now_iso,
        }
        await db.organizations.insert_one(dict(default_org))

    org_id = default_org["id"]

    # Super Admin
    super_email = os.environ.get("SUPER_ADMIN_EMAIL", "admin@nacurutu.com").lower()
    super_pass = os.environ.get("SUPER_ADMIN_PASSWORD", "admin123")

    existing = await db.users.find_one({"email": super_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": super_email,
            "password_hash": hash_password(super_pass),
            "name": "Jose - Super Admin",
            "role": "super_admin",
            "organization_id": org_id,
            "permissions": {"create": True, "edit": True, "delete": True, "view": True},
            "created_at": now_iso,
        })
    elif not verify_password(super_pass, existing["password_hash"]):
        await db.users.update_one(
            {"email": super_email},
            {"$set": {"password_hash": hash_password(super_pass)}},
        )

    # Client user
    client_email = os.environ.get("CLIENT_USER_EMAIL", "cliente@nacurutu.com").lower()
    client_pass = os.environ.get("CLIENT_USER_PASSWORD", "cliente123")

    existing_client = await db.users.find_one({"email": client_email})
    if not existing_client:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": client_email,
            "password_hash": hash_password(client_pass),
            "name": "Jose Escudero",
            "role": "client",
            "organization_id": org_id,
            "permissions": {"create": True, "edit": False, "delete": False, "view": True},
            "created_at": now_iso,
        })
    elif not verify_password(client_pass, existing_client["password_hash"]):
        await db.users.update_one(
            {"email": client_email},
            {"$set": {"password_hash": hash_password(client_pass)}},
        )

    # Write test credentials
    memory_dir = Path("/app/memory")
    memory_dir.mkdir(parents=True, exist_ok=True)
    (memory_dir / "test_credentials.md").write_text(
        f"""# Test Credentials - ÑACURUTU SEGURIDAD

## Super Admin
- Email: `{super_email}`
- Password: `{super_pass}`
- Role: `super_admin`
- Goes to: `/admin/dashboard`

## Client User
- Email: `{client_email}`
- Password: `{client_pass}`
- Role: `client`
- Goes to: `/client`

## Default Organization
- ID: `{org_id}`
- Name: `ÑACURUTU SEGURIDAD`

## Auth Endpoints
- POST /api/auth/login
- GET  /api/auth/me
- POST /api/auth/logout
- POST /api/auth/refresh
"""
    )
