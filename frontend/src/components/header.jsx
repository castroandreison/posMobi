import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, Power } from 'lucide-react';

export const Header = ({ onLogout, onMenu }) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-zinc-950/95 px-4 backdrop-blur">
      <button
        className="rounded-lg p-2 text-muted hover:bg-surface-muted hover:text-foreground lg:hidden"
        onClick={onMenu}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <span className="text-sm font-medium text-muted">PósMobi</span>
      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm hover:bg-surface-muted"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              P
            </span>
            Perfil
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted hover:bg-surface-muted hover:text-danger"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                  navigate('/');
                }}
              >
                <Power size={16} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};