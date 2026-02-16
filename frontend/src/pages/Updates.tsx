import React, { useState, useEffect, useCallback, ChangeEvent } from "react";
import { apiFetch } from "../api";
import Sidebar from "../components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import {
  PenLine,
  Image,
  X,
  Loader2,
  Sparkles,
  Calendar,
  Tag,
  Trash2,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import type { UpdateItem, UpdateAnalysis, ImagePreview } from "../types";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function Updates() {
  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [posting, setPosting] = useState(false);
  const [analysis, setAnalysis] = useState<UpdateAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDays, setAnalysisDays] = useState(7);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const fetchUpdates = useCallback(async () => {
    try {
      const data = await apiFetch<UpdateItem[]>("/api/updates");
      setUpdates(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + images.length > 3) {
      toast.error("Max 3 images per update");
      return;
    }
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImages((prev) => [
          ...prev,
          { file, preview: ev.target?.result as string, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePost = async () => {
    if (!content.trim()) {
      toast.error("Write something first");
      return;
    }
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append("content", content);
      formData.append("tags", tags);
      images.forEach((img, i) => formData.append(`image_${i}`, img.file));

      const res = await fetch(`${API_URL}/api/updates`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to post update");
      const result: UpdateItem = await res.json();
      setUpdates((prev) => [result, ...prev]);
      setContent("");
      setTags("");
      setImages([]);
      toast.success("Update posted!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (updateId: string) => {
    try {
      await apiFetch(`/api/updates/${updateId}`, { method: "DELETE" });
      setUpdates((prev) => prev.filter((u) => u.update_id !== updateId));
      toast.success("Update deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const data = await apiFetch<{ analysis: UpdateAnalysis }>(
        "/api/updates/ai-analyze",
        {
          method: "POST",
          body: JSON.stringify({ days: analysisDays }),
        },
      );
      setAnalysis(data.analysis);
      setShowAnalysis(true);
      toast.success("Analysis complete!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const momentumColors: Record<string, string> = {
    positive: "bg-emerald-50 text-emerald-700 border-emerald-100",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    negative: "bg-red-50 text-red-700 border-red-100",
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex min-h-screen bg-page" data-testid="updates-page">
      <Sidebar active="updates" />
      <main className="flex-1 ml-64 p-8">
        <Toaster position="top-right" richColors />
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <h1
                className="font-heading text-3xl font-semibold text-slate-900 tracking-tight"
                data-testid="updates-title"
              >
                Startup Journal
              </h1>
              <p className="text-slate-500 mt-1">
                Daily updates — AI learns your story and surfaces trends
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={analysisDays}
                onChange={(e) => setAnalysisDays(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-md px-3 py-2 text-sm"
                data-testid="analysis-days-select"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="bg-[#111827] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                data-testid="analyze-updates-btn"
              >
                {analyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {analyzing ? "Analyzing..." : "AI Analyze"}
              </button>
            </div>
          </motion.div>

          {/* AI Analysis Panel */}
          <AnimatePresence>
            {showAnalysis && analysis && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden"
              >
                <div
                  className="bg-gradient-to-br from-white to-slate-50 border border-indigo-100 rounded-xl p-6 shadow-sm"
                  data-testid="ai-analysis-panel"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className="w-5 h-5 text-brand"
                        strokeWidth={1.5}
                      />
                      <h2 className="font-heading font-medium text-slate-900">
                        AI Journal Analysis
                      </h2>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${momentumColors[analysis.momentum_signal] || momentumColors.neutral}`}
                      >
                        {analysis.momentum_signal} momentum
                      </span>
                    </div>
                    <button
                      onClick={() => setShowAnalysis(false)}
                      className="text-slate-400 hover:text-slate-600"
                      data-testid="close-analysis-btn"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    {analysis.summary}
                  </p>

                  {analysis.key_themes?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Key Themes
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.key_themes.map((t, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-brand-light text-brand border border-brand/10 font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.recommended_update_for_investors && (
                    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Recommended Investor Update
                      </h4>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {analysis.recommended_update_for_investors}
                      </p>
                    </div>
                  )}

                  {analysis.trend_observations?.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Trend Observations
                      </h4>
                      <div className="space-y-2">
                        {analysis.trend_observations.map((t, i) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <TrendingUp
                              className="w-4 h-4 text-brand shrink-0 mt-0.5"
                              strokeWidth={1.5}
                            />
                            <div>
                              <span className="font-medium text-slate-900">
                                {t.observation}
                              </span>
                              <span className="text-slate-500">
                                {" "}
                                — {t.implication}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.action_items?.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        Action Items
                      </h4>
                      <div className="space-y-1.5">
                        {analysis.action_items.map((a, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-sm text-slate-600"
                          >
                            <ArrowRight
                              className="w-3.5 h-3.5 text-brand"
                              strokeWidth={2}
                            />
                            <span>{a}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Compose */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] mb-6"
            data-testid="compose-update"
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What happened today? Share wins, challenges, metrics, learnings..."
              className="w-full bg-transparent border-0 text-sm text-slate-900 placeholder:text-slate-400 resize-none h-28 focus:outline-none focus:ring-0 leading-relaxed"
              data-testid="update-content-input"
            />
            {/* Image Previews */}
            {images.length > 0 && (
              <div className="flex gap-2 mb-3">
                {images.map((img, i) => (
                  <div
                    key={i}
                    className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200"
                  >
                    <img
                      src={img.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() =>
                        setImages((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                      data-testid={`remove-image-${i}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <div className="flex items-center gap-3">
                <label
                  className="cursor-pointer text-slate-400 hover:text-slate-600 transition-colors inline-flex items-center gap-1.5 text-xs font-medium"
                  data-testid="add-image-btn"
                >
                  <Image className="w-4 h-4" strokeWidth={1.5} />
                  Image
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                  />
                </label>
                <div className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-slate-400" strokeWidth={1.5} />
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="Tags (comma-separated)"
                    className="text-xs bg-transparent border-0 text-slate-600 placeholder:text-slate-400 focus:outline-none w-40"
                    data-testid="update-tags-input"
                  />
                </div>
              </div>
              <button
                onClick={handlePost}
                disabled={posting || !content.trim()}
                className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-hover active:scale-95 transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                data-testid="post-update-btn"
              >
                {posting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PenLine className="w-4 h-4" />
                )}
                {posting ? "Posting..." : "Post Update"}
              </button>
            </div>
          </motion.div>

          {/* Timeline */}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 skeleton rounded-xl" />
              ))}
            </div>
          ) : updates.length === 0 ? (
            <div
              className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
              data-testid="empty-updates"
            >
              <PenLine
                className="w-12 h-12 text-slate-300 mx-auto mb-4"
                strokeWidth={1.5}
              />
              <h2 className="font-heading text-xl font-medium text-slate-900 mb-2">
                Start your journal
              </h2>
              <p className="text-sm text-slate-500">
                Write your first update. AI will learn your story over time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {updates.map((update, i) => (
                <motion.div
                  key={update.update_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-shadow"
                  data-testid={`update-card-${i}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {formatDate(update.created_at)}
                    </div>
                    <button
                      onClick={() => handleDelete(update.update_id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                      data-testid={`delete-update-${i}`}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {update.content}
                  </p>
                  {update.images && update.images.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {update.images.map((img, j) => (
                        <img
                          key={j}
                          src={`data:${img.type};base64,${img.data}`}
                          alt=""
                          className="w-24 h-24 rounded-lg object-cover border border-slate-200"
                        />
                      ))}
                    </div>
                  )}
                  {update.tags && update.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {update.tags.map((tag, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600 font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
