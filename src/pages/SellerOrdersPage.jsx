import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MartinpelBrand from '../components/MartinpelBrand';
import { listSellerOrders } from '../lib/orderRepo';

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

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function SellerOrdersPage({ user, isAdmin = false, logout }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      setOrders(await listSellerOrders(user.uid, { force, maxItems: 30 }));
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
          <p>Os 30 pedidos mais recentes ficam disponíveis aqui. A tela usa cache e só consulta novamente quando você atualiza.</p>
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

        {orders.map((order) => (
          <article className="panel seller-order-card" key={order.id}>
            <div className="seller-order-code">
              <span>Pedido</span>
              <strong>{order.displayCode || order.orderId || order.id}</strong>
              <small>{formatDate(order.createdAt)}</small>
            </div>
            <div className="seller-order-main">
              <div><span>Cliente</span><strong>{order.customerName || 'Não informado'}</strong></div>
              <div><span>Peça</span><strong>{order.garmentName || 'Peça não identificada'}</strong></div>
              <div><span>Quantidade</span><strong>{order.quantity || 0}</strong></div>
            </div>
            <div className="seller-order-state">
              <span className={`pipeline-status is-${order.status || 'pending'}`}>{STATUS_LABELS[order.status] || 'Atendimento'}</span>
              <small>{APPROVAL_LABELS[order.approvalStatus] || 'Aguardando aprovação'}</small>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
