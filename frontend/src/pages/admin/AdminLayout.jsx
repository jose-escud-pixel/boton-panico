import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { OwlLogo } from "../../components/OwlLogo";
import { Button } from "../../components/ui/button";
import {
  LayoutDashboard,
  Siren,
  Users,
  Building2,
  Activity,
  LogOut,
  Menu,
  Radio,
  VolumeX,
  Sun,
  Moon,
  KeyRound,
  ClipboardList,
  LifeBuoy,
  Camera,
} from "lucide-react";
import { useSocket } from "../../context/SocketContext";
import { useAlertAudio } from "../../context/AlertAudioContext";
import { useOrg } from "../../context/OrgContext";
import VersionBadge from "../../components/VersionBadge";
import ChangePasswordDialog from "../../components/ChangePasswordDialog";

const navItems = [
  { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard", test: "nav-dashboard", module: "dashboard" },
  { to: "/admin/alerts", icon: Siren, label: "Alertas", test: "nav-alerts", module: "alerts" },
  { to: "/admin/devices", icon: Camera, label: "Dispositivos", test: "nav-devices", module: "devices" },
  { to: "/admin/users", icon: Users, label: "Usuarios", test: "nav-users", module: "users" },
  { to: "/admin/online-users", icon: Activity, label: "En línea", test: "nav-online-users", module: "online_users" },
  { to: "/admin/organizations", icon: Building2, label: "Organizaciones", test: "nav-organizations", module: "organizations" },
  { to: "/admin/audit", icon: ClipboardList, label: "Auditoría", test: "nav-audit", module: "alerts" },
  { to: "/admin/tickets", icon: LifeBuoy, label: "Tickets", test: "nav-tickets", module: "tickets" },
];

function JarLogoCorner() {
  return (
    <div className="flex items-center gap-2" title="JAR Informática">
      <svg viewBox="0 0 100 120" width="28" height="34" aria-label="JAR" className="shrink-0">
        <defs>
          <linearGradient id="jarGlobalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <rect x="20" y="5" width="60" height="110" rx="20" ry="20" fill="url(#jarGlobalGrad)" />
        <rect x="35" y="20" width="30" height="38" rx="4" fill="none" stroke="white" strokeWidth="3.5" />
        <circle cx="41" cy="26" r="1.5" fill="white" />
        <rect x="35" y="62" width="30" height="38" rx="4" fill="none" stroke="white" strokeWidth="3.5" />
        <circle cx="41" cy="68" r="1.5" fill="white" />
      </svg>
      <div className="leading-tight">
        <div className="font-black tracking-wide text-[0.8rem] text-blue-700 dark:text-blue-300">JAR</div>
        <div className="text-[0.58rem] tracking-[0.15em] text-slate-600 dark:text-slate-400 uppercase">Informática</div>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { silence } = useAlertAudio();
  const { isDark, toggleTheme } = useTheme();
  const { orgs, activeOrgId, selectOrg, canSwitch } = useOrg();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);

  const canViewModule = (module) => {
    if (!user) return false;
    if (user.role === "super_admin" || user.is_owner) return true;
    if (user.role !== "admin") return false;
    // Tickets siempre visible para todos los admins (sin permiso especial)
    if (module === "tickets") return true;
    if (module === "devices") return true;
    const p = user.permissions || {};
    if (typeof p.view === "boolean") return p.view; // legacy flat
    return !!p?.[module]?.view;
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200`}
        data-testid="admin-sidebar"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <OwlLogo size={36} />
            <div>
              <h1 className="font-heading font-bold text-sm tracking-tight text-slate-900 dark:text-white">ÑACURUTU</h1>
              <p className="overline text-[0.6rem] text-slate-500 dark:text-slate-400">Command Center</p>
            </div>
          </div>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            data-testid="admin-toggle-theme"
            aria-label="Cambiar tema"
          >
            {isDark
              ? <Sun className="w-4 h-4 text-yellow-300" strokeWidth={2} />
              : <Moon className="w-4 h-4 text-slate-700" strokeWidth={2} />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {canSwitch && orgs.length > 0 && (
            <div className="mb-3 px-1">
              <div className="overline text-[0.55rem] text-slate-500 dark:text-slate-400 mb-1.5 px-2">
                Organización activa
              </div>
              <select
                value={activeOrgId}
                onChange={(e) => selectOrg(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-md px-2 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
                data-testid="org-switcher"
              >
                <option value="all">Todas las organizaciones</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}
          {navItems.filter((item) => canViewModule(item.module)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              data-testid={item.test}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-l-2 border-rose-600"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`
              }
            >
              <item.icon className="w-4 h-4" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <Radio
              className={`w-3 h-3 ${connected ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}
              strokeWidth={2}
            />
            <span className={connected ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400"}>
              {connected ? "Tiempo real activo" : "Sin conexión"}
            </span>
          </div>
          <div className="px-3 py-2 text-xs">
            <div className="text-slate-500 dark:text-slate-400 overline text-[0.6rem]">Sesión</div>
            <div className="text-slate-900 dark:text-white truncate mt-1" data-testid="sidebar-user-name">{user?.name}</div>
            <div className="text-slate-500 dark:text-slate-400 text-[0.7rem] mt-0.5">{user?.role}</div>
          </div>
          <Button
            onClick={silence}
            variant="outline"
            className="w-full justify-start border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-800 rounded-md mb-1"
            data-testid="silence-button"
          >
            <VolumeX className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Silenciar sirena
          </Button>

          <Button
            onClick={() => setPwdOpen(true)}
            variant="ghost"
            className="w-full justify-start text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            data-testid="change-password-button"
          >
            <KeyRound className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Cambiar contraseña
          </Button>

          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Cerrar sesión
          </Button>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <VersionBadge />
          </div>
        </div>
      </aside>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <button onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-button">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <OwlLogo size={28} />
            <span className="font-heading font-bold tracking-tight text-slate-900 dark:text-white">ÑACURUTU</span>
          </div>
          <span className="text-lg" aria-label="Paraguay">🇵🇾</span>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          <div className="sticky top-0 z-10 pointer-events-none">
            <div className="flex justify-end p-3 md:p-4">
              <div className="pointer-events-auto bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 shadow-sm backdrop-blur">
                <JarLogoCorner />
              </div>
            </div>
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
