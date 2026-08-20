import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, UploadCloud, Pencil, X, Activity, Plus, Trash2 } from 'lucide-react';
import {
  fetchChargepoints,
  updateFirmware,
  fetchLogs,
  parseStationLog,
  fwStatusTone,
  fwStatusLabel,
  fetchFirmwareBlocks,
  saveFirmwareBlocks,
  deleteFirmwareBlock,
  isSessionExpired,
  stationStatus,
  onlineStatus,
} from '../../api/client.js';
import { Card, CardHeader, CardBody } from '../../components/ui/card.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import AccountSelect from '../../components/ui/accountselect.jsx';

const STORAGE_KEY = 'posmobi_firmware_urls';

const FW_TYPES = [
  { key: 'gateway', label: 'Gateway (.bin)' },
  { key: 'mcu', label: 'MCU (.hex)' },
  { key: 'completa', label: 'Completa (.enfs)' },
];

const emptyBlock = () => ({
  id: '',
  name: '',
  gateway: { url: '', version: '' },
  mcu: { url: '', version: '' },
  completa: { url: '', version: '' },
});

function loadLegacyUrls() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

const FirmwareView = () => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [filters, setFilters] = useState({
    chargeBoxId: '',
    description: '',
    model: '',
    status: '',
    online: '',
    firmware: '',
    city: '',
    active: '',
  });
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draftBlocks, setDraftBlocks] = useState([]);
  const [draftLinks, setDraftLinks] = useState({});
  const [fwLoading, setFwLoading] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveType, setResolveType] = useState(null);
  const [resolveTargets, setResolveTargets] = useState([]);
  const [resolveAssign, setResolveAssign] = useState({});
  const [monitor, setMonitor] = useState({});
  const [monitoring, setMonitoring] = useState(false);
  const selectAllRef = useRef(null);
  const [blocks, setBlocks] = useState([]);
  const [modelLinks, setModelLinks] = useState({});
  const [fwLoaded, setFwLoaded] = useState(false);

  useEffect(() => {
    fetchFirmwareBlocks()
      .then((d) => {
        if (d.blocks.length) {
          setBlocks(d.blocks);
          setModelLinks(d.modelLinks);
        } else {
          const legacy = loadLegacyUrls();
          if (legacy) {
            const imported = Object.keys(legacy).map((model) => {
              const b = emptyBlock();
              b.id = `blk_${model.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
              b.name = model;
              FW_TYPES.forEach((t) => {
                const src = legacy[model]?.[t.key];
                if (src && typeof src === 'object') {
                  b[t.key] = { url: src.url || '', version: src.version || '' };
                }
              });
              return b;
            });
            const links = {};
            imported.forEach((b) => {
              links[b.name] = b.id;
            });
            setBlocks(imported);
            setModelLinks(links);
            saveFirmwareBlocks(imported, links)
              .then(() => toast.success('URLs de firmware importadas do armazenamento local'))
              .catch(() => toast.error('Não foi possível salvar os dados importados'));
          }
        }
      })
      .catch(() => toast.error('Falha ao carregar firmware local'))
      .finally(() => setFwLoaded(true));
  }, []);

  const loadStations = async (tenantPk) => {
    setLoading(true);
    try {
      setStations(await fetchChargepoints(tenantPk));
    } catch (err) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else toast.error(`Erro ao carregar: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenant?.pk) loadStations(tenant.pk);
  }, []);

  const handleAccountChange = (acct) => {
    setTenant(acct);
    setFilters({
      chargeBoxId: '',
      description: '',
      model: '',
      status: '',
      online: '',
      firmware: '',
      city: '',
      active: '',
    });
    setSelected(new Set());
    if (acct?.pk) loadStations(acct.pk);
    else setStations([]);
  };

  const models = useMemo(
    () => [...new Set(stations.map((s) => s.chargePointModel || 'Sem modelo'))].sort(),
    [stations]
  );

  const statusOptions = useMemo(
    () => [...new Set(stations.map((s) => stationStatus(s).label))].sort(),
    [stations]
  );
  const onlineOptions = useMemo(
    () =>
      [...new Set(stations.map((s) => onlineStatus(s.lastHeartbeatTimestamp).label))].sort(),
    [stations]
  );

  const filtered = useMemo(() => {
    const q = (v) => v.toLowerCase();
    return stations.filter((s) => {
      const st = stationStatus(s);
      const onl = onlineStatus(s.lastHeartbeatTimestamp);
      const addr = s.address || {};
      if (
        filters.chargeBoxId &&
        !q(s.chargeBoxId || '').includes(q(filters.chargeBoxId))
      )
        return false;
      if (
        filters.description &&
        !q(s.description || '').includes(q(filters.description))
      )
        return false;
      if (filters.model && (s.chargePointModel || 'Sem modelo') !== filters.model)
        return false;
      if (filters.status && st.label !== filters.status) return false;
      if (filters.online && onl.label !== filters.online) return false;
      if (filters.firmware && !q(s.fwVersion || '').includes(q(filters.firmware)))
        return false;
      const cityUf = `${addr.city || ''}/${addr.state || ''}`;
      if (filters.city && !q(cityUf).includes(q(filters.city))) return false;
      if (filters.active) {
        const isActive = s.active === false ? 'Inativo' : 'Ativo';
        if (isActive !== filters.active) return false;
      }
      return true;
    });
  }, [stations, filters]);

  const idOf = (s) => s.chargeBoxPk || s.chargeBoxId;
  const allSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(idOf(s)));
  const someSelected =
    filtered.length > 0 && filtered.some((s) => selected.has(idOf(s)));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  const toggleSelectAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      filtered.forEach((s) => next.delete(idOf(s)));
    } else {
      filtered.forEach((s) => next.add(idOf(s)));
    }
    setSelected(next);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const urlFor = (s, typeKey) => {
    const blockId = modelLinks[s.chargePointModel];
    const entry = blocks.find((b) => b.id === blockId)?.[typeKey];
    return entry?.url?.trim() || '';
  };

  const doSend = async (type, targets) => {
    setSending(type.key);
    try {
      const groups = new Map();
      targets.forEach((s) => {
        const url = urlFor(s, type.key);
        if (!url) return;
        if (!groups.has(url)) groups.set(url, []);
        groups.get(url).push(s);
      });
      const total = [...groups.values()].reduce((acc, g) => acc + g.length, 0);
      if (!total) {
        toast.error(`Nenhum carregador com URL preenchida para ${type.label}`);
        return;
      }
      let status = '';
      for (const [url, group] of groups) {
        const data = await updateFirmware(group, url);
        if (data?.statusCode) status = data.statusCode;
      }
      toast.success(
        `Upload ${type.label} enviado para ${total} carregador(es)` +
          (status ? ` — ${status}` : '')
      );
      startMonitor(targets);
    } catch (err) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else
        toast.error(
          `Falha no upload ${type.label}: ${err.response?.data?.error || err.message || err}`
        );
    } finally {
      setSending('');
    }
  };

  const startMonitor = (targets) => {
    if (!targets.length) return;
    setMonitor((prev) => {
      const next = { ...prev };
      targets.forEach((s) => {
        next[idOf(s)] = { status: 'Comando enviado', firmwareVersion: null, gatewayVersion: null, rebooted: false };
      });
      return next;
    });
    setMonitoring(true);
  };

  const FINAL_FW = ['Installed', 'DownloadFailed', 'InstallationFailed', 'Idle'];

  const refreshMonitor = async () => {
    if (!monitoring) return;
    try {
      const text = await fetchLogs('cloud', tenant?.alias || 'Intelbras');
      setMonitor((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((stationId) => {
          const st = stations.find((s) => String(idOf(s)) === stationId);
          if (!st) return;
          const parsed = parseStationLog(text, st.chargeBoxId);
          const cur = next[stationId] || {};
          if (parsed.status) next[stationId] = { ...cur, status: parsed.status };
          if (parsed.firmwareVersion)
            next[stationId] = { ...cur, firmwareVersion: parsed.firmwareVersion };
          if (parsed.gatewayVersion)
            next[stationId] = { ...cur, gatewayVersion: parsed.gatewayVersion };
          if (parsed.rebooted && !cur.rebooted)
            next[stationId] = { ...cur, rebooted: true, status: 'Reiniciando...' };
          if (parsed.status && FINAL_FW.includes(parsed.status)) {
            next[stationId] = { ...cur, status: parsed.status, done: true };
          }
        });
        return next;
      });
    } catch (err) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else toast.error(`Erro no monitoramento: ${err.message || err}`);
    }
  };

  useEffect(() => {
    if (!monitoring) return;
    refreshMonitor();
    const timer = setInterval(refreshMonitor, 10000);
    return () => clearInterval(timer);
  }, [monitoring, stations, tenant]);

  useEffect(() => {
    if (!monitoring) return;
    const allDone = Object.values(monitor).every(
      (m) => m.done || FINAL_FW.includes(m.status)
    );
    if (Object.keys(monitor).length && allDone) {
      setMonitoring(false);
      toast.success('Monitoramento concluído');
    }
  }, [monitor, monitoring]);

  const sendFirmware = (type) => {
    const target = filtered.filter((s) => selected.has(idOf(s)));
    if (!target.length) {
      toast.warning('Selecione ao menos um carregador');
      return;
    }
    const missing = target.filter((s) => !urlFor(s, type.key));
    if (missing.length) {
      const assign = {};
      missing.forEach((s) => {
        const curLink = modelLinks[s.chargePointModel];
        assign[idOf(s)] = curLink || '';
      });
      setResolveType(type);
      setResolveTargets(missing);
      setResolveAssign(assign);
      setResolveOpen(true);
      return;
    }
    doSend(type, target);
  };

  const resolveConfirm = async () => {
    const type = resolveType;
    const newLinks = {};
    const targets = resolveTargets.map((s) => {
      const blockId = resolveAssign[idOf(s)];
      if (blockId) newLinks[s.chargePointModel] = blockId;
      return s;
    });
    setResolveOpen(false);
    if (Object.keys(newLinks).length) {
      try {
        const nextLinks = { ...modelLinks, ...newLinks };
        const result = await saveFirmwareBlocks(blocks, nextLinks);
        setModelLinks(result.modelLinks || nextLinks);
      } catch (err) {
        toast.error(`Falha ao vincular modelo: ${err.message || err}`);
        return;
      }
    }
    const ok = targets.filter((s) => urlFor(s, type.key));
    const skipped = targets.length - ok.length;
    if (skipped) {
      toast.warning(`${skipped} carregador(es) sem URL para ${type.label} foram pulados`);
    }
    if (!ok.length) {
      toast.error('Nenhum carregador com URL preenchida para envio');
      return;
    }
    doSend(type, ok);
  };

  const openModal = () => {
    setDraftBlocks(JSON.parse(JSON.stringify(blocks)));
    setDraftLinks({ ...modelLinks });
    setModalOpen(true);
  };

  const updateDraftBlock = (blockId, typeKey, field, value) => {
    setDraftBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          [typeKey]: { ...b[typeKey], [field]: value },
        };
      })
    );
  };

  const updateDraftName = (blockId, value) => {
    setDraftBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, name: value } : b))
    );
  };

  const addDraftBlock = () => {
    const b = emptyBlock();
    b.id = `blk_${Date.now().toString(36)}`;
    setDraftBlocks((prev) => [...prev, b]);
  };

  const removeDraftBlock = (blockId) => {
    setDraftBlocks((prev) => prev.filter((b) => b.id !== blockId));
    setDraftLinks((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((model) => {
        if (next[model] === blockId) delete next[model];
      });
      return next;
    });
  };

  const setDraftLink = (model, blockId) => {
    setDraftLinks((prev) => ({ ...prev, [model]: blockId }));
  };

  const saveUrls = async () => {
    setFwLoading(true);
    try {
      const validBlocks = draftBlocks.filter(
        (b) => b.name.trim() || FW_TYPES.some((t) => b[t.key]?.url?.trim())
      );
      const result = await saveFirmwareBlocks(validBlocks, draftLinks);
      setBlocks(result.blocks || validBlocks);
      setModelLinks(result.modelLinks || draftLinks);
      setModalOpen(false);
      toast.success('URLs de firmware salvas');
    } catch (err) {
      toast.error(`Falha ao salvar: ${err.message || err}`);
    } finally {
      setFwLoading(false);
    }
  };

  const inputClass =
    'h-10 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Upload de Firmware</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={openModal} disabled={!fwLoaded}>
            <Pencil size={16} />
            Editar URL
          </Button>
          <Button
            size="md"
            onClick={() => {
              if (!tenant?.pk) {
                toast.warning('Selecione uma conta nos filtros antes de atualizar');
                return;
              }
              loadStations(tenant.pk);
            }}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            ATUALIZAR
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-muted">Filtros</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters({
                chargeBoxId: '',
                description: '',
                model: '',
                status: '',
                online: '',
                firmware: '',
                city: '',
                active: '',
              })
            }
          >
            Limpar
          </Button>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Conta</label>
            <AccountSelect
              className="w-full"
              value={tenant?.pk ?? null}
              onChange={handleAccountChange}
              placeholder="Todas as contas..."
              allowEmpty
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">ChargeBox ID</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              placeholder="Buscar por ID..."
              value={filters.chargeBoxId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, chargeBoxId: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Descrição</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              placeholder="Buscar por descrição..."
              value={filters.description}
              onChange={(e) =>
                setFilters((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Modelo</label>
            <select
              className={`${inputClass} w-full`}
              value={filters.model}
              onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))}
            >
              <option value="">Todos</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Status</label>
            <select
              className={`${inputClass} w-full`}
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Todos</option>
              {statusOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Online</label>
            <select
              className={`${inputClass} w-full`}
              value={filters.online}
              onChange={(e) => setFilters((f) => ({ ...f, online: e.target.value }))}
            >
              <option value="">Todos</option>
              {onlineOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Firmware</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              placeholder="Buscar por versão..."
              value={filters.firmware}
              onChange={(e) =>
                setFilters((f) => ({ ...f, firmware: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Cidade/UF</label>
            <input
              type="text"
              className={`${inputClass} w-full`}
              placeholder="Ex.: São José/SC..."
              value={filters.city}
              onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-muted">Ativo</label>
            <select
              className={`${inputClass} w-full`}
              value={filters.active}
              onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Carregadores
            <Badge tone="primary">{filtered.length}</Badge>
          </h3>
          <div className="flex items-center gap-3">
            {monitoring && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Activity size={14} className="animate-pulse" />
                Monitorando atualizações...
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={toggleSelectAll}>
              {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </Button>
          </div>
        </CardHeader>
        <CardBody className="px-0 pt-0">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="w-10 px-4 py-2.5">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        className="accent-primary"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                      />
                    </th>
                    <th className="px-4 py-2.5">ChargeBox ID</th>
                    <th className="px-4 py-2.5">Descrição</th>
                    <th className="px-4 py-2.5">Modelo</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Status FW</th>
                    <th className="px-4 py-2.5">Firmware</th>
                    <th className="px-4 py-2.5">Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const id = idOf(s);
                    const mon = monitor[id];
                    return (
                      <tr
                        key={id}
                        className="cursor-pointer border-b border-border/60 hover:bg-surface-muted/40"
                        onClick={() => toggleSelect(id)}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={selected.has(id)}
                            onChange={() => toggleSelect(id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-2.5 font-semibold">{s.chargeBoxId}</td>
                        <td className="px-4 py-2.5">{s.description || '—'}</td>
                        <td className="px-4 py-2.5 text-muted">{s.chargePointModel || '—'}</td>
                        <td className="px-4 py-2.5">
                          <Badge tone={stationStatus(s).tone}>{stationStatus(s).label}</Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {mon ? (
                            <Badge tone={fwStatusTone(mon.status)}>
                              {fwStatusLabel(mon.status)}
                              {monitoring &&
                                ['Downloading', 'Installing', 'Comando enviado', 'Reiniciando...'].includes(
                                  mon.status
                                ) && (
                                  <Activity
                                    size={12}
                                    className="ml-1 animate-pulse"
                                  />
                                )}
                            </Badge>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted">
                          {mon?.firmwareVersion || s.fwVersion || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted">{mon?.gatewayVersion || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-4 text-sm text-muted">
              {loading
                ? 'Carregando carregadores...'
                : 'Nenhum carregador encontrado com os filtros atuais.'}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-muted">Enviar firmware</h2>
          <span className="text-xs text-muted">{selected.size} selecionado(s)</span>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-3">
          {FW_TYPES.map((t) => (
            <Button
              key={t.key}
              variant="primary"
              disabled={sending !== '' || selected.size === 0}
              onClick={() => sendFirmware(t)}
            >
              <UploadCloud size={16} className={sending === t.key ? 'animate-pulse' : ''} />
              {sending === t.key ? `ENVIANDO ${t.label.toUpperCase()}...` : t.label}
            </Button>
          ))}
          {selected.size === 0 && (
            <span className="self-center text-xs text-muted">
              Selecione um carregador para habilitar o envio.
            </span>
          )}
        </CardBody>
      </Card>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-4 sm:p-6"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-7xl flex-col rounded-2xl border border-border bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold">Firmware por Carregador</h2>
              <button
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Carregadores / Modelos</h3>
                  <Button variant="secondary" size="sm" onClick={addDraftBlock}>
                    <Plus size={14} />
                    Novo carregador
                  </Button>
                </div>
                {draftBlocks.length === 0 && (
                  <p className="text-sm text-muted">
                    Nenhum carregador cadastrado. Clique em "Novo carregador" para criar um.
                  </p>
                )}
                {draftBlocks.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-surface-muted/40 text-left text-xs uppercase tracking-wider text-muted">
                          <th className="px-3 py-2.5">Carregador / Modelo</th>
                          {FW_TYPES.map((t) => (
                            <th key={t.key} className="px-3 py-2.5">
                              {t.label}
                            </th>
                          ))}
                          <th className="w-10 px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {draftBlocks.map((b) => (
                          <tr key={b.id} className="border-b border-border/60">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                className={`${inputClass} w-full`}
                                placeholder="Nome (ex.: Business 7kW)"
                                value={b.name}
                                onChange={(e) => updateDraftName(b.id, e.target.value)}
                              />
                            </td>
                            {FW_TYPES.map((t) => (
                              <td key={t.key} className="px-3 py-2">
                                <div className="flex flex-col gap-1.5">
                                  <input
                                    type="text"
                                    className={`${inputClass} w-full`}
                                    placeholder="URL"
                                    value={b[t.key]?.url || ''}
                                    onChange={(e) =>
                                      updateDraftBlock(b.id, t.key, 'url', e.target.value)
                                    }
                                  />
                                  <input
                                    type="text"
                                    className={`${inputClass} w-full`}
                                    placeholder="Versão"
                                    value={b[t.key]?.version || ''}
                                    onChange={(e) =>
                                      updateDraftBlock(b.id, t.key, 'version', e.target.value)
                                    }
                                  />
                                </div>
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDraftBlock(b.id)}
                                title="Excluir carregador"
                              >
                                <Trash2 size={15} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <h3 className="text-sm font-semibold">Vincular modelos</h3>
                <p className="text-xs text-muted">
                  Cada modelo só pode ser vinculado a um carregador. Todas as estações do modelo
                  usarão o carregador selecionado.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {models.map((m) => (
                    <div
                      key={m}
                      className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_14rem]"
                    >
                      <label className="text-sm text-foreground">{m}</label>
                      <select
                        className={`${inputClass} w-full`}
                        value={draftLinks[m] || ''}
                        onChange={(e) => setDraftLink(m, e.target.value)}
                      >
                        <option value="">— não vinculado —</option>
                        {draftBlocks.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name.trim() || '(sem nome)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveUrls} disabled={fwLoading}>
                {fwLoading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {resolveOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setResolveOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Vincular carregador de firmware</h2>
              <button
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                onClick={() => setResolveOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
              Os carregadores abaixo não têm URL preenchida para {resolveType?.label}. Selecione o
              carregador que corresponde ao modelo de cada um para enviar o link correto.
            </p>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {resolveTargets.map((s) => (
                <div key={idOf(s)} className="space-y-1.5">
                  <label className="text-xs text-muted">
                    {s.chargeBoxId}
                    {s.description ? ` — ${s.description}` : ''}
                    <br />
                    <span className="text-foreground">{s.chargePointModel || '—'}</span>
                  </label>
                  <select
                    className={`${inputClass} w-full`}
                    value={resolveAssign[idOf(s)] || ''}
                    onChange={(e) =>
                      setResolveAssign((prev) => ({ ...prev, [idOf(s)]: e.target.value }))
                    }
                  >
                    <option value="">— não vinculado —</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name.trim() || '(sem nome)'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResolveOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={resolveConfirm}>Enviar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FirmwareView;