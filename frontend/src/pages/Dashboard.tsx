import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api";
import Sidebar from "../components/Sidebar";
import ScoreCard from "../components/ScoreCard";
import SignalFeed from "../components/SignalFeed";
import TrendChart from "../components/TrendChart";
import { motion } from "framer-motion";
import { BarChart3, Upload, FileText, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DashboardOverview, ScoreItem } from "../types";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<DashboardOverview>(
          "/api/dashboard/overview",
        );
        setOverview(data);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = overview?.latest_metrics;
  const insights = overview?.latest_insights;

  const scores: ScoreItem[] = metrics
    ? [
        {
          label: "Growth Score",
          value: metrics.growth_score,
          color: "#4F46E5",
        },
        {
          label: "Efficiency",
          value: metrics.efficiency_score,
          color: "#10B981",
        },
        { label: "PMF Signal", value: metrics.pmf_signal, color: "#F59E0B" },
        {
          label: "Scalability",
          value: metrics.scalability_index,
          color: "#8B5CF6",
        },
        {
          label: "Capital Efficiency",
          value: metrics.capital_efficiency,
          color: "#EF4444",
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen bg-page" data-testid="dashboard-page">
      <Sidebar active="dashboard" />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1
              className="font-heading text-3xl font-semibold text-slate-900 tracking-tight"
              data-testid="dashboard-title"
            >
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-slate-500 mt-1">
              Your startup intelligence at a glance
            </p>
          </motion.div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="col-span-12 md:col-span-4 lg:col-span-3 h-36 skeleton rounded-xl"
                />
              ))}
            </div>
          ) : !overview || overview.total_datasets === 0 ? (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
              data-testid="empty-dashboard"
            >
              <div className="w-16 h-16 bg-brand-light rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Upload className="w-8 h-8 text-brand" strokeWidth={1.5} />
              </div>
              <h2 className="font-heading text-2xl font-medium text-slate-900 mb-3">
                Upload your first dataset
              </h2>
              <p className="text-slate-500 mb-6 max-w-md mx-auto">
                Upload a CSV or Excel file with your startup metrics to get
                strategic insights, composite scores, and funding-ready
                narratives.
              </p>
              <button
                data-testid="upload-first-dataset-btn"
                onClick={() => navigate("/upload")}
                className="bg-[#111827] text-white px-6 py-3 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" strokeWidth={2} />
                Upload Data
              </button>
            </motion.div>
          ) : (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  {
                    icon: BarChart3,
                    label: "Datasets",
                    value: overview.total_datasets,
                  },
                  {
                    icon: TrendingUp,
                    label: "Scores Computed",
                    value: metrics ? 5 : 0,
                  },
                  {
                    icon: FileText,
                    label: "Narratives",
                    value: overview.total_narratives,
                  },
                  {
                    icon: Upload,
                    label: "Latest Upload",
                    value: overview.datasets[0]?.filename?.slice(0, 15) || "-",
                  },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                    data-testid={`stat-card-${stat.label.toLowerCase().replace(/\s/g, "-")}`}
                  >
                    <stat.icon
                      className="w-4 h-4 text-slate-400 mb-2"
                      strokeWidth={1.5}
                    />
                    <div className="text-2xl font-heading font-semibold text-slate-900 tracking-tight">
                      {stat.value}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {stat.label}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Composite Scores */}
              {scores.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  {scores.map((s, i) => (
                    <ScoreCard
                      key={s.label}
                      label={s.label}
                      value={s.value}
                      color={s.color}
                      delay={i * 0.05}
                    />
                  ))}
                </div>
              )}

              {/* Chart + Signals */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8">
                  <TrendChart metrics={metrics} />
                </div>
                <div className="lg:col-span-4">
                  <SignalFeed insights={insights} />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
