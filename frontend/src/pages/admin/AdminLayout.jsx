import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
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
} from "lucide-react";
import { useSocket } from "../../context/SocketContext";
import { useAlertAudio } from "../../context/AlertAudioContext";

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
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200`}
        data-testid="admin-sidebar"
      >
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <OwlLogo size={36} />
            <div>
              <h1 className="font-heading font-bold text-sm tracking-tight text-slate-900">ÑACURUTU</h1>
              <p className="overline text-[0.6rem]">Command Center</p>
            </div>
          </div>
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
                    ? "bg-rose-50 text-rose-700 border-l-2 border-rose-600"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <item.icon className="w-4 h-4" strokeWidth={1.8} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 text-xs">
            <Radio
              className={`w-3 h-3 ${connected ? "text-emerald-600" : "text-slate-400"}`}
              strokeWidth={2}
            />
            <span className={connected ? "text-emerald-700" : "text-slate-400"}>
              {connected ? "Tiempo real activo" : "Sin conexión"}
            </span>
          </div>
          <div className="px-3 py-2 text-xs">
            <div className="text-slate-500 overline text-[0.6rem]">Sesión</div>
            <div className="text-slate-900 truncate mt-1" data-testid="sidebar-user-name">{user?.name}</div>
            <div className="text-slate-500 text-[0.7rem] mt-0.5">{user?.role}</div>
          </div>
          <Button
            onClick={silence}
            variant="outline"
            className="w-full justify-start border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 rounded-md mb-1"
            data-testid="silence-button"
          >
            <VolumeX className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Silenciar sirena
          </Button>

          <Button
            onClick={handleLogout}
            variant="ghost"
            className="w-full justify-start text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4 mr-2" strokeWidth={1.8} />
            Cerrar sesión
          </Button>
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
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <button onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-button">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <OwlLogo size={28} />
            <span className="font-heading font-bold tracking-tight text-slate-900">ÑACURUTU</span>
          </div>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
