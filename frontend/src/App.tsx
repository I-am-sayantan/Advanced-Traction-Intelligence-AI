import React, { useEffect, useState, ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import DataUpload from "./pages/DataUpload";
import Updates from "./pages/Updates";
import Insights from "./pages/Insights";
import NarrativeGenerator from "./pages/NarrativeGenerator";
import Contacts from "./pages/Contacts";
import EmailSettings from "./pages/EmailSettings";

interface ProtectedRouteProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, checkAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
    (location.state as any)?.user ? true : user ? true : null,
  );

  useEffect(() => {
    if ((location.state as any)?.user || user) {
      setIsAuthenticated(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const userData = await checkAuth();
      if (cancelled) return;
      if (userData) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        navigate("/", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkAuth, location.state, navigate, user]);

  if (isAuthenticated === null) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-page"
        data-testid="auth-loading"
      >
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated === false) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Landing />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/upload"
        element={
          <ProtectedRoute>
            <DataUpload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/updates"
        element={
          <ProtectedRoute>
            <Updates />
          </ProtectedRoute>
        }
      />
      <Route
        path="/insights"
        element={
          <ProtectedRoute>
            <Insights />
          </ProtectedRoute>
        }
      />
      <Route
        path="/narrative"
        element={
          <ProtectedRoute>
            <NarrativeGenerator />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Contacts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/email-settings"
        element={
          <ProtectedRoute>
            <EmailSettings />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || "";

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
