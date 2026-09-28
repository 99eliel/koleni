import { useEffect, useMemo, useState } from 'react';
import {
  colorToCss,
  prepareBackgroundRemoval,
  processBackgroundRemoval,
  samplePreparedColor,
} from '../lib/localBackgroundRemoval';

export default function BackgroundRemovalDialog({
  open,
  source,
  fileName,
  onCancel,
  onApply,
}) {
  const [prepared, setPrepared] = useState(null);
  const [backgroundColor, setBackgroundColor] = useState(null);
  const [tolerance, setTolerance] = useState(42);
  const [feather, setFeather] = useState(12);
  const [removeInternalIslands, setRemoveInternalIslands] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewBlob, setPreviewBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const selectedColor = backgroundColor || prepared?.autoColor || null;
  const selectedColorCss = useMemo(() => colorToCss(selectedColor), [selectedColor]);

  useEffect(() => {
    if (!open || !source) return undefined;
    let active = true;
    setLoading(true);
    setPrepared(null);
    setBackgroundColor(null);
    setPreviewBlob(null);
    setError('');

    prepareBackgroundRemoval(source)
      .then((next) => {
        if (!active) return;
        setPrepared(next);
        setBackgroundColor(next.autoColor);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, source]);

  useEffect(() => {
    if (!open || !prepared || !selectedColor) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setProcessing(true);
      try {
        const blob = await processBackgroundRemoval(prepared, {
          backgroundColor: selectedColor,
          tolerance,
          feather,
          removeInternalIslands,
        });
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
        setError('');
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setProcessing(false);
      }
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, prepared, selectedColor?.r, selectedColor?.g, selectedColor?.b, tolerance, feather, removeInternalIslands]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!open) return null;

  function chooseBackground(event) {
    if (!prepared) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    setBackgroundColor(samplePreparedColor(prepared, x, y));
  }

  async function apply() {
    if (!previewBlob || processing) return;
    await onApply?.(previewBlob);
  }

  return (
    <div className="bg-removal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onCancel?.();
    }}>
      <section className="panel bg-removal-dialog" role="dialog" aria-modal="true" aria-label="Remover fundo da logo">
        <div className="bg-removal-head">
          <div>
            <p className="eyebrow">Tratamento local</p>
            <h2>Remover fundo da logo</h2>
            <p>Funciona no próprio navegador, sem enviar a imagem para serviços externos.</p>
          </div>
          <button type="button" className="bg-removal-close" onClick={onCancel} disabled={processing}>×</button>
        </div>

        <div className="bg-removal-file">
          <span>Arquivo</span>
          <strong>{fileName || 'Logo selecionada'}</strong>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {loading && <div className="bg-removal-loading">Preparando imagem…</div>}

        {!loading && prepared && (
          <>
            <div className="bg-removal-preview-grid">
              <div>
                <div className="bg-removal-preview-title">
                  <strong>Original</strong>
                  <span>Clique no fundo para selecionar a cor</span>
                </div>
                <button type="button" className="bg-removal-image checkerboard" onClick={chooseBackground}>
                  <img src={source} alt="Logo original" />
                </button>
              </div>

              <div>
                <div className="bg-removal-preview-title">
                  <strong>Resultado</strong>
                  <span>{processing ? 'Atualizando…' : 'Prévia transparente'}</span>
                </div>
                <div className="bg-removal-image checkerboard checkerboard-contrast">
                  {previewUrl ? <img src={previewUrl} alt="Prévia sem fundo" /> : <span>Gerando prévia…</span>}
                </div>
              </div>
            </div>

            <div className="bg-removal-controls">
              <div className="bg-removal-color-row">
                <span>Cor do fundo</span>
                <span className="bg-removal-color-chip" style={{ background: selectedColorCss }} />
                <code>{selectedColorCss}</code>
                <button type="button" className="mini-link" onClick={() => setBackgroundColor(prepared.autoColor)}>Detectar novamente</button>
              </div>

              <label>
                <span>Tolerância <strong>{tolerance}</strong></span>
                <input type="range" min="8" max="110" step="1" value={tolerance} onChange={(event) => setTolerance(Number(event.target.value))} />
                <small>Aumente se ainda sobrar fundo. Diminua se começar a apagar partes da logo.</small>
              </label>

              <label>
                <span>Suavização da borda <strong>{feather}</strong></span>
                <input type="range" min="0" max="35" step="1" value={feather} onChange={(event) => setFeather(Number(event.target.value))} />
                <small>Suaviza os pixels próximos ao contorno para evitar bordas serrilhadas.</small>
              </label>

              <label className="bg-removal-checkbox">
                <input
                  type="checkbox"
                  checked={removeInternalIslands}
                  onChange={(event) => setRemoveInternalIslands(event.target.checked)}
                />
                <span>
                  <strong>Limpar resíduos internos</strong>
                  <small>Remove pequenos bolsões da cor do fundo presos dentro de letras e símbolos.</small>
                </span>
              </label>
            </div>

            <div className="bg-removal-tip">
              Áreas grandes da mesma cor são preservadas para evitar apagar partes importantes da marca. Se algum detalhe desaparecer, desative “Limpar resíduos internos”.
            </div>

            <div className="bg-removal-actions">
              <button type="button" className="button button-secondary" onClick={onCancel} disabled={processing}>Cancelar</button>
              <button type="button" className="button button-primary" onClick={apply} disabled={!previewBlob || processing}>
                {processing ? 'Atualizando…' : 'Aplicar sem fundo'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
