import { useEffect, useMemo, useState } from 'react';
import { saveProductionChecklist, setOrderStatus } from '../lib/orderRepo';
import { openTechnicalSheet } from '../lib/technicalSheet';

const STATUS_OPTIONS = [
  ['pending', 'Aguardando atendimento'],
  ['quoted', 'Orçamento gerado'],
  ['approval', 'Aguardando aprovação'],
  ['approved', 'Aprovado'],
  ['production', 'Em produção'],
  ['quality', 'Conferência'],
  ['ready', 'Pronto'],
  ['completed', 'Concluído'],
];

const CHECKS = [
  ['garmentChecked', 'Peça correta'],
  ['colorsChecked', 'Cores conferidas'],
  ['logosChecked', 'Logos e posições'],
  ['sizesChecked', 'Grade conferida'],
  ['finalChecked', 'Conferência final'],
];

const APPROVAL_LABELS = {
  pending: 'Ainda não respondida',
  approved: 'Arte aprovada pelo cliente',
  changes_requested: 'Cliente solicitou alteração',
};

export default function OrderOperationsPanel({ order, disabled = false, onSaved }) {
  const [status, setStatus] = useState(order.status || 'pending');
  const [checklist, setChecklist] = useState(order.productionChecklist || {});
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    setStatus(order.status || 'pending');
    setChecklist(order.productionChecklist || {});
    setLinkCopied(false);
  }, [order.status, order.productionChecklist, order.approvalStatus]);

  const checkedCount = useMemo(
    () => CHECKS.filter(([key]) => Boolean(checklist[key])).length,
    [checklist],
  );

  async function changeStatus(event) {
    const next = event.target.value;
    setStatus(next);
    setSaving('status');
    setError('');
    try {
      await setOrderStatus(order.id, next, order.sellerUid || '');
      await onSaved?.();
    } catch (err) {
      setStatus(order.status || 'pending');
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function saveChecklist() {
    setSaving('checklist');
    setError('');
    try {
      await saveProductionChecklist(order.id, checklist);
      await onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function printSheet() {
    setSaving('sheet');
    setError('');
    try {
      await openTechnicalSheet({ ...order, status, productionChecklist: checklist });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  }

  async function copyApprovalLink() {
    if (!order.approvalToken) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}#/aprovar/${order.id}/${order.approvalToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch {
      window.prompt('Copie o link de aprovação:', url);
    }
  }

  return (
    <section className="order-operations-panel">
      <div className="order-operations-head">
        <div>
          <span className="order-operations-kicker">Produção</span>
          <strong>Controle operacional</strong>
        </div>
        <span className="order-version-pill">Versão {order.designVersion || 1}</span>
      </div>

      {order.approvalToken && (
        <div className="approval-admin-row">
          <div>
            <span>Aprovação do cliente</span>
            <strong>{APPROVAL_LABELS[order.approvalStatus || 'pending'] || 'Aguardando resposta'}</strong>
          </div>
          <button className="button button-secondary" type="button" onClick={copyApprovalLink} disabled={disabled}>
            {linkCopied ? '✓ Link copiado' : 'Copiar link de aprovação'}
          </button>
        </div>
      )}

      <div className="order-status-control">
        <label>Status do pedido
          <select value={status} onChange={changeStatus} disabled={disabled || saving === 'status'}>
            {STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="button" onClick={printSheet} disabled={disabled || saving === 'sheet'}>
          {saving === 'sheet' ? 'Gerando…' : 'Ficha técnica + QR'}
        </button>
      </div>

      <div className="production-checklist-head">
        <span>Checklist de conferência</span>
        <strong>{checkedCount}/{CHECKS.length}</strong>
      </div>
      <div className="production-checklist">
        {CHECKS.map(([key, label]) => (
          <label className={checklist[key] ? 'checked' : ''} key={key}>
            <input
              type="checkbox"
              checked={Boolean(checklist[key])}
              onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))}
              disabled={disabled}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <button className="button button-secondary full-width" type="button" onClick={saveChecklist} disabled={disabled || saving === 'checklist'}>
        {saving === 'checklist' ? 'Salvando conferência…' : 'Salvar conferência'}
      </button>

      {error && <div className="inline-error">{error}</div>}
    </section>
  );
}
