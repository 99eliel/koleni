import { useEffect, useState } from 'react';

export default function ApprovalShareToast() {
  const [approval, setApproval] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleCreated(event) {
      const detail = event.detail || {};
      if (!detail.id || !detail.approvalToken) return;
      const base = `${window.location.origin}${window.location.pathname}`;
      setApproval({
        id: detail.id,
        displayCode: detail.displayCode || detail.id,
        url: `${base}#/aprovar/${detail.id}/${detail.approvalToken}`,
      });
      setCopied(false);
    }
    window.addEventListener('martinpel:order-created', handleCreated);
    return () => window.removeEventListener('martinpel:order-created', handleCreated);
  }, []);

  if (!approval) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(approval.url);
      setCopied(true);
    } catch {
      window.prompt('Copie o link de aprovação:', approval.url);
    }
  }

  return (
    <div className="approval-share-toast">
      <div>
        <span>Pedido {approval.displayCode}</span>
        <strong>Link de aprovação pronto</strong>
        <small>Envie somente esta prova para o cliente. Ele não terá acesso ao sistema.</small>
      </div>
      <div className="approval-share-actions">
        <button type="button" onClick={copyLink}>{copied ? '✓ Copiado' : 'Copiar link'}</button>
        <button type="button" className="approval-share-close" onClick={() => setApproval(null)}>×</button>
      </div>
    </div>
  );
}
