import React, { useState } from 'react';
import { NavLink } from 'react-router';
import { LayoutDashboard, List, UploadCloud, History, ChevronDown } from 'lucide-react';

const NAV = [
  { to: '/dash', label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/firmware',
    label: 'Firmware',
    icon: UploadCloud,
    children: [{ to: '/firmware/history', label: 'Histórico', icon: History }],
  },
  { to: '/log', label: 'Log', icon: List },
];

export const Sidebar = ({ open, onClose }) => {
  const [openMenus, setOpenMenus] = useState({});

  const toggleMenu = (key) =>
    setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));

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
              {item.children ? (
                <>
                  <NavLink
                    to={item.to}
                    onClick={() => toggleMenu(item.to)}
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
                    <ChevronDown
                      size={14}
                      className={`ml-auto transition-transform ${
                        openMenus[item.to] ? 'rotate-180' : ''
                      }`}
                    />
                  </NavLink>
                  {openMenus[item.to] && (
                    <div className="space-y-1">
                      {item.children.map((child) => (
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
                  )}
                </>
              ) : (
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
              )}
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