import React from 'react';
import { motion } from 'framer-motion';

export default function ScoreCard({ label, value, color, delay = 0 }) {
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (value / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-shadow duration-300 flex flex-col items-center"
      data-testid={`score-card-${label.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="relative w-20 h-20 mb-3">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#F3F4F6" strokeWidth="5" />
          <motion.circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, delay: delay + 0.2, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-lg font-semibold text-slate-900">{Math.round(value)}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-slate-500 text-center">{label}</span>
    </motion.div>
  );
}
