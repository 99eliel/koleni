import { useEffect, useState } from 'react';

export default function NewRegionDialog({ open, onClose, onCreate }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#8a8a8a');

  useEffect(() => {
    if (open) {
      setLabel('');
      setColor('#8a8a8a');
    }
  }, [open]);

  if (!open) return null;

  function submit(event) {
    event.preventDefault();
    if (!label.trim()) return;
    onCreate({ label: label.trim(), defaultColor: color });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="panel modal-card" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <p className="eyebrow">Nova região</p>
          <h2>Defina a área da peça</h2>
        </div>
        <label>
          Nome da região
          <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Corpo, bolso, manga" />
        </label>
        <label>
          Cor padrão
          <div className="color-field">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <input value={color} onChange={(event) => setColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" />
          </div>
        </label>
        <div className="modal-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-primary">Criar e desenhar</button>
        </div>
      </form>
    </div>
  );
}
