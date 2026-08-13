import React, { useEffect, useRef, useState } from 'react';

const statusClass = (status) => {
    if (status === 'Available') return { label: 'Disponível', cls: 'badge-success' };
    if (status === 'Occupied' || status === 'Charging') return { label: 'Ocupado', cls: 'badge-danger' };
    if (status === 'Preparing' || status === 'Finishing') return { label: 'Preparando', cls: 'badge-warning' };
    if (status === 'Faulted') return { label: 'Falha', cls: 'badge-danger' };
    return { label: status || 'Desconhecido', cls: 'badge-secondary' };
};

const Dashboard = () => {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [auto, setAuto] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(null);
    const timerRef = useRef(null);

    const loadStations = async () => {
        setLoading(true);
        setError('');
        try {
            const r = await fetch('/api/v1/chargepoints', { headers: { Accept: '*/*' } });
            if (r.status === 401) throw new Error('Sessão expirada');
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            setStations(d.chargePointList || []);
            setLastUpdate(new Date());
        } catch (e) {
            setError(e.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStations();
        timerRef.current = setInterval(loadStations, 30000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    useEffect(() => {
        if (!auto) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }
        timerRef.current = setInterval(loadStations, 30000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [auto]);

    const byModel = {};
    stations.forEach((s) => {
        const model = s.chargePointModel || 'Sem modelo';
        if (!byModel[model]) byModel[model] = [];
        byModel[model].push(s);
    });
    const modelKeys = Object.keys(byModel).sort();

    const stationStatus = (s) => {
        const connectors = s.connectors || [];
        if (!connectors.length) return { label: 'Sem conector', cls: 'badge-secondary' };
        const statuses = connectors
            .map((c) => (c.lastStatus ? c.lastStatus.status : null))
            .filter(Boolean);
        if (!statuses.length) return { label: 'Sem status', cls: 'badge-secondary' };
        if (statuses.some((x) => x === 'Occupied' || x === 'Charging')) {
            return { label: 'Ocupado', cls: 'badge-danger' };
        }
        return statusClass(statuses[0]);
    };

    const fmtDate = (ts) => {
        if (!ts) return '—';
        return ts;
    };

    return (
        <div>
            <div className="row">
                <div className="col-12">
                    <div className="card">
                        <div className="card-body">
                            <div className="d-flex align-items-center justify-content-between flex-wrap mb-3">
                                <h4 className="card-title mb-0">Carregadores Cadastrados</h4>
                                <div className="d-flex align-items-center gap-2">
                                    {lastUpdate && (
                                        <span style={{ fontSize: 12, color: '#888' }}>
                                            Atualizado: {lastUpdate.toLocaleTimeString()}
                                        </span>
                                    )}
                                    <label className="d-flex align-items-center gap-1 mb-0" style={{ fontSize: 12, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={auto}
                                            onChange={(e) => setAuto(e.target.checked)}
                                            className="mr-1"
                                        />
                                        Auto Refresh (30s)
                                    </label>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={loadStations}
                                        disabled={loading}
                                    >
                                        {loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>
                                    {error}
                                </div>
                            )}

                            {modelKeys.length === 0 && !loading && !error && (
                                <div className="text-secondary">Nenhum carregador cadastrado.</div>
                            )}

                            {modelKeys.map((model) => (
                                <div key={model} className="mb-4">
                                    <h5 className="mb-2 d-flex align-items-center">
                                        Modelo: {model}
                                        <span className="badge badge-primary ml-2">
                                            {byModel[model].length}
                                        </span>
                                    </h5>
                                    <div className="table-responsive">
                                        <table className="table table-sm table-striped mb-0">
                                            <thead>
                                                <tr>
                                                    <th>ChargeBox ID</th>
                                                    <th>Descrição</th>
                                                    <th>Status</th>
                                                    <th>Firmware</th>
                                                    <th>Cidade/UF</th>
                                                    <th>Último Heartbeat</th>
                                                    <th>Ativo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {byModel[model].map((s) => {
                                                    const st = stationStatus(s);
                                                    const addr = s.address || {};
                                                    return (
                                                        <tr key={s.chargeBoxPk || s.chargeBoxId}>
                                                            <td className="font-weight-bold">{s.chargeBoxId}</td>
                                                            <td>{s.description || '—'}</td>
                                                            <td>
                                                                <span className={`badge ${st.cls}`}>{st.label}</span>
                                                            </td>
                                                            <td>{s.fwVersion || '—'}</td>
                                                            <td>
                                                                {addr.city ? `${addr.city}/${addr.state || ''}` : '—'}
                                                            </td>
                                                            <td>{fmtDate(s.lastHeartbeatTimestamp)}</td>
                                                            <td>
                                                                {s.active === false ? (
                                                                    <span className="badge badge-danger">Inativo</span>
                                                                ) : (
                                                                    <span className="badge badge-success">Ativo</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
