import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import Sidebar from '../components/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Loader2, Sparkles, Copy, Check, Mail, BarChart3, TrendingUp, Calendar } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Toaster, toast } from 'sonner';

const NARRATIVE_TYPES = [
  { id: 'traction_statement', label: 'Traction Statement', icon: TrendingUp, desc: 'One-line killer pitch + expansion' },
  { id: 'vc_email', label: 'VC Update Email', icon: Mail, desc: 'Professional investor update email' },
  { id: 'executive_summary', label: 'Executive Summary', icon: BarChart3, desc: 'Board-ready summary with metrics' },
  { id: 'monthly_update', label: 'Monthly Update', icon: Calendar, desc: 'Comprehensive monthly report' },
];

export default function NarrativeGenerator() {
  const [datasets, setDatasets] = useState([]);
  const [selectedDs, setSelectedDs] = useState('');
  const [selectedType, setSelectedType] = useState('traction_statement');
  const [customContext, setCustomContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [narrative, setNarrative] = useState(null);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ds, narr] = await Promise.all([
          apiFetch('/api/data/datasets'),
          apiFetch('/api/narratives'),
        ]);
        setDatasets(ds);
        setHistory(narr);
        if (ds.length > 0) setSelectedDs(ds[0].dataset_id);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const handleGenerate = async () => {
    if (!selectedDs) return;
    setGenerating(true);
    try {
      const result = await apiFetch('/api/narrative/generate', {
        method: 'POST',
        body: JSON.stringify({
          dataset_id: selectedDs,
          narrative_type: selectedType,
          custom_context: customContext || null,
        }),
      });
      setNarrative(result);
      setHistory(prev => [result, ...prev]);
      toast.success('Narrative generated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!narrative?.content) return;
    navigator.clipboard.writeText(narrative.content);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen bg-page" data-testid="narrative-page">
      <Sidebar active="narrative" />
      <main className="flex-1 ml-64 p-8">
        <Toaster position="top-right" richColors />
        <div className="max-w-7xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="font-heading text-3xl font-semibold text-slate-900 tracking-tight" data-testid="narrative-title">Narrative Generator</h1>
            <p className="text-slate-500 mt-1">AI-powered funding narratives from your growth data</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Controls */}
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-4 space-y-5">
              {/* Dataset */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">Dataset</label>
                <select
                  value={selectedDs}
                  onChange={(e) => setSelectedDs(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  data-testid="narrative-dataset-selector"
                >
                  <option value="">Select dataset...</option>
                  {datasets.map(ds => (
                    <option key={ds.dataset_id} value={ds.dataset_id}>{ds.filename}</option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3 block">Narrative Type</label>
                <div className="space-y-2">
                  {NARRATIVE_TYPES.map(nt => (
                    <button
                      key={nt.id}
                      onClick={() => setSelectedType(nt.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-all ${
                        selectedType === nt.id
                          ? 'bg-brand-light border border-brand/20 text-brand'
                          : 'bg-slate-50 border border-transparent text-slate-600 hover:bg-slate-100'
                      }`}
                      data-testid={`narrative-type-${nt.id}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <nt.icon className="w-4 h-4" strokeWidth={1.5} />
                        <div>
                          <div className="font-medium">{nt.label}</div>
                          <div className="text-xs opacity-70 mt-0.5">{nt.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Context */}
              <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                <label className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 block">Additional Context (Optional)</label>
                <textarea
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  placeholder="E.g., We just closed a key enterprise deal with..."
                  className="w-full bg-white border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none h-24 placeholder:text-slate-400"
                  data-testid="narrative-context-input"
                />
              </div>

              <button
                data-testid="generate-narrative-btn"
                onClick={handleGenerate}
                disabled={generating || !selectedDs}
                className="w-full bg-brand text-white px-6 py-3.5 rounded-xl text-sm font-medium hover:bg-brand-hover active:scale-[0.98] transition-all shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Narrative
                  </>
                )}
              </button>
            </motion.div>

            {/* Preview */}
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {narrative ? (
                  <motion.div
                    key="narrative"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-white border border-slate-100 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                    data-testid="narrative-output"
                  >
                    <div className="flex items-center justify-between p-5 border-b border-slate-100">
                      <div>
                        <h3 className="font-heading font-medium text-slate-900">{narrative.title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{NARRATIVE_TYPES.find(t => t.id === narrative.type)?.label}</p>
                      </div>
                      <button
                        onClick={handleCopy}
                        className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-100 transition-colors inline-flex items-center gap-1.5"
                        data-testid="copy-narrative-btn"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="p-6 prose prose-sm prose-slate max-w-none" data-testid="narrative-content">
                      <ReactMarkdown>{narrative.content}</ReactMarkdown>
                    </div>
                    {narrative.key_highlights?.length > 0 && (
                      <div className="px-6 pb-6">
                        <h4 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2">Key Highlights</h4>
                        <div className="flex flex-wrap gap-2">
                          {narrative.key_highlights.map((h, i) => (
                            <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-brand-light text-brand border border-brand/10 font-medium">
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                    data-testid="narrative-empty-state"
                  >
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <FileText className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
                    </div>
                    <h2 className="font-heading text-xl font-medium text-slate-900 mb-2">Your narrative will appear here</h2>
                    <p className="text-sm text-slate-500 max-w-sm mx-auto">Select a dataset and narrative type, then generate investor-grade content.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* History */}
              {history.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">Recent Narratives</h3>
                  <div className="space-y-2">
                    {history.slice(0, 5).map((n, i) => (
                      <button
                        key={n.narrative_id || i}
                        onClick={() => setNarrative(n)}
                        className="w-full text-left bg-white border border-slate-100 rounded-lg px-4 py-3 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-shadow"
                        data-testid={`narrative-history-${i}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-700 truncate">{n.title}</div>
                          <span className="text-xs text-slate-400 shrink-0 ml-2">{NARRATIVE_TYPES.find(t => t.id === n.type)?.label}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
