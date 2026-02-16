import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * AuthCallback is no longer needed — authentication is handled directly
 * on the Landing page via email/password. This component simply redirects
 * to the landing page.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-500 font-body text-sm">Redirecting...</p>
      </div>
    </div>
  );
}
