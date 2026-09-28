import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import MartinpelBrand from '../components/MartinpelBrand';
import { db } from '../lib/firebase';
import '../approval.css';

export default function ApprovalPage() {
  const { orderId, token } = useParams();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [decision, setDecision] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDoc(doc(db, 'approvalPreviews', token))
      .then((snapshot) => {
        if (!active) return;
        if (!snapshot.exists() || snapshot.data()?.orderId !== orderId) {
          throw new Error('Este link de aprovação não é válido ou expirou.');
        }
        const data = snapshot.data();
        setPreview(data);
        setDecision(data.status === 'approved' || data.status === 'changes_requested' ? data.status : '');
        setNote(data.note || '');
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [orderId, token]);

  async function respond(nextDecision) {
    if (decision) return;
    if (nextDecision === 'changes_requested' && !note.trim()) {
      setError('Escreva o que precisa ser alterado antes de solicitar uma mudança.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const batch = writeBatch(db);
      const nextStatus = nextDecision === 'approved' ? 'approved' : 'approval';
      batch.update(doc(db, 'orders', orderId), {
        approvalProof: token,
        approvalStatus: nextDecision,
        approvalNote: note.trim(),
        approvalRespondedAt: serverTimestamp(),
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'approvalPreviews', token), {
        status: nextDecision,
        note: note.trim(),
        respondedAt: serverTimestamp(),
      });
      if (preview?.sellerUid) {
        batch.update(doc(db, 'sellerOrders', preview.sellerUid, 'orders', orderId), {
          approvalProof: token,
          approvalStatus: nextDecision,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setDecision(nextDecision);
    } catch (err) {
      setError(`Não foi possível registrar a resposta: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="approval-screen"><div className="approval-loading">Carregando arte para aprovação…</div></main>;

  if (error && !preview) {
    return (
      <main className="approval-screen">
        <section className="approval-card approval-error-card">
          <header className="approval-brand"><MartinpelBrand compact subtitle="Aprovação de arte" /></header>
          <h1>Link indisponível</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="approval-screen">
      <section className="approval-card">
        <header className="approval-brand"><MartinpelBrand compact subtitle="Aprovação de arte" /></header>
        <div className="approval-heading">
          <span>Pedido {preview?.displayCode || orderId}</span>
          <h1>Confira a personalização</h1>
          <p>Esta página serve somente para aprovar a arte montada pela equipe Martinpel. Nenhuma configuração do sistema fica disponível aqui.</p>
        </div>

        <div className="approval-meta">
          <div><span>Cliente</span><strong>{preview?.customerName || 'Cliente'}</strong></div>
          <div><span>Peça</span><strong>{preview?.garmentName || 'Uniforme personalizado'}</strong></div>
          <div><span>Quantidade</span><strong>{preview?.quantity || 0}</strong></div>
          <div><span>Versão</span><strong>V{preview?.designVersion || 1}</strong></div>
        </div>

        <div className="approval-art">
          {preview?.finalImageUrl ? <img src={preview.finalImageUrl} alt="Arte final para aprovação" /> : <div>Arte indisponível</div>}
        </div>

        {decision ? (
          <div className={`approval-result ${decision === 'approved' ? 'approved' : 'changes'}`}>
            <strong>{decision === 'approved' ? '✓ Arte aprovada' : '↺ Alteração solicitada'}</strong>
            <p>{decision === 'approved' ? 'A Martinpel já pode seguir com o fluxo interno deste pedido.' : 'A equipe Martinpel recebeu sua solicitação de alteração.'}</p>
          </div>
        ) : (
          <>
            <label className="approval-note">Observação para a equipe <span>(necessária apenas se pedir alteração)</span>
              <textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: aumentar a logo do peito; trocar a cor da manga..." disabled={busy} />
            </label>
            {error && <div className="approval-inline-error">{error}</div>}
            <div className="approval-actions">
              <button type="button" className="approval-change" onClick={() => respond('changes_requested')} disabled={busy}>Solicitar alteração</button>
              <button type="button" className="approval-approve" onClick={() => respond('approved')} disabled={busy}>{busy ? 'Registrando…' : 'Aprovar arte'}</button>
            </div>
          </>
        )}

        <footer>Martinpel · Aprovação vinculada somente a este pedido e a esta versão da arte.</footer>
      </section>
    </main>
  );
}
