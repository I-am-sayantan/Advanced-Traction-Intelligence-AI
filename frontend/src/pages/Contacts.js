import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, apiUpload } from '../api';
import Sidebar from '../components/Sidebar';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Upload, Search, Tag, Mail, Trash2, Edit3, X, Check, Loader2, Users, Building2, Send } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import SendEmailModal from '../components/SendEmailModal';

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showEmail, setShowEmail] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', tags: '', notes: '' });

  const fetchData = useCallback(async () => {
    try {
      const [contactsData, tagsData] = await Promise.all([
        apiFetch(`/api/contacts${filterTag ? `?tag=${encodeURIComponent(filterTag)}` : ''}`),
        apiFetch('/api/contacts/tags'),
      ]);
      setContacts(contactsData);
      setTags(tagsData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filterTag]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = contacts.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || c.company?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async () => {
    if (!form.name || !form.email) { toast.error('Name and email required'); return; }
    try {
      const tagsList = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const result = await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ ...form, tags: tagsList }),
      });
      setContacts(prev => [...prev, result].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', email: '', company: '', role: '', tags: '', notes: '' });
      setShowAdd(false);
      toast.success('Contact added!');
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async (contactId) => {
    try {
      const tagsList = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const result = await apiFetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, tags: tagsList }),
      });
      setContacts(prev => prev.map(c => c.contact_id === contactId ? result : c));
      setEditingId(null);
      setForm({ name: '', email: '', company: '', role: '', tags: '', notes: '' });
      toast.success('Contact updated!');
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (contactId) => {
    try {
      await apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      setContacts(prev => prev.filter(c => c.contact_id !== contactId));
      selected.delete(contactId);
      setSelected(new Set(selected));
      toast.success('Contact deleted');
    } catch (err) { toast.error(err.message); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await apiUpload('/api/contacts/import', file);
      toast.success(`Imported ${result.imported} contacts (${result.skipped} skipped)`);
      fetchData();
    } catch (err) { toast.error(err.message); }
  };

  const startEdit = (c) => {
    setEditingId(c.contact_id);
    setForm({ name: c.name, email: c.email, company: c.company || '', role: c.role || '', tags: c.tags?.join(', ') || '', notes: c.notes || '' });
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(c => c.contact_id)));
    }
  };

  return (
    <div className="flex min-h-screen bg-page" data-testid="contacts-page">
      <Sidebar active="contacts" />
      <main className="flex-1 ml-64 p-8">
        <Toaster position="top-right" richColors />
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
            <div>
              <h1 className="font-heading text-3xl font-semibold text-slate-900 tracking-tight" data-testid="contacts-title">Contacts</h1>
              <p className="text-slate-500 mt-1">Manage your VC and client network</p>
            </div>
            <div className="flex items-center gap-3">
              {selected.size > 0 && (
                <button
                  onClick={() => setShowEmail(true)}
                  className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-hover active:scale-95 transition-all shadow-sm inline-flex items-center gap-2"
                  data-testid="send-email-to-selected-btn"
                >
                  <Send className="w-4 h-4" />
                  Email {selected.size} Contact{selected.size > 1 ? 's' : ''}
                </button>
              )}
              <label className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-50 transition-all shadow-sm cursor-pointer inline-flex items-center gap-2" data-testid="import-contacts-btn">
                <Upload className="w-4 h-4" />
                Import CSV
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} />
              </label>
              <button
                onClick={() => { setShowAdd(true); setEditingId(null); setForm({ name: '', email: '', company: '', role: '', tags: '', notes: '' }); }}
                className="bg-[#111827] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black/90 active:scale-95 transition-all shadow-sm inline-flex items-center gap-2"
                data-testid="add-contact-btn"
              >
                <UserPlus className="w-4 h-4" />
                Add Contact
              </button>
            </div>
          </motion.div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" strokeWidth={1.5} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                data-testid="search-contacts-input"
              />
            </div>
            {tags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilterTag('')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${!filterTag ? 'bg-brand-light text-brand' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                  data-testid="filter-all"
                >
                  All
                </button>
                {tags.slice(0, 6).map(t => (
                  <button
                    key={t.tag}
                    onClick={() => setFilterTag(filterTag === t.tag ? '' : t.tag)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${filterTag === t.tag ? 'bg-brand-light text-brand' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                    data-testid={`filter-tag-${t.tag}`}
                  >
                    {t.tag} ({t.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Add/Edit Form */}
          <AnimatePresence>
            {(showAdd || editingId) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-5 overflow-hidden"
              >
                <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]" data-testid="contact-form">
                  <h3 className="font-heading font-medium text-slate-900 mb-4">{editingId ? 'Edit Contact' : 'Add Contact'}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name *" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-name-input" />
                    <input value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email *" type="email" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-email-input" />
                    <input value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-company-input" />
                    <input value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Role (e.g., Partner, Analyst)" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-role-input" />
                    <input value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="Tags (VC, Client, Advisor...)" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-tags-input" />
                    <input value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400" data-testid="contact-notes-input" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => editingId ? handleUpdate(editingId) : handleAdd()}
                      className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-hover active:scale-95 transition-all inline-flex items-center gap-2"
                      data-testid="save-contact-btn"
                    >
                      <Check className="w-4 h-4" /> {editingId ? 'Update' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setShowAdd(false); setEditingId(null); }}
                      className="text-slate-500 hover:text-slate-700 px-3 py-2 text-sm"
                      data-testid="cancel-contact-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Contacts Table */}
          {loading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 skeleton rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-xl p-12 text-center shadow-[0_2px_4px_rgba(0,0,0,0.02)]" data-testid="empty-contacts">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
              <h2 className="font-heading text-xl font-medium text-slate-900 mb-2">No contacts yet</h2>
              <p className="text-sm text-slate-500">Add VCs, clients, and advisors to manage your network.</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-[0_2px_4px_rgba(0,0,0,0.02)]" data-testid="contacts-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-3 w-10">
                      <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded border-slate-300 text-brand focus:ring-brand" data-testid="select-all-checkbox" />
                    </th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500">Name</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500">Email</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 hidden md:table-cell">Company</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 hidden lg:table-cell">Tags</th>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-semibold text-slate-500 hidden lg:table-cell">Sent</th>
                    <th className="text-right px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <motion.tr
                      key={c.contact_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                      data-testid={`contact-row-${i}`}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(c.contact_id)} onChange={() => toggleSelect(c.contact_id)} className="rounded border-slate-300 text-brand focus:ring-brand" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{c.name}</div>
                        {c.role && <div className="text-xs text-slate-400">{c.role}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">{c.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{c.company || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.tags?.map((tag, j) => (
                            <span key={j} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono hidden lg:table-cell">{c.emails_sent || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(c)} className="p-1.5 text-slate-400 hover:text-brand transition-colors" data-testid={`edit-contact-${i}`}>
                            <Edit3 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button onClick={() => handleDelete(c.contact_id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" data-testid={`delete-contact-${i}`}>
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
                <span className="text-xs text-slate-500">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</span>
                {selected.size > 0 && <span className="text-xs text-brand font-medium">{selected.size} selected</span>}
              </div>
            </div>
          )}
        </div>

        {/* Send Email Modal */}
        {showEmail && (
          <SendEmailModal
            contactIds={Array.from(selected)}
            contacts={contacts.filter(c => selected.has(c.contact_id))}
            onClose={() => setShowEmail(false)}
            onSent={() => { setShowEmail(false); setSelected(new Set()); fetchData(); }}
          />
        )}
      </main>
    </div>
  );
}
