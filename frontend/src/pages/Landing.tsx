import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Sparkles,
  TrendingUp,
  Mail,
  ArrowRight,
} from "lucide-react";
import { GoogleLogin, CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api";
import type { User } from "../types";

export default function Landing() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google sign-in failed — no credential received");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const userData = await apiFetch<User>("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({ credential: response.credential }),
      });
      setUser(userData);
      navigate("/dashboard", { replace: true, state: { user: userData } });
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError("Google sign-in was cancelled or failed. Please try again.");
  };

  const features = [
    {
      icon: BarChart3,
      title: "Strategic Metrics Engine",
      desc: "Proprietary composite scores that VCs actually care about",
    },
    {
      icon: Sparkles,
      title: "AI Signal Interpretation",
      desc: "Detects non-obvious improvements and flags risks early",
    },
    {
      icon: TrendingUp,
      title: "Growth Intelligence",
      desc: "Velocity, acceleration, and compounding behavior analysis",
    },
    {
      icon: Mail,
      title: "Funding Narratives",
      desc: "VC-ready emails and traction statements in seconds",
    },
  ];

  return (
    <div className="min-h-screen bg-page" data-testid="landing-page">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
            </div>
            <span className="font-heading font-semibold text-lg text-slate-900 tracking-tight">
              Founder Intelligence
            </span>
          </div>
          <button
            data-testid="header-login-btn"
            onClick={() => {
              document
                .getElementById("auth-section")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="bg-[#111827] text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 bg-brand-light text-brand px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide mb-6">
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
            AI-NATIVE TRACTION INTELLIGENCE
          </div>
          <h1 className="font-heading text-5xl md:text-6xl tracking-tight leading-[1.1] font-semibold text-slate-900 mb-6">
            Upload raw data.
            <br />
            <span className="text-brand">Get investor-grade insight.</span>
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed max-w-xl mb-10">
            The first platform that doesn't just show charts — it interprets
            founder reality. Strategic metrics, growth signals, and funding
            narratives. All automated.
          </p>
          <button
            data-testid="hero-get-started-btn"
            onClick={() => {
              document
                .getElementById("auth-section")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="group bg-[#111827] text-white px-7 py-3.5 rounded-md text-base font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm inline-flex items-center gap-2"
          >
            Get Started Free
            <ArrowRight
              className="w-4 h-4 group-hover:translate-x-0.5 transition-transform"
              strokeWidth={2}
            />
          </button>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 * i }}
              className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-shadow duration-300"
              data-testid={`feature-card-${i}`}
            >
              <div className="w-10 h-10 bg-brand-light rounded-lg flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-brand" strokeWidth={1.5} />
              </div>
              <h3 className="font-heading font-medium text-slate-900 mb-2">
                {f.title}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Auth Section */}
      <section
        id="auth-section"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-md mx-auto"
        >
          <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h2 className="font-heading text-2xl font-semibold text-slate-900 text-center mb-2">
              Get started
            </h2>
            <p className="text-sm text-slate-500 text-center mb-6">
              Sign in with your Google account to continue
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                <span className="ml-3 text-sm text-slate-500">
                  Signing you in...
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  size="large"
                  width="350"
                  text="continue_with"
                  shape="rectangular"
                  theme="outline"
                />
                {process.env.NODE_ENV === "development" && (
                  <>
                    <div className="flex items-center gap-3 w-full max-w-[350px]">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-xs text-slate-400">or</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <button
                      data-testid="dev-login-btn"
                      onClick={async () => {
                        setError("");
                        setLoading(true);
                        try {
                          const userData = await apiFetch<User>(
                            "/api/auth/dev-login",
                            { method: "POST" },
                          );
                          setUser(userData);
                          navigate("/dashboard", {
                            replace: true,
                            state: { user: userData },
                          });
                        } catch (err: any) {
                          setError(err.message || "Dev login failed");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="w-full max-w-[350px] bg-amber-50 border border-amber-200 text-amber-800 px-5 py-2.5 rounded-md text-sm font-medium hover:bg-amber-100 active:scale-95 transition-all"
                    >
                      🔧 Dev Login (localhost only)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="bg-slate-900 rounded-2xl p-12 md:p-16 text-center">
          <h2 className="font-heading text-3xl md:text-4xl font-semibold text-white tracking-tight mb-4">
            Your growth story, told with precision.
          </h2>
          <p className="text-slate-400 text-lg mb-8 max-w-lg mx-auto">
            Stop spending hours on investor updates. Let AI interpret your data
            and craft narratives that get meetings.
          </p>
          <button
            data-testid="cta-get-started-btn"
            onClick={() => {
              document
                .getElementById("auth-section")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
            className="bg-white text-slate-900 px-7 py-3.5 rounded-md text-base font-medium hover:bg-slate-100 active:scale-95 transition-all shadow-sm inline-flex items-center gap-2"
          >
            Start Building Your Story
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Founder Intelligence Platform
          </span>
          <span className="text-xs text-slate-400">
            AI-native traction intelligence
          </span>
        </div>
      </footer>
    </div>
  );
}
