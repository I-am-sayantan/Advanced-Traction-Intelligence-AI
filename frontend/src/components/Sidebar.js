import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Upload, Lightbulb, FileText, Sparkles, LogOut, PenLine, Users } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/upload', label: 'Upload Data', icon: Upload },
  { path: '/updates', label: 'Journal', icon: PenLine },
  { path: '/insights', label: 'AI Insights', icon: Lightbulb },
  { path: '/narrative', label: 'Narratives', icon: FileText },
  { path: '/contacts', label: 'Contacts', icon: Users },
];

export default function Sidebar({ active }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-slate-200/60 flex flex-col z-40" data-testid="sidebar">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-heading font-semibold text-base text-slate-900 tracking-tight">Founder Intel</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5" data-testid="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-light text-brand'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`
            }
            data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
          >
            <item.icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 border-t border-slate-100 pt-4">
        {user && (
          <div className="flex items-center gap-3 px-3 mb-3">
            <img
              src={user.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
          data-testid="logout-btn"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.5} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
