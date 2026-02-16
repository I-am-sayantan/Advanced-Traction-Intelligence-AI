import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { apiUpload, apiFetch } from "../api";
import Sidebar from "../components/Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  Check,
  Loader2,
  ArrowRight,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import type { UploadResult } from "../types";

export default function DataUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [computing, setComputing] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setUploadResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await apiUpload<UploadResult>("/api/data/upload", file);
      setUploadResult(result);
      toast.success("File uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleComputeAndAnalyze = async () => {
    if (!uploadResult?.dataset_id) return;
    setComputing(true);
    try {
      await apiFetch(`/api/metrics/compute/${uploadResult.dataset_id}`, {
        method: "POST",
      });
      toast.success("Metrics computed!");
      await apiFetch(`/api/insights/generate/${uploadResult.dataset_id}`, {
        method: "POST",
      });
      toast.success("AI insights generated!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-page" data-testid="upload-page">
      <Sidebar active="upload" />
      <main className="flex-1 ml-64 p-8">
        <Toaster position="top-right" richColors />
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1
              className="font-heading text-3xl font-semibold text-slate-900 tracking-tight mb-2"
              data-testid="upload-title"
            >
              Upload Data
            </h1>
            <p className="text-slate-500 mb-8">
              Upload your startup metrics in CSV or Excel format
            </p>
          </motion.div>

          {/* Dropzone */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                isDragActive
                  ? "border-brand bg-brand-light"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              data-testid="upload-dropzone"
            >
              <input {...getInputProps()} data-testid="upload-input" />
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-slate-400" strokeWidth={1.5} />
              </div>
              <p className="text-slate-700 font-medium mb-1">
                {isDragActive
                  ? "Drop your file here"
                  : "Drag & drop your file here"}
              </p>
              <p className="text-sm text-slate-400">
                CSV, XLS, or XLSX up to 10MB
              </p>
            </div>
          </motion.div>

          {/* Selected File */}
          <AnimatePresence>
            {file && !uploadResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)] flex items-center justify-between"
                data-testid="selected-file-card"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-light rounded-lg flex items-center justify-center">
                    <FileSpreadsheet
                      className="w-5 h-5 text-brand"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setFile(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                    data-testid="remove-file-btn"
                  >
                    <X className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <button
                    data-testid="upload-file-btn"
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-[#111827] text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {uploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Result */}
          <AnimatePresence>
            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-4"
              >
                <div
                  className="bg-emerald-50 border border-emerald-100 rounded-xl p-5"
                  data-testid="upload-success-card"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Check
                      className="w-5 h-5 text-emerald-600"
                      strokeWidth={2}
                    />
                    <h3 className="font-heading font-medium text-emerald-800">
                      File uploaded successfully
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Filename</span>
                      <p className="text-slate-900 font-medium">
                        {uploadResult.filename}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Rows</span>
                      <p className="text-slate-900 font-medium">
                        {uploadResult.row_count}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Columns</span>
                      <p className="text-slate-900 font-medium">
                        {uploadResult.columns?.length}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Numeric Columns</span>
                      <p className="text-slate-900 font-medium">
                        {uploadResult.numeric_columns?.length}
                      </p>
                    </div>
                  </div>
                  {uploadResult.columns && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {uploadResult.columns.map((col) => (
                        <span
                          key={col}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-white border border-emerald-200 text-emerald-700 font-mono"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  data-testid="compute-analyze-btn"
                  onClick={handleComputeAndAnalyze}
                  disabled={computing}
                  className="w-full bg-brand text-white px-6 py-3.5 rounded-xl text-sm font-medium hover:bg-brand-hover active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {computing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Computing Metrics & Generating Insights...
                    </>
                  ) : (
                    <>
                      Compute Metrics & Generate Insights
                      <ArrowRight className="w-4 h-4" strokeWidth={2} />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Help */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
          >
            <h3 className="font-heading font-medium text-slate-900 mb-3">
              What data works best?
            </h3>
            <ul className="space-y-2 text-sm text-slate-500">
              <li className="flex items-start gap-2">
                <span className="text-brand mt-1">1.</span>
                <span>
                  Monthly metrics with a date/period column (e.g., month, date,
                  quarter)
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-1">2.</span>
                <span>
                  Revenue columns named: revenue, mrr, arr, income, sales
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-1">3.</span>
                <span>Cost columns named: cost, expense, spend, burn, cac</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand mt-1">4.</span>
                <span>User columns named: users, customers, subscribers</span>
              </li>
            </ul>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
