import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import DataUpload from './pages/DataUpload';
import Insights from './pages/Insights';
import NarrativeGenerator from './pages/NarrativeGenerator';

function ProtectedRoute({ children }) {
  const { user, checkAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(
    location.state?.user ? true : (user ? true : null)
  );

  useEffect(() => {
    if (location.state?.user || user) {
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
        navigate('/', { replace: true });
      }
    })();
    return () => { cancelled = true; };
  }, [checkAuth, location.state, navigate, user]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page" data-testid="auth-loading">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated === false) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRouter() {
  const location = useLocation();

  // Synchronous check for session_id in URL fragment - prevents race conditions
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Landing />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><DataUpload /></ProtectedRoute>} />
      <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
      <Route path="/narrative" element={<ProtectedRoute><NarrativeGenerator /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}
