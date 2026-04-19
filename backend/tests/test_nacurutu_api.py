"""
ÑACURUTU SEGURIDAD backend API tests.

Covers: auth (login/me/logout/refresh), organizations CRUD, users CRUD,
alerts (create/list/detail/status), dashboard stats, multi-tenant
isolation and role-based access control.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://panic-admin-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "jose@aranduinformatica.net"
SUPER_PASS = "12345678"
CLIENT_EMAIL = "jose.escudero@aranduinformatica.net"
CLIENT_PASS = "12345678"


# ----------------------- Fixtures -----------------------
@pytest.fixture(scope="session")
def super_token():
    r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=20)
    assert r.status_code == 200, f"super login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def client_token():
    r = requests.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASS}, timeout=20)
    assert r.status_code == 200, f"client login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def super_user(super_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {super_token}"}, timeout=20)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def client_user(client_token):
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {client_token}"}, timeout=20)
    assert r.status_code == 200
    return r.json()


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# Track created resources for cleanup at the end
_created = {"orgs": [], "users": [], "alerts": []}


@pytest.fixture(scope="session", autouse=True)
def _cleanup(super_token):
    yield
    tok = super_token
    for uid in _created["users"]:
        try:
            requests.delete(f"{API}/users/{uid}", headers=h(tok), timeout=10)
        except Exception:
            pass
    for oid in _created["orgs"]:
        try:
            requests.delete(f"{API}/organizations/{oid}", headers=h(tok), timeout=10)
        except Exception:
            pass
    # alerts have no DELETE endpoint; leave as-is


# ----------------------- AUTH -----------------------
class TestAuth:
    def test_login_super_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["email"] == SUPER_EMAIL
        assert data["user"]["role"] == "super_admin"
        assert "password_hash" not in data["user"]
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        # cookie should be set
        cookies = r.cookies.get_dict()
        assert "access_token" in cookies

    def test_login_client(self):
        r = requests.post(f"{API}/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PASS}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["user"]["role"] == "client"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_bearer(self, super_token):
        r = requests.get(f"{API}/auth/me", headers=h(super_token), timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == SUPER_EMAIL
        assert "password_hash" not in u

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_logout(self):
        s = requests.Session()
        lg = s.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PASS}, timeout=15)
        assert lg.status_code == 200
        lo = s.post(f"{API}/auth/logout", timeout=15)
        assert lo.status_code == 200
        assert lo.json().get("ok") is True


# ----------------------- ORGANIZATIONS -----------------------
class TestOrganizations:
    def test_list_orgs_super_sees_all(self, super_token):
        r = requests.get(f"{API}/organizations", headers=h(super_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        names = [o["name"] for o in data]
        assert "ÑACURUTU SEGURIDAD" in names

    def test_list_orgs_client_sees_own_only(self, client_token, client_user):
        r = requests.get(f"{API}/organizations", headers=h(client_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == client_user["organization_id"]

    def test_create_org_super(self, super_token):
        name = f"TEST_Org_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/organizations", headers=h(super_token), json={"name": name, "logo_url": None}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == name
        assert "id" in data
        _created["orgs"].append(data["id"])
        # verify in list
        lr = requests.get(f"{API}/organizations", headers=h(super_token), timeout=15)
        assert any(o["id"] == data["id"] for o in lr.json())

    def test_create_org_client_forbidden(self, client_token):
        r = requests.post(f"{API}/organizations", headers=h(client_token), json={"name": "TEST_NoAccess"}, timeout=15)
        assert r.status_code == 403

    def test_update_org(self, super_token):
        # Create then update
        name = f"TEST_OrgU_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/organizations", headers=h(super_token), json={"name": name}, timeout=15)
        oid = r.json()["id"]
        _created["orgs"].append(oid)
        new_name = name + "_updated"
        u = requests.put(f"{API}/organizations/{oid}", headers=h(super_token), json={"name": new_name}, timeout=15)
        assert u.status_code == 200, u.text
        assert u.json()["name"] == new_name

    def test_delete_org_super(self, super_token):
        name = f"TEST_OrgD_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/organizations", headers=h(super_token), json={"name": name}, timeout=15)
        oid = r.json()["id"]
        d = requests.delete(f"{API}/organizations/{oid}", headers=h(super_token), timeout=15)
        assert d.status_code == 200
        # confirm gone - list should not include it
        lr = requests.get(f"{API}/organizations", headers=h(super_token), timeout=15)
        assert not any(o["id"] == oid for o in lr.json())


# ----------------------- USERS -----------------------
class TestUsers:
    def test_list_users_super(self, super_token):
        r = requests.get(f"{API}/users", headers=h(super_token), timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        emails = [u["email"] for u in users]
        assert SUPER_EMAIL in emails
        assert CLIENT_EMAIL in emails
        for u in users:
            assert "password_hash" not in u

    def test_list_users_client_forbidden(self, client_token):
        r = requests.get(f"{API}/users", headers=h(client_token), timeout=15)
        assert r.status_code == 403

    def test_create_client_user_then_delete(self, super_token, super_user):
        org_id = super_user["organization_id"]
        email = f"test_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "email": email,
            "password": "password123",
            "name": "TEST User",
            "role": "client",
            "organization_id": org_id,
            "permissions": {"create": True, "edit": False, "delete": False, "view": True},
        }
        r = requests.post(f"{API}/users", headers=h(super_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == email
        assert u["role"] == "client"
        assert "password_hash" not in u
        uid = u["id"]
        _created["users"].append(uid)

        # Verify login works
        lg = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=15)
        assert lg.status_code == 200

        # Update password and name
        up = requests.put(
            f"{API}/users/{uid}", headers=h(super_token),
            json={"name": "TEST Updated", "password": "newpass123"}, timeout=15
        )
        assert up.status_code == 200
        assert up.json()["name"] == "TEST Updated"
        # old pw should fail
        old = requests.post(f"{API}/auth/login", json={"email": email, "password": "password123"}, timeout=15)
        assert old.status_code == 401
        new = requests.post(f"{API}/auth/login", json={"email": email, "password": "newpass123"}, timeout=15)
        assert new.status_code == 200

        # Delete
        d = requests.delete(f"{API}/users/{uid}", headers=h(super_token), timeout=15)
        assert d.status_code == 200
        _created["users"].remove(uid)
        # cannot login now
        gone = requests.post(f"{API}/auth/login", json={"email": email, "password": "newpass123"}, timeout=15)
        assert gone.status_code == 401

    def test_cannot_delete_self(self, super_token, super_user):
        r = requests.delete(f"{API}/users/{super_user['id']}", headers=h(super_token), timeout=15)
        assert r.status_code == 400

    def test_create_admin_requires_super(self, super_token, super_user):
        # First need an admin user to test. Create an admin then try to escalate.
        org_id = super_user["organization_id"]
        admin_email = f"admin_{uuid.uuid4().hex[:8]}@test.com"
        r = requests.post(f"{API}/users", headers=h(super_token), json={
            "email": admin_email, "password": "adminpass", "name": "TEST Admin",
            "role": "admin", "organization_id": org_id,
            "permissions": {"create": True, "edit": True, "delete": True, "view": True},
        }, timeout=15)
        assert r.status_code == 200, r.text
        admin_id = r.json()["id"]
        _created["users"].append(admin_id)

        # Admin logs in and tries to create another admin -> must be forbidden
        lg = requests.post(f"{API}/auth/login", json={"email": admin_email, "password": "adminpass"}, timeout=15)
        admin_tok = lg.json()["access_token"]
        attempt = requests.post(f"{API}/users", headers=h(admin_tok), json={
            "email": f"admin2_{uuid.uuid4().hex[:6]}@test.com", "password": "x123", "name": "x",
            "role": "admin", "organization_id": org_id, "permissions": {},
        }, timeout=15)
        assert attempt.status_code == 403


# ----------------------- ALERTS -----------------------
class TestAlerts:
    def test_create_silent_alert(self, client_token):
        r = requests.post(f"{API}/alerts", headers=h(client_token), json={
            "type": "silent",
            "location": {"type": "Point", "coordinates": [-57.5759, -25.2637]},
        }, timeout=15)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["type"] == "silent"
        assert a["status"] == "pending"
        assert len(a["history"]) == 1
        _created["alerts"].append(a["id"])
        return a["id"]

    def test_create_normal_alert_with_media(self, client_token):
        img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
        aud = "data:audio/mpeg;base64,SUQzAwAAAAAAAA=="
        r = requests.post(f"{API}/alerts", headers=h(client_token), json={
            "type": "normal",
            "message": "Help needed",
            "image_url": img,
            "audio_url": aud,
            "location": {"type": "Point", "coordinates": [-57.5, -25.2]},
        }, timeout=20)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["type"] == "normal"
        assert a["message"] == "Help needed"
        assert a["image_url"] == img
        _created["alerts"].append(a["id"])

    def test_list_alerts_client_sees_only_own(self, client_token, client_user):
        r = requests.get(f"{API}/alerts", headers=h(client_token), timeout=15)
        assert r.status_code == 200
        for a in r.json():
            assert a["user_id"] == client_user["id"]

    def test_list_alerts_super_filter_by_type(self, super_token):
        r = requests.get(f"{API}/alerts", headers=h(super_token), params={"type": "silent"}, timeout=15)
        assert r.status_code == 200
        for a in r.json():
            assert a["type"] == "silent"

    def test_get_alert_detail(self, super_token, client_token):
        # Create one with client first
        cr = requests.post(f"{API}/alerts", headers=h(client_token), json={"type": "silent"}, timeout=15)
        aid = cr.json()["id"]
        _created["alerts"].append(aid)
        r = requests.get(f"{API}/alerts/{aid}", headers=h(super_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == aid
        assert "history" in r.json()

    def test_update_alert_status_flow(self, super_token, client_token):
        cr = requests.post(f"{API}/alerts", headers=h(client_token), json={"type": "silent"}, timeout=15)
        aid = cr.json()["id"]
        _created["alerts"].append(aid)

        r1 = requests.patch(f"{API}/alerts/{aid}/status", headers=h(super_token),
                            json={"status": "in_process", "note": "taking it"}, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["status"] == "in_process"
        assert len(r1.json()["history"]) == 2

        r2 = requests.patch(f"{API}/alerts/{aid}/status", headers=h(super_token),
                            json={"status": "completed", "note": "done"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "completed"
        assert len(r2.json()["history"]) == 3

    def test_client_cannot_update_status(self, client_token):
        cr = requests.post(f"{API}/alerts", headers=h(client_token), json={"type": "silent"}, timeout=15)
        aid = cr.json()["id"]
        _created["alerts"].append(aid)
        r = requests.patch(f"{API}/alerts/{aid}/status", headers=h(client_token),
                           json={"status": "completed"}, timeout=15)
        assert r.status_code == 403


# ----------------------- DASHBOARD -----------------------
class TestDashboard:
    def test_stats_super(self, super_token):
        r = requests.get(f"{API}/dashboard/stats", headers=h(super_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "today", "week", "month", "by_type", "by_status", "by_organization", "daily"]:
            assert k in d
        assert isinstance(d["by_organization"], list)
        assert len(d["daily"]) == 7
        assert "silent" in d["by_type"] and "normal" in d["by_type"]
        assert all(k in d["by_status"] for k in ["pending", "in_process", "completed"])

    def test_stats_client_forbidden(self, client_token):
        r = requests.get(f"{API}/dashboard/stats", headers=h(client_token), timeout=15)
        assert r.status_code == 403


# ----------------------- MULTI-TENANT ISOLATION -----------------------
class TestMultiTenantIsolation:
    def test_admin_of_other_org_cannot_see_foreign_alerts(self, super_token, super_user):
        # Create a new org + admin user for it
        org_name = f"TEST_Iso_{uuid.uuid4().hex[:6]}"
        cr = requests.post(f"{API}/organizations", headers=h(super_token), json={"name": org_name}, timeout=15)
        assert cr.status_code == 200
        new_org_id = cr.json()["id"]
        _created["orgs"].append(new_org_id)

        admin_email = f"iso_admin_{uuid.uuid4().hex[:6]}@test.com"
        ur = requests.post(f"{API}/users", headers=h(super_token), json={
            "email": admin_email, "password": "isopass", "name": "TEST IsoAdmin",
            "role": "admin", "organization_id": new_org_id,
            "permissions": {"create": True, "edit": True, "delete": True, "view": True},
        }, timeout=15)
        assert ur.status_code == 200
        _created["users"].append(ur.json()["id"])

        lg = requests.post(f"{API}/auth/login", json={"email": admin_email, "password": "isopass"}, timeout=15)
        iso_tok = lg.json()["access_token"]

        # Admin of new org should see no alerts from default org
        al = requests.get(f"{API}/alerts", headers=h(iso_tok), timeout=15)
        assert al.status_code == 200
        for a in al.json():
            assert a["organization_id"] == new_org_id

        # Admin of new org should not see users of default org
        uu = requests.get(f"{API}/users", headers=h(iso_tok), timeout=15)
        assert uu.status_code == 200
        for u in uu.json():
            assert u["organization_id"] == new_org_id

        # Cannot edit foreign org
        edit = requests.put(f"{API}/organizations/{super_user['organization_id']}",
                            headers=h(iso_tok), json={"name": "hacked"}, timeout=15)
        assert edit.status_code == 403
