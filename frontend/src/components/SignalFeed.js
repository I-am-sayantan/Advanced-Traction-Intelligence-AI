import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingUp, Lightbulb } from 'lucide-react';

export default function SignalFeed({ insights }) {
  if (!insights) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]" data-testid="signal-feed-empty">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4">Signal Feed</h3>
        <p className="text-sm text-slate-400">No signals yet. Upload data and generate insights.</p>
      </div>
    );
  }

  const signals = [];

  insights.strategic_insights?.slice(0, 2).forEach((si, i) => {
    signals.push({ type: 'insight', icon: TrendingUp, color: 'text-brand', bg: 'bg-brand-light', title: si.title, desc: si.description });
  });

  insights.red_flags?.slice(0, 2).forEach((rf) => {
    signals.push({ type: 'risk', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', title: rf.title, desc: rf.description });
  });

  insights.opportunities?.slice(0, 2).forEach((op) => {
    signals.push({ type: 'opportunity', icon: Lightbulb, color: 'text-emerald-600', bg: 'bg-emerald-50', title: op.title, desc: op.description });
  });

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)]" data-testid="signal-feed">
      <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-4">Signal Feed</h3>
      <div className="space-y-3">
        {signals.slice(0, 5).map((sig, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex gap-3"
            data-testid={`signal-${i}`}
          >
            <div className={`w-8 h-8 ${sig.bg} rounded-lg flex items-center justify-center shrink-0`}>
              <sig.icon className={`w-4 h-4 ${sig.color}`} strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{sig.title}</p>
              <p className="text-xs text-slate-400 line-clamp-2">{sig.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
