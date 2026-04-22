import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { AlertAudioProvider } from "./context/AlertAudioContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OrgProvider } from "./context/OrgContext";
import { Toaster } from "./components/ui/sonner";
import { IS_ADMIN_BUILD } from "./lib/buildMode";

import Login from "./pages/Login";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Alerts from "./pages/admin/Alerts";
import Users from "./pages/admin/Users";
import Organizations from "./pages/admin/Organizations";
import PanicApp from "./pages/client/PanicApp";

// Cambiar el título del documento según el build (cliente vs admin)
if (typeof document !== "undefined") {
  document.title = IS_ADMIN_BUILD ? "ÑACURUTU Admin" : "ÑACURUTU Seguridad";
}

const BASENAME = process.env.REACT_APP_BASE_PATH || "";

function ProtectedRoute({ children, roles }) {
  const { user, checking } = useAuth();
  if (checking || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm font-mono-tactical">Cargando...</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === "client") return <Navigate to="/client" replace />;
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, checking } = useAuth();
  if (checking || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm font-mono-tactical">Cargando...</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role === "client") return <Navigate to="/client" replace />;
  return <Navigate to="/admin/dashboard" replace />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OrgProvider>
          <SocketProvider>
            <AlertAudioProvider>
              <BrowserRouter basename={BASENAME}>
              <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/client"
              element={
                <ProtectedRoute roles={["client"]}>
                  <PanicApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["super_admin", "admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="users" element={<Users />} />
              <Route path="organizations" element={<Organizations />} />
            </Route>
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            theme="light"
            position="top-right"
            toastOptions={{
              classNames: {
                toast: "bg-white border border-slate-200 rounded-md shadow-md",
              },
            }}
          />
            </BrowserRouter>
            </AlertAudioProvider>
          </SocketProvider>
        </OrgProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
