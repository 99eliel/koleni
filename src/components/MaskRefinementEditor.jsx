import { useEffect, useMemo, useRef, useState } from 'react';
import '../mask-refinement.css';

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem para o refinamento manual.'));
    image.src = source;
  });
}

function blobToUrl(blob) {
  return blob ? URL.createObjectURL(blob) : '';
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar o PNG refinado.'));
    }, 'image/png');
  });
}

export default function MaskRefinementEditor({
  open,
  source,
  initialBlob,
  onCancel,
  onApply,
}) {
  const canvasRef = useRef(null);
  const originalPixelsRef = useRef(null);
  const workingPixelsRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const historyRef = useRef([]);
  const futureRef = useRef([]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [tool, setTool] = useState('erase');
  const [brushSize, setBrushSize] = useState(34);
  const [hardness, setHardness] = useState(82);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  const canvasStyle = useMemo(() => ({
    width: `${zoom}%`,
    maxWidth: 'none',
    height: 'auto',
  }), [zoom]);

  useEffect(() => {
    if (!open || !source || !initialBlob) return undefined;
    let active = true;
    const resultUrl = blobToUrl(initialBlob);
    setReady(false);
    setError('');
    historyRef.current = [];
    futureRef.current = [];
    setHistoryTick((v) => v + 1);

    Promise.all([loadImage(source), loadImage(resultUrl)])
      .then(([original, cutout]) => {
        if (!active) return;
        const width = cutout.naturalWidth || cutout.width;
        const height = cutout.naturalHeight || cutout.height;
        const canvas = canvasRef.current;
        if (!canvas || !width || !height) throw new Error('A imagem não possui dimensões válidas.');

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Seu navegador não permitiu abrir o editor de máscara.');

        const originalCanvas = document.createElement('canvas');
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
        originalCtx.clearRect(0, 0, width, height);
        originalCtx.drawImage(original, 0, 0, width, height);
        const originalPixels = originalCtx.getImageData(0, 0, width, height);

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(cutout, 0, 0, width, height);
        const cutoutPixels = ctx.getImageData(0, 0, width, height);

        const working = new ImageData(new Uint8ClampedArray(originalPixels.data), width, height);
        for (let i = 3; i < working.data.length; i += 4) {
          working.data[i] = cutoutPixels.data[i];
        }

        originalPixelsRef.current = originalPixels;
        workingPixelsRef.current = working;
        ctx.putImageData(working, 0, 0);
        setReady(true);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Não foi possível abrir o refinamento manual.');
      });

    return () => {
      active = false;
      URL.revokeObjectURL(resultUrl);
    };
  }, [open, source, initialBlob]);

  if (!open) return null;

  function redraw() {
    const canvas = canvasRef.current;
    const pixels = workingPixelsRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(pixels, 0, 0);
  }

  function snapshot() {
    const pixels = workingPixelsRef.current;
    if (!pixels) return;
    historyRef.current.push(new Uint8ClampedArray(pixels.data));
    if (historyRef.current.length > 20) historyRef.current.shift();
    futureRef.current = [];
    setHistoryTick((v) => v + 1);
  }

  function restoreSnapshot(data) {
    const pixels = workingPixelsRef.current;
    if (!pixels || !data) return;
    pixels.data.set(data);
    redraw();
    setHistoryTick((v) => v + 1);
  }

  function undo() {
    const pixels = workingPixelsRef.current;
    if (!pixels || historyRef.current.length === 0) return;
    futureRef.current.push(new Uint8ClampedArray(pixels.data));
    const previous = historyRef.current.pop();
    restoreSnapshot(previous);
  }

  function redo() {
    const pixels = workingPixelsRef.current;
    if (!pixels || futureRef.current.length === 0) return;
    historyRef.current.push(new Uint8ClampedArray(pixels.data));
    const next = futureRef.current.pop();
    restoreSnapshot(next);
  }

  function pointFromEvent(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function paintCircle(cx, cy) {
    const canvas = canvasRef.current;
    const original = originalPixelsRef.current;
    const working = workingPixelsRef.current;
    if (!canvas || !original || !working) return;

    const radius = Math.max(2, brushSize / 2);
    const inner = radius * Math.max(0.05, hardness / 100);
    const minX = Math.max(0, Math.floor(cx - radius - 1));
    const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius + 1));
    const minY = Math.max(0, Math.floor(cy - radius - 1));
    const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius + 1));

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        if (distance > radius) continue;

        let strength = 1;
        if (distance > inner && radius > inner) {
          strength = 1 - ((distance - inner) / (radius - inner));
        }
        strength = Math.max(0, Math.min(1, strength));

        const offset = ((y * canvas.width) + x) * 4;
        const currentAlpha = working.data[offset + 3];
        const targetAlpha = tool === 'restore' ? original.data[offset + 3] : 0;
        const nextAlpha = currentAlpha + ((targetAlpha - currentAlpha) * strength);
        working.data[offset + 3] = Math.round(nextAlpha);
      }
    }
  }

  function paintLine(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.sqrt((dx * dx) + (dy * dy)));
    const step = Math.max(1, brushSize * 0.16);
    const count = Math.ceil(distance / step);
    for (let i = 0; i <= count; i += 1) {
      const t = count === 0 ? 0 : i / count;
      paintCircle(from.x + (dx * t), from.y + (dy * t));
    }
    redraw();
  }

  function startDrawing(event) {
    if (!ready || busy) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    snapshot();
    drawingRef.current = true;
    const point = pointFromEvent(event);
    lastPointRef.current = point;
    paintCircle(point.x, point.y);
    redraw();
  }

  function moveDrawing(event) {
    if (!drawingRef.current || !ready || busy) return;
    const point = pointFromEvent(event);
    const previous = lastPointRef.current || point;
    paintLine(previous, point);
    lastPointRef.current = point;
  }

  function stopDrawing(event) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function applyRefinement() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const canvas = canvasRef.current;
      const blob = await canvasToBlob(canvas);
      await onApply?.(blob);
    } catch (err) {
      setError(err?.message || 'Não foi possível aplicar o refinamento manual.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mask-refine-backdrop">
      <section className="panel mask-refine-dialog" role="dialog" aria-modal="true" aria-label="Refinar recorte manualmente">
        <header className="mask-refine-head">
          <div>
            <p className="eyebrow">Acabamento manual · precisão máxima</p>
            <h2>Refinar recorte</h2>
            <p>Corrija exatamente o que a remoção automática errou: apague fundo restante ou restaure partes da logo.</p>
          </div>
          <button type="button" className="bg-removal-close" onClick={onCancel} disabled={busy}>×</button>
        </header>

        <div className="mask-refine-toolbar">
          <div className="mask-refine-tools">
            <button type="button" className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')}>Apagar fundo</button>
            <button type="button" className={tool === 'restore' ? 'active restore' : ''} onClick={() => setTool('restore')}>Restaurar logo</button>
          </div>

          <label>
            <span>Pincel <strong>{brushSize}px</strong></span>
            <input type="range" min="6" max="180" step="2" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
          </label>

          <label>
            <span>Dureza <strong>{hardness}%</strong></span>
            <input type="range" min="20" max="100" step="2" value={hardness} onChange={(e) => setHardness(Number(e.target.value))} />
          </label>

          <label>
            <span>Zoom <strong>{zoom}%</strong></span>
            <input type="range" min="60" max="320" step="10" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>

          <div className="mask-refine-history">
            <button type="button" onClick={undo} disabled={!canUndo || busy}>↶ Desfazer</button>
            <button type="button" onClick={redo} disabled={!canRedo || busy}>↷ Refazer</button>
          </div>
        </div>

        <div className="mask-refine-help">
          <strong>{tool === 'erase' ? 'Apagar fundo' : 'Restaurar logo'}</strong>
          <span>{tool === 'erase'
            ? 'Passe o pincel sobre qualquer sobra que deveria ficar transparente.'
            : 'Passe o pincel onde o sistema apagou uma parte da marca que deveria continuar visível.'}</span>
        </div>

        <div className="mask-refine-stage">
          <div className="mask-refine-canvas-wrap checkerboard checkerboard-contrast">
            <canvas
              ref={canvasRef}
              style={canvasStyle}
              onPointerDown={startDrawing}
              onPointerMove={moveDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={(event) => {
                if (drawingRef.current && event.buttons === 0) stopDrawing(event);
              }}
            />
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}
        {!ready && !error && <div className="mask-refine-loading">Preparando editor de precisão…</div>}

        <footer className="mask-refine-actions">
          <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Voltar sem aplicar</button>
          <button type="button" className="button button-success" onClick={applyRefinement} disabled={!ready || busy}>
            {busy ? 'Aplicando…' : 'Aplicar recorte refinado'}
          </button>
        </footer>
      </section>
    </div>
  );
}
