import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UploadCloud, X, RefreshCw } from 'lucide-react';
import { updateFirmware, fetchFirmwareBlocks, isSessionExpired } from '../../api/client';
import { Button } from './button';

interface Station {
  chargeBoxId: string;
  description?: string;
  chargePointModel?: string;
}

const FW_TYPES = [
  { key: 'gateway', label: 'Gateway (.bin)' },
  { key: 'mcu', label: 'MCU (.hex)' },
  { key: 'completa', label: 'Completa (.enfs)' },
];

interface FirmwareUpdateProps {
  station: Station;
}

const FirmwareUpdate: React.FC<FirmwareUpdateProps> = ({ station }) => {
  const [step, setStep] = useState<string | null>(null);
  const [type, setType] = useState<{ key: string; label: string } | null>(null);
  const [assign, setAssign] = useState('');
  const [sending, setSending] = useState('');
  const [blocks, setBlocks] = useState<Array<{ id: string; name: string; [key: string]: unknown }>>([]);
  const [modelLinks, setModelLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchFirmwareBlocks()
      .then((d) => {
        setBlocks((d.blocks || []) as Array<{ id: string; name: string; [key: string]: unknown }>);
        setModelLinks(d.modelLinks || {});
      })
      .catch(() => setBlocks([]));
  }, []);

  const urlFor = (model: string) => {
    const blockId = modelLinks[model];
    const entry = blocks.find((b) => b.id === blockId);
    if (!entry) return '';
    const typeData = entry[type?.key || ''] as { url?: string } | undefined;
    return typeData?.url?.trim() || '';
  };

  const close = () => {
    setStep(null);
    setType(null);
    setSending('');
  };

  const doSend = async (model: string, fwType: { key: string; label: string }) => {
    const url = urlFor(model);
    if (!url) {
      setStep('resolve');
      setType(fwType);
      return;
    }
    setSending(fwType.key);
    try {
      const data = await updateFirmware([station], url) as Record<string, unknown>;
      toast.success(
        `Update ${fwType.label} enviado para ${station.chargeBoxId}` +
          (data?.statusCode ? ` — ${data.statusCode}` : '')
      );
      close();
    } catch (err: unknown) {
      if (isSessionExpired(err)) toast.error('Sessão expirada');
      else {
        const error = err as Record<string, unknown>;
        const response = error?.response as Record<string, unknown> | undefined;
        toast.error(
          `Falha no upload ${fwType.label}: ${(response?.data as Record<string, unknown>)?.error || error.message || err}`
        );
      }
    } finally {
      setSending('');
    }
  };

  const handlePick = (fwType: { key: string; label: string }) => {
    const model = assign || station.chargePointModel || '';
    doSend(model, fwType);
  };

  const linkedModels = Object.keys(modelLinks).filter((m) => {
    const blockId = modelLinks[m];
    const entry = blocks.find((b) => b.id === blockId);
    if (!entry) return false;
    const typeData = entry[type?.key || ''] as { url?: string } | undefined;
    return !!typeData?.url?.trim();
  });

  const handleResolveConfirm = () => {
    const model = assign || linkedModels[0] || '';
    doSend(model, type!);
  };

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-zinc-950 px-3 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-primary';

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        title={`Atualizar firmware de ${station.chargeBoxId}`}
        onClick={() => {
          setAssign(station.chargePointModel || '');
          setStep('pick');
        }}
      >
        <UploadCloud size={14} />
        Update
      </Button>

      {step && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {step === 'pick' ? 'Escolher firmware' : 'Selecionar modelo'}
              </h2>
              <button
                className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
                onClick={close}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {step === 'pick' && (
              <>
                <p className="mb-4 text-sm text-muted">
                  Estação: <span className="text-foreground">{station.chargeBoxId}</span>
                  {station.description ? ` — ${station.description}` : ''}
                  <br />
                  Modelo: <span className="text-foreground">{station.chargePointModel || '—'}</span>
                </p>
                <div className="space-y-2">
                  {FW_TYPES.map((t) => (
                    <Button
                      key={t.key}
                      variant="secondary"
                      className="w-full justify-start"
                      disabled={sending !== ''}
                      onClick={() => handlePick(t)}
                    >
                      {sending === t.key ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <UploadCloud size={16} />
                      )}
                      {t.label}
                    </Button>
                  ))}
                </div>
              </>
            )}

            {step === 'resolve' && (
              <>
                <p className="mb-4 text-sm text-muted">
                  O modelo <span className="text-danger">{station.chargePointModel || '—'}</span> não
                  tem URL preenchida para {type?.label}. Selecione qual modelo corresponde a esta
                  estação para enviar o link correto.
                </p>
                <select
                  className={`${inputClass} w-full`}
                  value={assign || linkedModels[0] || ''}
                  onChange={(e) => setAssign(e.target.value)}
                >
                  {linkedModels.length === 0 && (
                    <option value="">Nenhum modelo vinculado a um bloco com URL</option>
                  )}
                  {linkedModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="secondary" onClick={close}>
                    Cancelar
                  </Button>
                  <Button onClick={handleResolveConfirm} disabled={sending !== ''}>
                    {sending ? 'ENVIANDO...' : 'Enviar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default FirmwareUpdate;
