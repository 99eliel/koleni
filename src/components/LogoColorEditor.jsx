import '../logo-color-editor.css';

const PRESETS = [
  '#ffffff', '#111827', '#0b2b52', '#2563eb',
  '#dc2626', '#16a34a', '#facc15', '#9ca3af',
];

export default function LogoColorEditor({
  open,
  fileName,
  color,
  mode,
  opacity,
  busy,
  onColorChange,
  onModeChange,
  onOpacityChange,
  onApply,
  onRestore,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="logo-color-editor">
      <div className="logo-color-editor-head">
        <div>
          <strong>Editar cor da logo</strong>
          <span title={fileName}>{fileName || 'Logo selecionada'}</span>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar edição de cor">×</button>
      </div>

      <div className="logo-color-modes" role="group" aria-label="Modo de recoloração">
        <button type="button" className={mode === 'flat' ? 'active' : ''} onClick={() => onModeChange('flat')} disabled={busy}>
          <strong>Cor sólida</strong>
          <small>Ideal para logos de uma cor</small>
        </button>
        <button type="button" className={mode === 'shading' ? 'active' : ''} onClick={() => onModeChange('shading')} disabled={busy}>
          <strong>Preservar sombras</strong>
          <small>Mantém variações de luz</small>
        </button>
      </div>

      <div className="logo-color-picker-row">
        <label>
          <span>Nova cor</span>
          <input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} disabled={busy} />
        </label>
        <div className="logo-color-presets">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Usar cor ${preset}`}
              title={preset}
              className={preset.toLowerCase() === color.toLowerCase() ? 'active' : ''}
              style={{ background: preset }}
              onClick={() => onColorChange(preset)}
              disabled={busy}
            />
          ))}
        </div>
      </div>

      <label className="logo-opacity-control">
        <span>Opacidade <strong>{opacity}%</strong></span>
        <input
          type="range"
          min="10"
          max="100"
          step="1"
          value={opacity}
          onChange={(event) => onOpacityChange(Number(event.target.value))}
          disabled={busy}
        />
      </label>

      <div className="logo-color-preview-line">
        <span>Prévia da cor</span>
        <b style={{ background: color }} />
        <strong>{color.toUpperCase()}</strong>
      </div>

      <div className="logo-color-actions">
        <button type="button" className="button button-secondary" onClick={onRestore} disabled={busy}>
          Restaurar original
        </button>
        <button type="button" className="button button-primary" onClick={onApply} disabled={busy}>
          {busy ? 'Aplicando…' : 'Aplicar na logo'}
        </button>
      </div>

      <p className="logo-color-help">
        A alteração é não destrutiva: o arquivo original continua preservado e pode ser restaurado a qualquer momento.
      </p>
    </div>
  );
}
