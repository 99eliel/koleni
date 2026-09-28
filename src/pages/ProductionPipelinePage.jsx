import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import StaffAuth from '../components/StaffAuth';
import MartinpelBrand from '../components/MartinpelBrand';
import { listOrders, setOrderStatus } from '../lib/orderRepo';

const STAGES = [
  ['pending', 'Atendimento'],
  ['quoted', 'Orçamento'],
  ['approval', 'Aguardando cliente'],
  ['approved', 'Aprovado'],
  ['production', 'Produção'],
  ['quality', 'Conferência'],
  ['ready', 'Pronto'],
  ['completed', 'Concluído'],
];

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function PipelineBoard({ logout, isAdmin, profile }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState('');
  const [error, setError] = useState('');

  async function load(force = false) {
    setLoading(true);
    setError('');
    try {
      setOrders(await listOrders({ force, maxItems: 80 }));
    } catch (err) {
      setError(`Não foi possível carregar a produção: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  const grouped = useMemo(() => Object.fromEntries(
    STAGES.map(([status]) => [status, orders.filter((order) => (order.status || 'pending') === status)]),
  ), [orders]);

  async function move(order, direction) {
    const currentIndex = STAGES.findIndex(([status]) => status === (order.status || 'pending'));
    const nextIndex = Math.max(0, Math.min(STAGES.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) return;
    const nextStatus = STAGES[nextIndex][0];
    setMovingId(order.id);
    setError('');
    try {
      await setOrderStatus(order.id, nextStatus, order.sellerUid || '');
      setOrders((items) => items.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
    } catch (err) {
      setError(`Não foi possível mover o pedido: ${err.message}`);
    } finally {
      setMovingId('');
    }
  }

  return (
    <main className="pipeline-shell">
      <header className="pipeline-topbar">
        <MartinpelBrand compact subtitle="Fluxo de produção" />
        <div className="pipeline-topbar-actions">
          <span className="pipeline-user-role">{profile?.name || 'Equipe'} · {isAdmin ? 'Administrador' : 'Produção'}</span>
          {isAdmin && <Link className="button button-light" to="/admin">Painel administrativo</Link>}
          <button className="button admin-logout-button" type="button" onClick={logout}>Sair</button>
        </div>
      </header>

      <section className="pipeline-hero">
        <div>
          <p className="eyebrow">Operação</p>
          <h1>Pipeline de produção</h1>
          <p>Janela dos 80 pedidos mais recentes, sem atualização em tempo real. O quadro só lê novamente quando você clicar em atualizar.</p>
        </div>
        <div className="pipeline-hero-actions">
          <span>{orders.length} pedido(s) carregado(s)</span>
          <button className="button button-primary" type="button" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Atualizando…' : 'Atualizar quadro'}
          </button>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="pipeline-board">
        {STAGES.map(([status, label], stageIndex) => (
          <div className="pipeline-column" key={status}>
            <div className="pipeline-column-head">
              <div><span className={`pipeline-dot is-${status}`} /><strong>{label}</strong></div>
              <b>{grouped[status]?.length || 0}</b>
            </div>
            <div className="pipeline-column-list">
              {(grouped[status] || []).map((order) => {
                const working = movingId === order.id;
                return (
                  <article className="pipeline-card" key={order.id}>
                    <div className="pipeline-card-code">{order.displayCode || order.id}</div>
                    <h3>{order.customerName || 'Cliente não informado'}</h3>
                    <p>{order.garmentName || order.garmentId || 'Peça não identificada'}</p>
                    <div className="pipeline-card-meta">
                      <span>{order.quantity || 0} peça(s)</span>
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                    <small>{order.sellerEmail || 'Vendedor não identificado'}</small>
                    <div className="pipeline-card-actions">
                      <button type="button" disabled={working || stageIndex === 0} onClick={() => move(order, -1)}>←</button>
                      <button type="button" disabled={working || stageIndex === STAGES.length - 1} onClick={() => move(order, 1)}>
                        {working ? 'Salvando…' : stageIndex === STAGES.length - 2 ? 'Concluir' : 'Avançar →'}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!loading && (grouped[status]?.length || 0) === 0 && <div className="pipeline-empty">Nenhum pedido</div>}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function ProductionPipelinePage() {
  return (
    <StaffAuth allowedRoles={['production', 'admin']}>
      {({ logout, isAdmin, profile }) => <PipelineBoard logout={logout} isAdmin={isAdmin} profile={profile} />}
    </StaffAuth>
  );
}
