import React, { useState } from 'react';

const Login = ({ onLogin }) => {
    const [email, setEmail] = useState('cve-api@intelbras.com.br');
    const [password, setPassword] = useState('cve-api');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const r = await fetch('/login-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await r.json().catch(() => ({}));
            if (r.status === 200) {
                onLogin({
                    token: data.token,
                    tenant_uuid: data.user?.tenant_uuid,
                    tenant_pk: data.user?.tenant_pk,
                });
            } else {
                setError(data.error || `Falha no login (HTTP ${r.status})`);
            }
        } catch (e) {
            setError(e.message || 'Falha no login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="d-flex align-items-center justify-content-center"
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
                position: 'relative',
            }}
        >
            <div
                className="card w-100"
                style={{
                    maxWidth: 400,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(100,167,11,0.2)',
                    borderRadius: 16,
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div className="card-body text-center p-4">
                    <div className="mb-3">
                        <div
                            style={{
                                fontSize: 40,
                                fontWeight: 800,
                                color: '#64A70B',
                                letterSpacing: 4,
                                textShadow: '0 0 20px rgba(100,167,11,0.3)',
                            }}
                        >
                            PósMobi
                        </div>
                        <div
                            className="text-uppercase"
                            style={{ fontSize: 12, letterSpacing: 4, color: '#888' }}
                        >
                            Plataforma de Monitoramento
                        </div>
                    </div>
                    <form onSubmit={handleSubmit} autoComplete="off">
                        <div className="mb-3 text-start">
                            <label
                                className="text-uppercase"
                                style={{ fontSize: 12, letterSpacing: 1, color: '#888' }}
                            >
                                Email
                            </label>
                            <input
                                type="email"
                                className="form-control"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                style={{
                                    background: 'rgba(0,0,0,0.4)',
                                    color: '#e0e0e0',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            />
                        </div>
                        <div className="mb-3 text-start">
                            <label
                                className="text-uppercase"
                                style={{ fontSize: 12, letterSpacing: 1, color: '#888' }}
                            >
                                Senha
                            </label>
                            <input
                                type="password"
                                className="form-control"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{
                                    background: 'rgba(0,0,0,0.4)',
                                    color: '#e0e0e0',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}
                            />
                        </div>
                        {error && (
                            <div
                                className="text-danger mb-3"
                                style={{ fontSize: 13, minHeight: 20 }}
                            >
                                {error}
                            </div>
                        )}
                        <button
                            type="submit"
                            className="btn w-100"
                            disabled={loading}
                            style={{
                                background: 'linear-gradient(135deg, rgba(100,167,11,0.15), rgba(100,167,11,0.05))',
                                border: '1px solid #64A70B',
                                color: '#64A70B',
                                letterSpacing: 2,
                                fontWeight: 700,
                            }}
                        >
                            {loading ? 'CONECTANDO...' : 'CONECTAR'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
