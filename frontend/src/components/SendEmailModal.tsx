import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { motion } from "framer-motion";
import { X, Send, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import type { Contact, Narrative, EmailSendResult } from "../types";

interface SendEmailModalProps {
  contactIds: string[];
  contacts: Contact[];
  onClose: () => void;
  onSent: () => void;
}

export default function SendEmailModal({
  contactIds,
  contacts,
  onClose,
  onSent,
}: SendEmailModalProps) {
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [narratives, setNarratives] = useState<Narrative[]>([]);
  const [selectedNarrative, setSelectedNarrative] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailSendResult | null>(null);

  useEffect(() => {
    apiFetch<Narrative[]>("/api/narratives")
      .then(setNarratives)
      .catch(() => {});
  }, []);

  const handleSelectNarrative = (narrativeId: string) => {
    setSelectedNarrative(narrativeId);
    const nar = narratives.find((n) => n.narrative_id === narrativeId);
    if (nar) {
      setSubject(nar.title || "Investor Update");
      const md = nar.content || "";
      const html = md
        .replace(
          /^### (.*$)/gim,
          '<h3 style="font-size:16px;font-weight:600;margin:16px 0 8px;">$1</h3>',
        )
        .replace(
          /^## (.*$)/gim,
          '<h2 style="font-size:18px;font-weight:600;margin:20px 0 10px;">$1</h2>',
        )
        .replace(
          /^# (.*$)/gim,
          '<h1 style="font-size:22px;font-weight:700;margin:24px 0 12px;">$1</h1>',
        )
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/^- (.*$)/gim, '<li style="margin:4px 0;">$1</li>')
        .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
        .replace(/\n/g, "<br/>");
      setHtmlContent(
        `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:600px;"><p style="margin:12px 0;line-height:1.6;">${html}</p></div>`,
      );
    }
  };

  const handleSend = async () => {
    if (!subject || !htmlContent) {
      toast.error("Subject and content required");
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch<EmailSendResult>("/api/email/send", {
        method: "POST",
        body: JSON.stringify({
          contact_ids: contactIds,
          subject,
          html_content: htmlContent,
          narrative_id: selectedNarrative || null,
        }),
      });
      setResult(res);
      toast.success(`Sent to ${res.sent} contact${res.sent !== 1 ? "s" : ""}`);
      setTimeout(onSent, 1500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      data-testid="send-email-modal"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="font-heading font-medium text-slate-900">
              Send Email
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              To {contacts.length} recipient{contacts.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            data-testid="close-email-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Recipients */}
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">
              Recipients
            </label>
            <div className="flex flex-wrap gap-1.5">
              {contacts.map((c) => (
                <span
                  key={c.contact_id}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {c.name} ({c.email})
                </span>
              ))}
            </div>
          </div>

          {/* Load from Narrative */}
          {narratives.length > 0 && (
            <div>
              <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">
                Load from Narrative (Optional)
              </label>
              <select
                value={selectedNarrative}
                onChange={(e) => handleSelectNarrative(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                data-testid="select-narrative-for-email"
              >
                <option value="">Write custom email...</option>
                {narratives.map((n) => (
                  <option key={n.narrative_id} value={n.narrative_id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Investor Update — January 2026"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
              data-testid="email-subject-input"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">
              Content (HTML)
            </label>
            <textarea
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
              placeholder="<p>Hi there, here's our latest update...</p>"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400 font-mono h-48 resize-none"
              data-testid="email-content-input"
            />
          </div>

          {/* Result */}
          {result && (
            <div
              className="bg-emerald-50 border border-emerald-100 rounded-lg p-4"
              data-testid="email-send-result"
            >
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">
                  Sent to {result.sent} recipient{result.sent !== 1 ? "s" : ""}
                </span>
              </div>
              {result.failed > 0 && (
                <p className="text-xs text-red-600">{result.failed} failed</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !subject || !htmlContent}
            className="bg-brand text-white px-5 py-2.5 rounded-md text-sm font-medium hover:bg-brand-hover active:scale-95 transition-all shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
            data-testid="send-email-btn"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
