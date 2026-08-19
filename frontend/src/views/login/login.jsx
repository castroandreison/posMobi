import React, { useState } from 'react';
import { login as apiLogin } from '../../api/client.js';
import { Button } from '../../components/ui/button.jsx';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('andreison.castro@intelbras.com.br');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiLogin(email, password);
      onLogin({
        token: data.token,
        tenant_uuid: data.user?.tenant_uuid,
        tenant_pk: data.user?.tenant_pk,
      });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Falha no login';
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
          <h1 className="text-4xl font-black tracking-[0.2em] text-primary">
            PósMobi
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-muted">
            Plataforma de Monitoramento
          </p>
        </div>

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
            disabled={loading}
          >
            {loading ? 'CONECTANDO...' : 'CONECTAR'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Login;