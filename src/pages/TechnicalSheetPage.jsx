import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MARTINPEL_LOGO_DATA_URL } from '../lib/martinpelLogo';
import { getGarment } from '../lib/garmentRepo';
import { getOrderById, saveTechnicalSheet } from '../lib/orderRepo';
import { normalizeMeasurementGuide } from '../lib/measurementGuide';
import { getSizeScaleLabels } from '../lib/sizeScales';
import '../technical-sheet-page.css';

const EMPTY_FIELDS = {
  description: '',
  reference: '',
  fabric: '',
  customer: '',
  color: '',
  print: '',
  weight: '',
  printColor: '',
  notes: '',
};

const REFERENCE_COLUMNS = ['TOL', 'PP', 'P', 'M', 'G', 'GG', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
const REFERENCE_ROWS = [
  { id: 'torax', label: 'TORAX', values: { TOL: '1' } },
  { id: 'barra', label: 'BARRA', values: { TOL: '1' } },
  { id: 'comp-cp', label: 'COMP CP', values: { TOL: '1' } },
  { id: 'comp-mg', label: 'COMP MG', values: { TOL: '1' } },
];

const VIEW_LABELS = { front: 'Frente', back: 'Costas', combined: 'Vista adicional', final: 'Arte final' };

function safeImageSource(logo) {
  return logo?.processedUrl || logo?.storageUrl || (logo?.sourceType === 'image' ? logo?.sourceUrl : '');
}

function normalizedGuide(garment, order) {
  const sizeLabels = getSizeScaleLabels(garment?.sizeScale || order?.sizeScale);
  const guide = normalizeMeasurementGuide(garment?.measurementGuide, sizeLabels);
  const hasStructuredRows = guide.rows.length > 0;
  const columns = guide.columns.length ? guide.columns : REFERENCE_COLUMNS;
  const rows = hasStructuredRows
    ? guide.rows
    : REFERENCE_ROWS.map((row) => ({
      ...row,
      values: Object.fromEntries(columns.map((column) => [column, row.values?.[column] || ''])),
    }));
  return { ...guide, columns, rows, hasStructuredRows };
}

export default function TechnicalSheetPage({ isAdmin = false, logout }) {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [garment, setGarment] = useState(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getOrderById(orderId)
      .then(async (orderData) => {
        if (!orderData) throw new Error('Pedido não encontrado.');
        const garmentData = await getGarment(orderData.garmentId, { includeArchived: true });
        if (!active) return;
        setOrder(orderData);
        setGarment(garmentData);
        setFields({
          ...EMPTY_FIELDS,
          ...(orderData.technicalSheet?.fields || {}),
        });
      })
      .catch((err) => active && setError(err.message || 'Não foi possível abrir a ficha técnica.'))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [orderId]);

  const guide = useMemo(() => normalizedGuide(garment, order), [garment, order]);
  const drawings = useMemo(() => {
    if (!order) return [];
    const entries = Object.entries(order.finalImages || {}).filter(([, url]) => Boolean(url));
    if (!entries.length && order.finalImageUrl) entries.push(['final', order.finalImageUrl]);
    return entries;
  }, [order]);

  const logoPreviews = useMemo(
    () => (order?.logos || []).map((logo) => ({ ...logo, preview: safeImageSource(logo) })).filter((logo) => logo.preview),
    [order],
  );

  function updateField(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
    setMessage('');
  }

  async function save({ silent = false } = {}) {
    if (!orderId) return false;
    setSaving(true);
    setError('');
    try {
      await saveTechnicalSheet(orderId, { fields });
      setOrder((current) => current ? {
        ...current,
        technicalSheet: { fields: { ...fields }, savedAt: new Date().toISOString() },
      } : current);
      if (!silent) setMessage('Ficha técnica salva no pedido.');
      return true;
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a ficha técnica.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function printSheet() {
    const saved = await save({ silent: true });
    if (!saved) return;
    setMessage('Ficha salva. Abrindo impressão…');
    window.setTimeout(() => window.print(), 80);
  }

  if (loading) return <main className="technical-sheet-loading">Carregando ficha técnica…</main>;
  if (!order) {
    return (
      <main className="technical-sheet-loading">
        <div>
          <strong>Ficha técnica indisponível</strong>
          <p>{error || 'Pedido não encontrado.'}</p>
          <Link to={isAdmin ? '/admin' : '/meus-pedidos'}>Voltar aos pedidos</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="technical-sheet-screen">
      <div className="technical-sheet-toolbar no-print">
        <div>
          <span>Pedido {order.displayCode || order.id}</span>
          <strong>Ficha Técnica</strong>
          <small>Preencha o cabeçalho, confira a arte e salve antes de imprimir.</small>
        </div>
        <div className="technical-sheet-toolbar-actions">
          <Link className="button button-secondary" to={isAdmin ? '/admin' : '/meus-pedidos'}>← Voltar</Link>
          <button className="button button-secondary" type="button" onClick={() => save()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar ficha'}
          </button>
          <button className="button button-primary" type="button" onClick={printSheet} disabled={saving}>
            Imprimir / Salvar PDF
          </button>
          {logout && <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>}
        </div>
      </div>

      {(message || error) && (
        <div className={error ? 'notice notice-error no-print' : 'notice notice-success no-print'}>
          {error || message}
        </div>
      )}

      <article className="technical-sheet-paper">
        <div className="technical-sheet-titlebar">FICHA TÉCNICA</div>

        <section className="technical-sheet-header-grid">
          <div className="technical-sheet-logo">
            <img src={MARTINPEL_LOGO_DATA_URL} alt="Koleni Uniformes e EPI's" />
          </div>

          <table className="technical-sheet-meta-table">
            <tbody>
              <tr>
                <th>DESCRIÇÃO</th>
                <td colSpan="3">
                  <input
                    value={fields.description}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder={order.garmentName || 'Preencher'}
                  />
                </td>
              </tr>
              <tr>
                <th>REFERÊNCIA</th>
                <td><input value={fields.reference} onChange={(event) => updateField('reference', event.target.value)} /></td>
                <th>TECIDO</th>
                <td><input value={fields.fabric} onChange={(event) => updateField('fabric', event.target.value)} /></td>
              </tr>
              <tr>
                <th>CLIENTE</th>
                <td><input value={fields.customer} onChange={(event) => updateField('customer', event.target.value)} placeholder={order.customerName || ''} /></td>
                <th>COR</th>
                <td><input value={fields.color} onChange={(event) => updateField('color', event.target.value)} /></td>
              </tr>
              <tr>
                <th>ESTAMPA</th>
                <td><input value={fields.print} onChange={(event) => updateField('print', event.target.value)} /></td>
                <th>GRAMATURA</th>
                <td><input value={fields.weight} onChange={(event) => updateField('weight', event.target.value)} /></td>
              </tr>
              <tr>
                <th>COR ESTAMPA</th>
                <td><input value={fields.printColor} onChange={(event) => updateField('printColor', event.target.value)} /></td>
                <th>OBS</th>
                <td><input value={fields.notes} onChange={(event) => updateField('notes', event.target.value)} /></td>
              </tr>
            </tbody>
          </table>
        </section>

        <div className="technical-sheet-titlebar">DESENHO TÉCNICO</div>

        <section className="technical-sheet-drawing">
          {drawings.length ? (
            <div className={`technical-sheet-garments count-${Math.min(drawings.length, 3)}`}>
              {drawings.map(([view, url]) => (
                <figure key={view}>
                  <img src={url} alt={VIEW_LABELS[view] || view} />
                  <figcaption>{VIEW_LABELS[view] || view}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="technical-sheet-empty-art">Arte final do pedido não encontrada.</div>
          )}

          {logoPreviews.length > 0 && (
            <div className="technical-sheet-logo-strip">
              {logoPreviews.map((logo, index) => (
                <figure key={logo.id || `${logo.sourceName}-${index}`}>
                  <img src={logo.preview} alt={logo.sourceName || `Logo ${index + 1}`} />
                  <figcaption>{logo.sourceName || `Logo ${index + 1}`}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <div className="technical-sheet-titlebar">TABELA DE MEDIDAS</div>

        <section className="technical-sheet-measurements">
          {guide.imageUrl && !guide.hasStructuredRows ? (
            <img className="technical-sheet-measurement-image" src={guide.imageUrl} alt={guide.title || 'Tabela de medidas'} />
          ) : (
            <div className="technical-sheet-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NOME</th>
                    {guide.columns.map((column) => <th key={column}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => (
                    <tr key={row.id}>
                      <th>{row.label || '—'}</th>
                      {guide.columns.map((column) => <td key={column}>{row.values?.[column] || ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="technical-sheet-footer">
          <span>Pedido: {order.displayCode || order.id}</span>
          <span>Quantidade: {Number(order.quantity) || 0}</span>
          <span>Versão: V{Number(order.designVersion) || 1}</span>
        </footer>
      </article>
    </main>
  );
}
