import { useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getStaffAccess } from '../lib/staffRepo';
import MartinpelBrand from './MartinpelBrand';
import '../admin.css';

const DEFAULT_ROLES = ['admin', 'seller', 'production'];

export default function StaffAuth({ children, allowedRoles = DEFAULT_ROLES }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;

      if (!nextUser || nextUser.isAnonymous) {
        if (nextUser?.isAnonymous) {
          try { await signOut(auth); } catch {}
        }
        if (active) {
          setUser(null);
          setAccess(null);
          setReady(true);
        }
        return;
      }

      try {
        const nextAccess = await getStaffAccess(nextUser);
        const roleAllowed = nextAccess.allowed && allowedRoles.includes(nextAccess.role);

        if (!roleAllowed) {
          await signOut(auth);
          if (active) {
            setUser(null);
            setAccess(null);
            setError(nextAccess.active
              ? 'Sua função não possui acesso a esta área.'
              : 'Sua conta ainda não foi liberada ou está bloqueada. Procure um administrador.');
            setReady(true);
          }
          return;
        }

        if (active) {
          setUser(nextUser);
          setAccess(nextAccess);
          setError('');
          setMessage('');
          setReady(true);
        }
      } catch {
        try { await signOut(auth); } catch {}
        if (active) {
          setUser(null);
          setAccess(null);
          setError('Não foi possível validar seu acesso. Tente novamente.');
          setReady(true);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [allowedRoles.join('|')]);

  async function login(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Não foi possível entrar. Confira e-mail e senha.');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Digite seu e-mail acima para receber o link de recuperação.');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setMessage('Link de recuperação enviado. Confira sua caixa de entrada e o spam.');
    } catch {
      setError('Não foi possível enviar a recuperação de senha. Confira o e-mail informado.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return <main className="loading-screen">Verificando acesso…</main>;

  if (!user || !access) {
    return (
      <main className="login-shell">
        <form className="panel login-card staff-login-card" onSubmit={login}>
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso interno" /></div>
          <p className="eyebrow">Equipe Martinpel</p>
          <h1>Gestão de Personalização</h1>
          <p className="muted">Entre com seu e-mail e senha. O acesso depende da função e do status definidos pelo administrador.</p>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          {message && <div className="notice notice-success">{message}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar no sistema'}</button>
          <button className="button button-ghost" type="button" onClick={resetPassword} disabled={loading}>Esqueci minha senha</button>
        </form>
      </main>
    );
  }

  return children({
    user,
    profile: access.profile,
    role: access.role,
    isAdmin: access.role === 'admin',
    isProduction: access.role === 'production',
    legacyAccess: access.legacy,
    logout: () => signOut(auth),
  });
}
