import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Building2 } from 'lucide-react';
import { fetchTenants } from '../../api/client';

interface Tenant {
  pk: number;
  name: string;
  alias: string;
}

interface AccountSelectProps {
  value: number | null;
  onChange: (tenant: Tenant | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  className?: string;
}

const AccountSelect: React.FC<AccountSelectProps> = ({
  value,
  onChange,
  placeholder = 'Selecionar conta...',
  allowEmpty = false,
  className = '',
}) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTenants()
      .then(setTenants)
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.alias.toLowerCase().includes(q) ||
        String(t.pk).includes(q)
    );
  }, [tenants, query]);

  const current = tenants.find((t) => t.pk === value);

  const pick = (t: Tenant | null) => {
    onChange(t);
    setOpen(false);
    setQuery('');
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-surface px-3 pr-8 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="text"
        className={inputClass}
        placeholder={current ? current.name : placeholder}
        value={open ? query : current ? current.name : ''}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        readOnly={!open}
      />
      <ChevronDown
        size={16}
        className={`absolute top-3 right-3 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-popover px-3 py-2">
            <Search size={14} className="text-muted" />
            <input
              type="text"
              autoFocus
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
              placeholder="Pesquisar conta..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted">Nenhuma conta encontrada</div>
          )}
          {allowEmpty && (
            <button
              type="button"
              onClick={() => pick(null)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface ${
                value === null ? 'bg-surface text-primary' : 'text-foreground'
              }`}
            >
              <Building2 size={14} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">Todas as contas</span>
            </button>
          )}
          {filtered.map((t) => (
            <button
              key={t.pk}
              type="button"
              onClick={() => pick(t)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface ${
                value === t.pk ? 'bg-surface text-primary' : 'text-foreground'
              }`}
            >
              <Building2 size={14} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{t.name || t.alias}</span>
              {t.alias && <span className="shrink-0 text-xs text-muted">{t.alias}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccountSelect;
