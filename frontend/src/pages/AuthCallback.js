import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

export default function AuthCallback() {
  const hasProcessed = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setLoading } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = location.hash;
    const sessionId = new URLSearchParams(hash.replace('#', '?')).get('session_id');

    if (!sessionId) {
      navigate('/login', { replace: true });
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const userData = await apiFetch('/api/auth/session', {
          method: 'POST',
          body: JSON.stringify({ session_id: sessionId }),
        });
        setUser(userData);
        navigate('/dashboard', { replace: true, state: { user: userData } });
      } catch (err) {
        console.error('Auth callback error:', err);
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [location, navigate, setUser, setLoading]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-body text-sm">Authenticating...</p>
      </div>
    </div>
  );
}
