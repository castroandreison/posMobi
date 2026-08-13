import React, { useEffect, useRef, useState } from 'react';

const LogView = () => {
    const [source, setSource] = useState('cloud');
    const [tenant, setTenant] = useState('Intelbras');
    const [stationFilter, setStationFilter] = useState('');
    const [search, setSearch] = useState('');
    const [stations, setStations] = useState([]);
    const [raw, setRaw] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [auto, setAuto] = useState(false);
    const timerRef = useRef(null);
    const viewerRef = useRef(null);

    const loadLogs = async (src, tn) => {
        setLoading(true);
        setError('');
        try {
            let text;
            if (src === 'local') {
                const r = await fetch('/api/v1/local/logs', { headers: { Accept: '*/*' } });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                text = await r.text();
            } else {
                const r = await fetch(`/api/v1/log?tenant=${encodeURIComponent(tn)}`, {
                    headers: { Accept: '*/*' },
                });
                if (r.status === 401) throw new Error('Sessão expirada');
                if (!r.ok) {
                    const d = await r.json().catch(() => ({}));
                    throw new Error(d.error || `HTTP ${r.status}`);
                }
                const ct = r.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const d = await r.json();
                    text = typeof d === 'string' ? d : JSON.stringify(d, null, 2);
                } else {
                    text = await r.text();
                }
            }
            setRaw(text || '');
        } catch (e) {
            setError(e.message || String(e));
            setRaw('');
        } finally {
            setLoading(false);
        }
    };

    const loadStations = async () => {
        try {
            const r = await fetch('/api/v1/chargepoints', { headers: { Accept: '*/*' } });
            if (r.ok) {
                const d = await r.json();
                setStations(d.chargePointList || []);
            }
        } catch (e) {
            // sem estações disponíveis; filtro fica só com "Todas"
        }
    };

    useEffect(() => {
        loadStations();
    }, []);

    useEffect(() => {
        if (!auto) return;
        const run = () => loadLogs(source, tenant);
        run();
        timerRef.current = setInterval(run, 30000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [auto, source, tenant]);

    const handleDownload = async () => {
        if (source !== 'cloud') {
            setError('Download disponível apenas para Cloud');
            return;
        }
        try {
            const r = await fetch(`/api/v1/log/download?tenant=${encodeURIComponent(tenant)}`, {
                headers: { Accept: '*/*' },
            });
            if (r.status === 401) throw new Error('Sessão expirada');
            if (!r.ok) throw new Error(`Download failed: ${r.status}`);
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `logs_${tenant}_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || String(e));
        }
    };

    const escapeHtml = (s) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines = raw
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => (stationFilter ? l.includes(stationFilter) : true))
        .filter((l) => (search ? l.toLowerCase().includes(search.toLowerCase()) : true));

    const levelBadge = (line) => {
        if (line.includes('[ERROR]')) {
            return { label: 'ERROR', color: '#dc3545' };
        }
        if (line.includes('[WARN]')) {
            return { label: 'WARN', color: '#ffc107' };
        }
        if (line.includes('[INFO]')) {
            return { label: 'INFO', color: '#28a745' };
        }
        return null;
    };

    return (
        <div>
            <div className="row">
                <div className="col-12">
                    <div className="card">
                        <div className="card-body">
                            <h4 className="card-title">Logs do Sistema</h4>
                            <div className="d-flex gap-2 align-items-center flex-wrap mb-2">
                                <select
                                    className="form-select"
                                    style={{ minWidth: 140, width: 'auto', maxWidth: 200 }}
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                >
                                    <option value="local">Local (OCPP)</option>
                                    <option value="cloud">Cloud (Intelbras)</option>
                                </select>
                                {source === 'cloud' && (
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Tenant"
                                        value={tenant}
                                        onChange={(e) => setTenant(e.target.value)}
                                        style={{ maxWidth: 150 }}
                                    />
                                )}
                                <button
                                    className="btn btn-primary"
                                    onClick={() => loadLogs(source, tenant)}
                                    disabled={loading}
                                >
                                    {loading ? 'CARREGANDO...' : 'CARREGAR LOGS'}
                                </button>
                                <button className="btn btn-secondary" onClick={handleDownload}>
                                    DOWNLOAD
                                </button>
                                <label className="d-flex align-items-center gap-1 ml-auto mb-0" style={{ fontSize: 12, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={auto}
                                        onChange={(e) => setAuto(e.target.checked)}
                                        className="mr-1"
                                    />
                                    Auto Refresh (30s)
                                </label>
                            </div>
                            <div className="d-flex gap-2 align-items-center flex-wrap mb-3">
                                <select
                                    className="form-select"
                                    style={{ minWidth: 200, width: 'auto', maxWidth: 260 }}
                                    value={stationFilter}
                                    onChange={(e) => setStationFilter(e.target.value)}
                                >
                                    <option value="">Todas as estações</option>
                                    {stations.map((s) => (
                                        <option key={s.chargeBoxId} value={s.chargeBoxId}>
                                            {s.chargeBoxId}
                                            {s.description ? ` (${s.description})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="text"
                                    className="form-control flex-grow-1"
                                    placeholder="Buscar no log..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                                    {lines.length} linhas
                                </span>
                            </div>

                            {error && (
                                <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>
                                    {error}
                                </div>
                            )}

                            <div
                                className="border rounded p-3"
                                style={{
                                    height: 500,
                                    overflowY: 'auto',
                                    background: 'rgba(0,0,0,0.4)',
                                    fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
                                    fontSize: 12,
                                    lineHeight: 1.7,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                }}
                                ref={viewerRef}
                            >
                                {raw.trim() ? (
                                    lines.map((line, i) => {
                                        const badge = levelBadge(line);
                                        return (
                                            <div
                                                key={i}
                                                className="px-1"
                                                style={{ color: '#d0d0d0' }}
                                            >
                                                {badge && (
                                                    <span
                                                        className="mr-2"
                                                        style={{
                                                            display: 'inline-block',
                                                            minWidth: 52,
                                                            textAlign: 'center',
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            letterSpacing: 1,
                                                            color: badge.color,
                                                            border: `1px solid ${badge.color}`,
                                                            borderRadius: 4,
                                                            padding: '0 4px',
                                                        }}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                )}
                                                <span dangerouslySetInnerHTML={{ __html: escapeHtml(line) }} />
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-secondary font-italic">
                                        {loading
                                            ? 'Carregando logs...'
                                            : error
                                                ? `Erro: ${error}`
                                                : 'Clique em "CARREGAR LOGS" para buscar.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LogView;