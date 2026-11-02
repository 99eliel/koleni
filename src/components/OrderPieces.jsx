import '../order-pieces.css';
const VIEW_NAMES = { front: 'Frente / Foto 1', back: 'Costas / Foto 2', combined: 'Foto 3' };

export default function OrderPieces({ order, detailed = false }) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length <= 1) return null;
  return (
    <section className={`order-pieces ${detailed ? 'order-pieces-detailed' : ''}`}>
      <div className="order-pieces-title"><strong>Itens deste pedido</strong><span>{items.length} personalizações · {items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)} peças no total</span></div>
      <div className="order-pieces-grid">
        {items.map((item, index) => {
          const images = Object.entries(item.finalImages || {}).filter(([, url]) => !!url);
          if (!images.length && item.finalImageUrl) images.push(['final', item.finalImageUrl]);
          const sizes = Object.entries(item.sizeGrid || {}).filter(([, qty]) => Number(qty) > 0);
          return <article className="order-piece" key={item.id || index}>
            <div className="order-piece-header"><b>{index + 1}</b><div><strong>{item.garmentName || item.garmentId || `Peça ${index + 1}`}</strong><span>{Number(item.quantity) || 0} unidade(s)</span></div></div>
            {images.length > 0 && <div className="order-piece-images">
              {(detailed ? images : images.slice(0, 1)).map(([view, url]) => <a key={view} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`${item.garmentName || 'Peça'} — ${VIEW_NAMES[view] || view}`} loading="lazy" />
                <small>{VIEW_NAMES[view] || 'Arte final'}</small>
              </a>)}
            </div>}
            {sizes.length > 0 && <div className="order-piece-sizes">{sizes.map(([size, qty]) => <span key={size}><b>{size}</b>: {qty}</span>)}</div>}
            {detailed && (item.logos || []).some((logo) => logo.sourceType === 'pdf' && logo.sourceUrl) && <div className="order-piece-pdfs">
              <strong>Arquivos vetoriais</strong>
              {Array.from(new Map((item.logos || []).filter((logo) => logo.sourceType === 'pdf' && logo.sourceUrl).map((logo) => [logo.sourceUrl, logo])).values()).map((logo, index) => <a key={logo.sourceUrl || index} href={logo.sourceUrl} target="_blank" rel="noreferrer">{logo.sourceName || `Logo PDF ${index + 1}`} ↗</a>)}
            </div>}
          </article>;
        })}
      </div>
    </section>
  );
}
