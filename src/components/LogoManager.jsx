import '../logo-manager.css';

function logoPreview(logo) {
  return logo?.processedUrl || logo?.storageUrl || (logo?.sourceType === 'image' ? logo?.sourceUrl : '');
}

function fileLabel(logo) {
  const name = logo?.sourceName?.trim();
  if (name) return name;
  return logo?.sourceType === 'pdf' ? 'Logo em PDF' : 'Logo sem nome';
}

export default function LogoManager({
  logos = [],
  currentView,
  viewLabels = {},
  onSelect,
  onRemove,
}) {
  const uniqueFiles = new Set(
    logos.map((logo) => logo.originalUrl || logo.sourceUrl || logo.storageUrl || logo.sourceName || logo.id),
  ).size;

  if (!logos.length) {
    return (
      <div className="logo-manager-empty">
        <strong>Nenhuma logo inserida</strong>
        <span>As logos adicionadas nesta peça aparecerão aqui com o nome do arquivo e a posição.</span>
      </div>
    );
  }

  return (
    <div className="logo-manager">
      <div className="logo-manager-summary">
        <div>
          <strong>{logos.length} logo(s) na peça</strong>
          <span>{uniqueFiles} arquivo(s) diferente(s)</span>
        </div>
        <small>Gerencie todos os arquivos usados neste layout.</small>
      </div>

      <div className="logo-manager-list">
        {logos.map((logo, index) => {
          const preview = logoPreview(logo);
          const logoView = logo?.position?.view || currentView;
          const sameView = logoView === currentView;
          return (
            <article className={`logo-manager-item ${sameView ? 'is-current-view' : ''}`} key={logo.id || `${fileLabel(logo)}-${index}`}>
              <div className="logo-manager-thumb">
                {preview
                  ? <img src={preview} alt={fileLabel(logo)} />
                  : <span>{logo?.sourceType === 'pdf' ? 'PDF' : 'LOGO'}</span>}
              </div>

              <div className="logo-manager-info">
                <strong title={fileLabel(logo)}>{fileLabel(logo)}</strong>
                <div className="logo-manager-meta">
                  <span>{viewLabels[logoView] || logoView || 'Peça'}</span>
                  {logo?.sourceType === 'pdf' && (
                    <span>Página {logo.sourcePage || 1}{logo.sourcePageCount > 1 ? `/${logo.sourcePageCount}` : ''}</span>
                  )}
                  {logo?.backgroundRemoved && <span className="logo-manager-treated">Fundo removido</span>}
                </div>
                <small>Logo #{index + 1}</small>
              </div>

              <div className="logo-manager-actions">
                <button type="button" onClick={() => onSelect?.(logo)}>
                  {sameView ? 'Selecionar' : 'Ir até'}
                </button>
                <button type="button" className="danger" onClick={() => onRemove?.(logo)}>
                  Excluir
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
