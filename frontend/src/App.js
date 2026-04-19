import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { Toaster } from "./components/ui/sonner";

import Login from "./pages/Login";
import AdminLayout from "./pages/admin/AdminLayout";
import Dashboard from "./pages/admin/Dashboard";
import Alerts from "./pages/admin/Alerts";
import Users from "./pages/admin/Users";
import Organizations from "./pages/admin/Organizations";
import PanicApp from "./pages/client/PanicApp";

function ProtectedRoute({ children, roles }) {
  const { user, checking } = useAuth();
  if (checking || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-500 text-sm font-mono-tactical">Cargando...</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    // If client tries to access admin, redirect to /client and vice versa
    if (user.role === "client") return <Navigate to="/client" replace />;
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, checking } = useAuth();
  if (checking || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-500 text-sm font-mono-tactical">Cargando...</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  if (user.role === "client") return <Navigate to="/client" replace />;
  return <Navigate to="/admin/dashboard" replace />;
}

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
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
            theme="dark"
            position="top-right"
            toastOptions={{
              classNames: {
                toast: "bg-zinc-900 border border-zinc-800 rounded-sm",
              },
            }}
          />
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
