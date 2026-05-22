"""Registro de auditoría en MongoDB (best-effort)."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("nacurutu")


async def write_audit(
    db,
    *,
    action: str,
    actor_id: Optional[str] = None,
    actor_email: Optional[str] = None,
    actor_name: Optional[str] = None,
    organization_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    summary: str = "",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        await db.audit_logs.insert_one(
            {
                "id": str(uuid.uuid4()),
                "ts": datetime.now(timezone.utc).isoformat(),
                "action": action,
                "actor_id": actor_id,
                "actor_email": actor_email,
                "actor_name": actor_name,
                "organization_id": organization_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "summary": summary or action,
                "meta": meta or {},
            }
        )
    except Exception as exc:
        logger.warning("write_audit failed: %s", exc)
