const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

export default function PdfLogoPageMapper({
  fileName,
  pages,
  pageCount,
  assignments,
  availableViews,
  busy = false,
  onChange,
  onCancel,
  onConfirm,
}) {
  const activeCount = assignments.filter((item) => item.targetView !== 'skip').length;

  return (
    <div className="pdf-logo-map-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel?.();
    }}>
      <section className="panel pdf-logo-map-card" role="dialog" aria-modal="true" aria-label="Distribuir páginas do PDF">
        <div className="pdf-logo-map-head">
          <div>
            <p className="eyebrow">PDF vetorial</p>
            <h2>Distribuir logos do arquivo</h2>
            <p>Este PDF possui {pageCount} página(s). Defina onde cada página será aplicada na peça.</p>
          </div>
          <button className="pdf-logo-map-close" type="button" onClick={onCancel} disabled={busy}>×</button>
        </div>

        <div className="pdf-logo-map-file">
          <span>Arquivo</span>
          <strong>{fileName}</strong>
        </div>

        <div className="pdf-logo-pages">
          {pages.map((page) => {
            const assignment = assignments.find((item) => item.pageNumber === page.pageNumber);
            return (
              <article className="pdf-logo-page-card" key={page.pageNumber}>
                <div className="pdf-logo-page-preview">
                  <img src={page.previewUrl} alt={`Prévia da página ${page.pageNumber}`} />
                  <span>Página {page.pageNumber}</span>
                </div>

                <label>
                  Aplicar em
                  <select
                    value={assignment?.targetView ?? 'skip'}
                    onChange={(event) => onChange(page.pageNumber, event.target.value)}
                    disabled={busy}
                  >
                    <option value="skip">Não usar</option>
                    {availableViews.map((targetView) => (
                      <option key={targetView} value={targetView}>{VIEW_LABELS[targetView] ?? targetView}</option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
        </div>

        {pageCount > pages.length && (
          <div className="pdf-logo-map-warning">O PDF possui mais páginas do que o limite exibido. As primeiras {pages.length} páginas estão disponíveis para posicionamento.</div>
        )}

        <div className="pdf-logo-map-tip">
          <strong>Dica:</strong> em PDFs com frente e costas, normalmente use Página 1 → Frente e Página 2 → Costas.
        </div>

        <div className="pdf-logo-map-actions">
          <span>{activeCount} página(s) serão adicionadas</span>
          <div>
            <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
            <button className="button button-primary" type="button" onClick={onConfirm} disabled={busy || activeCount === 0}>
              {busy ? 'Adicionando…' : 'Adicionar logos'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
