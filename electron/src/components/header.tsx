import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Menu, Power } from 'lucide-react';

interface HeaderProps {
  onLogout: () => void;
  onMenu: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onLogout, onMenu }) => {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const check = () => {
      window.electronAPI.isOnline().then((v) => {
        if (active) setOnline(v);
      }).catch(() => {});
    };
    check();
    const timer = setInterval(check, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

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
      <div className="ml-auto flex items-center gap-3">
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            online === false
              ? 'border-danger/40 bg-danger/10 text-danger'
              : online === true
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-border bg-surface-muted text-muted'
          }`}
          title={online === false ? 'Desconectado da internet' : 'Conectado'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              online === false ? 'bg-danger' : online === true ? 'bg-success' : 'bg-muted'
            }`}
          />
          {online === false ? 'Offline' : online === true ? 'Online' : 'Verificando...'}
        </span>
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
