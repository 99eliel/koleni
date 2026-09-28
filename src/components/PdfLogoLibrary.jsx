const VIEW_LABELS = {
  front: 'Frente',
  back: 'Costas',
  combined: 'Frente + Costas',
};

export default function PdfLogoLibrary({
  fileName,
  pages,
  pageCount,
  currentView,
  busyPage = null,
  onAddPage,
  onAddAll,
  onClose,
}) {
  return (
    <section className="pdf-logo-library">
      <div className="pdf-logo-library-head">
        <div>
          <span className="pdf-logo-library-kicker">PDF vetorial carregado</span>
          <strong>{fileName}</strong>
          <small>{pageCount} página(s) disponível(is) • adicionando em {VIEW_LABELS[currentView] ?? currentView}</small>
        </div>
        <button type="button" className="pdf-logo-library-close" onClick={onClose} aria-label="Fechar biblioteca do PDF">×</button>
      </div>

      <div className="pdf-logo-library-pages">
        {pages.map((page) => (
          <article className="pdf-logo-library-page" key={page.pageNumber}>
            <button
              type="button"
              className="pdf-logo-library-thumb"
              onClick={() => onAddPage(page.pageNumber)}
              disabled={busyPage !== null}
              title={`Adicionar página ${page.pageNumber} em ${VIEW_LABELS[currentView] ?? currentView}`}
            >
              <img src={page.previewUrl} alt={`Página ${page.pageNumber} do PDF`} />
              <span>{page.pageNumber}</span>
            </button>
            <button
              type="button"
              className="pdf-logo-library-add"
              onClick={() => onAddPage(page.pageNumber)}
              disabled={busyPage !== null}
            >
              {busyPage === page.pageNumber ? 'Adicionando…' : '+ Nesta vista'}
            </button>
          </article>
        ))}
      </div>

      <div className="pdf-logo-library-footer">
        <span>Você pode usar a mesma página quantas vezes quiser e em qualquer vista.</span>
        {pages.length > 1 && (
          <button type="button" className="mini-link" onClick={onAddAll} disabled={busyPage !== null}>
            Adicionar todas nesta vista
          </button>
        )}
      </div>
    </section>
  );
}
