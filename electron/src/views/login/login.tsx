import React, { useEffect, useState } from 'react';
import { login as apiLogin, isOnline, getConfig } from '../../api/client';
import { Button } from '../../components/ui/button';

interface LoginProps {
  onLogin: (data: { token: string; tenant_uuid: string; tenant_pk: number }) => void;
}

const Login = ({ onLogin }: LoginProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getConfig()
      .then((cfg) => {
        if (!active) return;
        setConfigError(cfg.error);
      })
      .catch(() => {});
    const check = () => {
      isOnline()
        .then((v) => {
          if (active) setOnline(v);
        })
        .catch(() => {
          if (active) setOnline(false);
        });
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = (await apiLogin(email, password)) as {
        token: string;
        user?: { tenant_uuid: string; tenant_pk: number };
      };
      onLogin({
        token: data.token,
        tenant_uuid: data.user?.tenant_uuid ?? '',
        tenant_pk: data.user?.tenant_pk ?? 0,
      });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = e.response?.data?.error || e.message || 'Falha no login';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-zinc-950 px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-zinc-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-primary/20 bg-surface/40 p-8 shadow-lg backdrop-blur">
        <div className="mb-8 text-center">
          <img
            src="./icon.png"
            alt="Intelbras"
            className="mx-auto mb-4 h-32 w-32 object-contain"
          />
          <h1 className="text-4xl font-black tracking-[0.2em] text-primary">
            PósMobi
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-muted">
            Mobility Tools
          </p>
        </div>

        {configError && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            Configuração pendente: {configError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">
              Email
            </label>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">
              Senha
            </label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="min-h-5 text-xs text-danger" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || online === false}
          >
            {loading ? 'CONECTANDO...' : 'CONECTAR'}
          </Button>
        </form>

        <div className="mt-6">
          {online === false ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-danger">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" />
              Desconectado da internet — verifique sua conexão
            </p>
          ) : online === true ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Conectado à internet
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-muted" />
              Verificando conexão...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
