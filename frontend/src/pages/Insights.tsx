import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import Sidebar from "../components/Sidebar";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { Dataset, Insights as InsightsType } from "../types";

export default function Insights() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDs, setSelectedDs] = useState("");
  const [insights, setInsights] = useState<InsightsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const ds = await apiFetch<Dataset[]>("/api/data/datasets");
        setDatasets(ds);
        if (ds.length > 0) {
          setSelectedDs(ds[0].dataset_id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDs) return;
    (async () => {
      try {
        const data = await apiFetch<InsightsType>(
          `/api/insights/${selectedDs}`,
        );
        setInsights(data);
      } catch {
        setInsights(null);
      }
    })();
  }, [selectedDs]);

  const handleRegenerate = async () => {
    if (!selectedDs) return;
    setGenerating(true);
    try {
      const data = await apiFetch<InsightsType>(
        `/api/insights/generate/${selectedDs}`,
        { method: "POST" },
      );
      setInsights(data);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpand = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const severityColors: Record<string, string> = {
    critical: "bg-red-50 border-red-200 text-red-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    info: "bg-blue-50 border-blue-200 text-blue-700",
  };
  const impactColors: Record<string, string> = {
    high: "bg-emerald-50 text-emerald-700 border-emerald-100",
    medium: "bg-blue-50 text-blue-700 border-blue-100",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="flex min-h-screen bg-page" data-testid="insights-page">
      <Sidebar active="insights" />
      <main className="flex-1 ml-64 p-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <h1
                className="font-heading text-3xl font-semibold text-slate-900 tracking-tight"
                data-testid="insights-title"
              >
                AI Insights
              </h1>
              <p className="text-slate-500 mt-1">
                Strategic signals detected by AI analysis
              </p>
            </div>
            <div className="flex items-center gap-3">
              {datasets.length > 1 && (
                <select
                  value={selectedDs}
                  onChange={(e) => setSelectedDs(e.target.value)}
                  className="bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  data-testid="dataset-selector"
                >
                  {datasets.map((ds) => (
                    <option key={ds.dataset_id} value={ds.dataset_id}>
                      {ds.filename}
                    </option>
                  ))}
                </select>
              )}
              <button
                data-testid="regenerate-insights-btn"
                onClick={handleRegenerate}
                disabled={generating || !selectedDs}
                className="bg-[#111827] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {generating ? "Analyzing..." : "Regenerate"}
              </button>
            </div>
          </motion.div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 skeleton rounded-xl" />
              ))}
            </div>
          ) : !insights ? (
            <div
              className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
              data-testid="no-insights"
            >
              <Lightbulb
                className="w-12 h-12 text-slate-300 mx-auto mb-4"
                strokeWidth={1.5}
              />
              <h2 className="font-heading text-xl font-medium text-slate-900 mb-2">
                No insights yet
              </h2>
              <p className="text-slate-500 text-sm">
                Upload data and compute metrics first, then generate AI
                insights.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overall Assessment */}
              {insights.overall_assessment && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-white to-slate-50 border border-indigo-100 rounded-xl p-6 shadow-sm"
                  data-testid="overall-assessment"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-5 h-5 text-brand" strokeWidth={1.5} />
                    <h2 className="font-heading font-medium text-slate-900">
                      Overall Assessment
                    </h2>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    {insights.overall_assessment}
                  </p>
                </motion.div>
              )}

              {/* Strategic Insights */}
              {insights.strategic_insights &&
                insights.strategic_insights.length > 0 && (
                  <div>
                    <h2 className="font-heading font-medium text-slate-900 mb-3 flex items-center gap-2">
                      <TrendingUp
                        className="w-5 h-5 text-brand"
                        strokeWidth={1.5}
                      />
                      Strategic Insights
                    </h2>
                    <div className="space-y-3">
                      {insights.strategic_insights.map((si, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-shadow"
                          onClick={() => toggleExpand(`si-${i}`)}
                          data-testid={`strategic-insight-${i}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-medium text-slate-900">
                                {si.title}
                              </h3>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${impactColors[si.impact] || impactColors.medium}`}
                              >
                                {si.impact}
                              </span>
                            </div>
                            {expanded[`si-${i}`] ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          {expanded[`si-${i}`] && (
                            <p className="mt-3 text-sm text-slate-500 leading-relaxed">
                              {si.description}
                            </p>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Red Flags */}
              {insights.red_flags && insights.red_flags.length > 0 && (
                <div>
                  <h2 className="font-heading font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <AlertTriangle
                      className="w-5 h-5 text-amber-500"
                      strokeWidth={1.5}
                    />
                    Risk Alerts
                  </h2>
                  <div className="space-y-3">
                    {insights.red_flags.map((rf, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={`border rounded-xl p-5 ${severityColors[rf.severity] || severityColors.info}`}
                        data-testid={`red-flag-${i}`}
                      >
                        <h3 className="text-sm font-medium mb-1">{rf.title}</h3>
                        <p className="text-sm opacity-80">{rf.description}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opportunities */}
              {insights.opportunities && insights.opportunities.length > 0 && (
                <div>
                  <h2 className="font-heading font-medium text-slate-900 mb-3 flex items-center gap-2">
                    <Lightbulb
                      className="w-5 h-5 text-emerald-500"
                      strokeWidth={1.5}
                    />
                    Hidden Opportunities
                  </h2>
                  <div className="space-y-3">
                    {insights.opportunities.map((op, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-white border border-emerald-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                        data-testid={`opportunity-${i}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-sm font-medium text-slate-900">
                            {op.title}
                          </h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${impactColors[op.priority] || impactColors.medium}`}
                          >
                            {op.priority}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">
                          {op.description}
                        </p>
                        {op.potential_impact && (
                          <p className="text-xs text-emerald-600 mt-2 font-medium">
                            Impact: {op.potential_impact}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
