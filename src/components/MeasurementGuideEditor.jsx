import { useMemo, useRef } from 'react';
import { columnsFromSizeLabels, normalizeMeasurementGuide } from '../lib/measurementGuide';
import '../measurement-guide.css';

function rowId() {
  return `medida-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export default function MeasurementGuideEditor({ value, onChange, sizeLabels = [], onUploadImage, busy = false }) {
  const fileRef = useRef(null);
  const guide = useMemo(() => normalizeMeasurementGuide(value, sizeLabels), [value, sizeLabels]);

  function update(next) {
    onChange?.(normalizeMeasurementGuide(next, sizeLabels));
  }

  function useProductionSizes() {
    const columns = columnsFromSizeLabels(sizeLabels);
    const rows = guide.rows.map((row) => ({
      ...row,
      values: Object.fromEntries(columns.map((column) => [column, row.values?.[column] || ''])),
    }));
    update({ ...guide, columns, rows });
  }

  function changeColumns(text) {
    const columns = text.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
    const rows = guide.rows.map((row) => ({
      ...row,
      values: Object.fromEntries(columns.map((column) => [column, row.values?.[column] || ''])),
    }));
    update({ ...guide, columns, rows });
  }

  function addRow() {
    update({
      ...guide,
      rows: [
        ...guide.rows,
        {
          id: rowId(),
          label: '',
          values: Object.fromEntries(guide.columns.map((column) => [column, ''])),
        },
      ],
    });
  }

  function updateRow(id, changes) {
    update({
      ...guide,
      rows: guide.rows.map((row) => row.id === id ? { ...row, ...changes } : row),
    });
  }

  function updateCell(row, column, valueText) {
    updateRow(row.id, { values: { ...row.values, [column]: valueText } });
  }

  function removeRow(id) {
    update({ ...guide, rows: guide.rows.filter((row) => row.id !== id) });
  }

  async function handleFile(file) {
    if (!file || !onUploadImage) return;
    try {
      const imageUrl = await onUploadImage(file);
      if (imageUrl) update({ ...guide, imageUrl });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="panel measurement-admin-panel">
      <div className="measurement-admin-head">
        <div>
          <p className="eyebrow">Tabela de medidas</p>
          <h3>Medidas da peça</h3>
          <p>Monte uma tabela como a ficha técnica ou envie uma imagem pronta. Você pode usar os dois juntos.</p>
        </div>
        <label className="measurement-title-field">Título
          <input value={guide.title} onChange={(event) => update({ ...guide, title: event.target.value })} disabled={busy} />
        </label>
      </div>

      <div className="measurement-admin-grid">
        <div className="measurement-table-builder">
          <div className="measurement-builder-toolbar">
            <label>Colunas da tabela
              <input value={guide.columns.join(', ')} onChange={(event) => changeColumns(event.target.value)} placeholder="TOL, PP, P, M, G, GG, G1..." disabled={busy} />
            </label>
            <button className="button button-secondary" type="button" onClick={useProductionSizes} disabled={busy}>Usar grade da peça</button>
          </div>

          <div className="measurement-table-scroll">
            <table className="measurement-edit-table">
              <thead>
                <tr>
                  <th>MEDIDA</th>
                  {guide.columns.map((column) => <th key={column}>{column}</th>)}
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.id}>
                    <th><input value={row.label} onChange={(event) => updateRow(row.id, { label: event.target.value })} placeholder="Ex.: TÓRAX" disabled={busy} /></th>
                    {guide.columns.map((column) => (
                      <td key={column}><input value={row.values?.[column] || ''} onChange={(event) => updateCell(row, column, event.target.value)} placeholder="—" disabled={busy} /></td>
                    ))}
                    <td><button className="measurement-remove-row" type="button" onClick={() => removeRow(row.id)} disabled={busy} title="Excluir medida">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="button button-secondary measurement-add-row" type="button" onClick={addRow} disabled={busy}>+ Adicionar medida</button>
        </div>

        <div className="measurement-image-uploader">
          <div><strong>Imagem da tabela</strong><span>Opcional · PNG, JPG ou WEBP</span></div>
          {guide.imageUrl ? (
            <div className="measurement-image-preview">
              <img src={guide.imageUrl} alt={guide.title || 'Tabela de medidas'} />
              <div>
                <button className="button button-secondary" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>Substituir imagem</button>
                <button className="mini-link" type="button" onClick={() => update({ ...guide, imageUrl: '' })} disabled={busy}>Remover imagem</button>
              </div>
            </div>
          ) : (
            <button className="measurement-upload-empty" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              <span>＋</span><strong>Enviar tabela pronta</strong><small>Use a foto/ficha técnica fornecida pela confecção</small>
            </button>
          )}
          <input ref={fileRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleFile(event.target.files?.[0])} />
        </div>
      </div>
    </section>
  );
}
