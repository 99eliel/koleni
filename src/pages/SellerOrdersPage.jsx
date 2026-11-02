import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MartinpelBrand from '../components/MartinpelBrand';
import { listSellerDetailedOrders } from '../lib/orderRepo';

const STATUS_LABELS = {
  pending: 'Atendimento',
  quoted: 'Orçamento',
  approval: 'Aguardando cliente',
  approved: 'Aprovado',
  production: 'Em produção',
  quality: 'Conferência',
  ready: 'Pronto',
  completed: 'Concluído',
};

const APPROVAL_LABELS = {
  pending: 'Aguardando aprovação',
  approved: 'Arte aprovada',
  changes_requested: 'Alteração solicitada',
};

const VIEW_LABELS = { front: 'Foto 1', back: 'Foto 2', combined: 'Foto 3', final: 'Arte final' };

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function whatsappHref(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

function sizeGridEntries(sizeGrid = {}) {
  return Object.entries(sizeGrid).filter(([, quantity]) => Number(quantity) > 0);
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
}

export default function SellerOrdersPage({ user, isAdmin = false, logout }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      setOrders(await listSellerDetailedOrders(user.uid, { force, maxItems: 30 }));
    } catch (err) {
      setError(`Não foi possível carregar seus pedidos: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, [user.uid]);

  return (
    <main className="seller-orders-shell">
      <header className="seller-orders-topbar">
        <MartinpelBrand compact subtitle="Meus pedidos" />
        <div className="seller-orders-actions">
          <Link className="button button-light" to="/">+ Novo atendimento</Link>
          {isAdmin && <Link className="button button-secondary" to="/admin">Admin</Link>}
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="seller-orders-hero">
        <div>
          <p className="eyebrow">Central do vendedor</p>
          <h1>Meus pedidos</h1>
          <p>Os 30 pedidos mais recentes ficam disponíveis aqui. Use “Abrir / editar ficha técnica” para consultar, completar ou imprimir a ficha de qualquer pedido.</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => load(true)} disabled={loading}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </button>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="seller-orders-list">
        {!loading && !error && orders.length === 0 && (
          <div className="panel seller-orders-empty">
            <strong>Nenhum pedido registrado ainda.</strong>
            <span>Quando você finalizar o primeiro atendimento, ele aparecerá aqui.</span>
          </div>
        )}

        {orders.map((order) => {
          let finalImages = Object.entries(order.finalImages ?? {}).filter(([, url]) => Boolean(url));
          if (!finalImages.length && order.finalImageUrl) finalImages = [['final', order.finalImageUrl]];
          const whatsappLink = whatsappHref(order.whatsapp);
          const vectorFiles = Array.from(
            new Map(
              (order.logos ?? [])
                .filter((logo) => logo.sourceType === 'pdf' && logo.sourceUrl)
                .map((logo) => [logo.sourceUrl, logo]),
            ).values(),
          );
          const sizeEntries = sizeGridEntries(order.sizeGrid);
          const quote = order.quote || null;

          return (
            <article className={`panel seller-order-detail-card ${order.approvalStatus === 'changes_requested' ? 'has-change-request' : ''}`} key={order.id}>
              <div className="order-card-head">
                <div>
                  <span>Pedido</span>
                  <code>{order.displayCode || order.orderId || order.id}</code>
                </div>
                <div className="order-head-right">
                  <span className={`pipeline-status is-${order.status || 'pending'}`}>{STATUS_LABELS[order.status] || 'Atendimento'}</span>
                  <time>{formatDate(order.createdAt)}</time>
                </div>
              </div>

              <div className="seller-order-compact-grid">
                <div><span>Cliente</span><strong>{order.customerName || 'Não informado'}</strong></div>
                <div>
                  <span>WhatsApp</span>
                  <strong>{order.whatsapp || 'Não informado'}</strong>
                  {whatsappLink && <a href={whatsappLink} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
                </div>
                <div><span>Quantidade</span><strong>{order.quantity || 0}</strong></div>
                <div><span>Peça</span><strong>{order.garmentName || order.garmentId || 'Peça não identificada'}</strong></div>
                <div><span>Vendedor</span><strong>{order.sellerEmail || user.email || 'Não identificado'}</strong></div>
                <div><span>Versão</span><strong>V{order.designVersion || 1}</strong></div>
              </div>

              <div className="seller-order-detail-status">
                <div>
                  <span>Aprovação do cliente</span>
                  <strong>{APPROVAL_LABELS[order.approvalStatus] || 'Aguardando aprovação'}</strong>
                </div>
                <div>
                  <span>Ficha técnica</span>
                  <strong>{order.technicalSheet?.savedAt ? 'Preenchida / salva' : 'Aguardando preenchimento'}</strong>
                </div>
                {quote && (
                  <div>
                    <span>Orçamento</span>
                    <strong>{formatMoney(quote.total || (Number(quote.unitPrice) * Number(order.quantity)))}</strong>
                    <small>{quote.unitPrice ? `${formatMoney(quote.unitPrice)} por peça` : ''}{quote.estimatedTime ? ` · Prazo: ${quote.estimatedTime}` : ''}</small>
                  </div>
                )}
              </div>

              {sizeEntries.length > 0 && (
                <div className="seller-order-size-section">
                  <span>Grade de tamanhos</span>
                  <div className="seller-order-size-grid">
                    {sizeEntries.map(([size, quantity]) => (
                      <div key={size}><span>{size}</span><strong>{quantity}</strong></div>
                    ))}
                  </div>
                </div>
              )}

              {finalImages.length > 0 && (
                <details className="seller-order-collapse">
                  <summary>
                    <span>Artes finais</span>
                    <strong>{finalImages.length} arquivo(s)</strong>
                  </summary>
                  <div className="seller-order-image-grid">
                    {finalImages.map(([imageView, url], index) => (
                      <a className="seller-order-image-card" href={url} target="_blank" rel="noreferrer" key={imageView}>
                        <img src={url} alt={`${order.garmentName || 'Peça'} - ${VIEW_LABELS[imageView] || `Foto ${index + 1}`}`} />
                        <span>{VIEW_LABELS[imageView] || `Foto ${index + 1}`}</span>
                        <small>Abrir imagem ↗</small>
                      </a>
                    ))}
                  </div>
                </details>
              )}

              {vectorFiles.length > 0 && (
                <details className="seller-order-collapse">
                  <summary>
                    <span>Arquivos vetoriais</span>
                    <strong>{vectorFiles.length} PDF(s)</strong>
                  </summary>
                  <div className="seller-order-vector-list">
                    {vectorFiles.map((logo, index) => (
                      <a href={logo.sourceUrl} target="_blank" rel="noreferrer" key={logo.id || `${order.id}-vector-${index}`}>
                        <span className="order-vector-icon">PDF</span>
                        <span>
                          <strong>{logo.sourceName || `Logo vetorial ${index + 1}`}</strong>
                          <small>{logo.sourcePageCount > 1 ? `Página ${logo.sourcePage || 1} de ${logo.sourcePageCount}` : 'Arquivo vetorial original'}</small>
                        </span>
                        <b>Abrir ↗</b>
                      </a>
                    ))}
                  </div>
                </details>
              )}

              {order.approvalStatus === 'changes_requested' && (
                <div className="seller-change-note">
                  <span>O que o cliente pediu</span>
                  <strong>{order.approvalNote || 'Alteração solicitada sem observação.'}</strong>
                  <Link className="button button-primary" to={`/revisar/${order.orderId || order.id}`}>
                    Revisar arte · criar V{(order.designVersion || 1) + 1}
                  </Link>
                </div>
              )}

              <div className="seller-order-detail-actions">
                <Link className="button button-primary" to={`/ficha-tecnica/${order.orderId || order.id}`}>
                  Abrir / editar ficha técnica
                </Link>
                {order.approvalToken && (
                  <a
                    className="button button-secondary"
                    href={`${window.location.origin}${window.location.pathname}#/aprovar/${order.id}/${order.approvalToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir aprovação do cliente
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
