import React from 'react';
import { NavLink } from 'react-router';
import { LayoutDashboard, List, UploadCloud, History } from 'lucide-react';

const NAV = [
  { to: '/dash', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log', label: 'Log', icon: List },
  {
    to: '/firmware',
    label: 'Firmware',
    icon: UploadCloud,
    children: [{ to: '/firmware/history', label: 'Histórico', icon: History }],
  },
];

export const Sidebar = ({ open, onClose }) => {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-zinc-950 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <span className="text-lg font-black tracking-widest text-primary">
            PósMobi
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Monitor
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <div key={item.to} className="space-y-1">
              <NavLink
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted hover:bg-surface-muted hover:text-foreground'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
              {item.children?.map((child) => (
                <NavLink
                  key={child.to}
                  to={child.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg py-2 pr-3 pl-10 text-sm transition-colors ${
                      isActive
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted hover:bg-surface-muted hover:text-foreground'
                    }`
                  }
                >
                  <child.icon size={16} />
                  {child.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-border p-4 text-xs text-muted">
          Estações de recarga Intelbras
        </div>
      </aside>
    </>
  );
};