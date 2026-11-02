import { useEffect, useState } from 'react';
import { getGarment } from '../lib/garmentRepo';
import { hasMeasurementGuide, normalizeMeasurementGuide } from '../lib/measurementGuide';
import '../measurement-guide.css';

export default function MeasurementGuideDock({ garmentId }) {
  const [guide, setGuide] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!garmentId) {
      setGuide(null);
      return undefined;
    }
    getGarment(garmentId)
      .then((garment) => {
        if (!active) return;
        const normalized = normalizeMeasurementGuide(garment?.measurementGuide, []);
        setGuide(hasMeasurementGuide(normalized) ? normalized : null);
      })
      .catch(() => { if (active) setGuide(null); });
    return () => { active = false; };
  }, [garmentId]);

  if (!guide) return null;

  const tableRows = guide.rows.filter((row) => row.label || Object.values(row.values || {}).some(Boolean));
  const hasTable = tableRows.length > 0 && guide.columns.length > 0;
  const hasImage = Boolean(guide.imageUrl);

  return (
    <>
      <div className="measurement-dock">
        <button className="measurement-dock-button" type="button" onClick={() => setOpen(true)}>📏 Tabela de medidas</button>
      </div>

      {open && (
        <div className="measurement-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="measurement-modal" role="dialog" aria-modal="true" aria-label={guide.title || 'Tabela de medidas'}>
            <header className="measurement-modal-head">
              <div><p className="eyebrow">Referência da peça</p><h2>{guide.title || 'Tabela de medidas'}</h2></div>
              <button className="measurement-modal-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>

            <div className={`measurement-view-layout ${hasTable && hasImage ? 'has-both' : ''}`}>
              {hasTable && (
                <div className="measurement-view-table-wrap">
                  <table className="measurement-view-table">
                    <thead><tr><th>MEDIDA</th>{guide.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {tableRows.map((row) => (
                        <tr key={row.id}><th>{row.label || '—'}</th>{guide.columns.map((column) => <td key={column}>{row.values?.[column] || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {hasImage && <img className="measurement-view-image" src={guide.imageUrl} alt={guide.title || 'Tabela de medidas'} />}
              {!hasTable && !hasImage && <div className="measurement-empty">Nenhuma medida cadastrada para esta peça.</div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
