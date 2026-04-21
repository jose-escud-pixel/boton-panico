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
  LogOut,
  Menu,
  Radio,
  VolumeX,
  Sun,
  Moon,
} from "lucide-react";
import { useSocket } from "../../context/SocketContext";
import { useAlertAudio } from "../../context/AlertAudioContext";
import VersionBadge from "../../components/VersionBadge";

const navItems = [
  { to: "/admin/dashboard", icon: LayoutDashboard, label: "Dashboard", test: "nav-dashboard" },
  { to: "/admin/alerts", icon: Siren, label: "Alertas", test: "nav-alerts" },
  { to: "/admin/users", icon: Users, label: "Usuarios", test: "nav-users" },
  { to: "/admin/organizations", icon: Building2, label: "Organizaciones", test: "nav-organizations" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { silence } = useAlertAudio();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          {navItems.map((item) => (
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
