import { useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getStaffAccess } from '../lib/staffRepo';
import MartinpelBrand from './MartinpelBrand';
import '../admin.css';

export default function AdminAuth({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [legacyAccess, setLegacyAccess] = useState(false);
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
          setProfile(null);
          setLegacyAccess(false);
          setReady(true);
        }
        return;
      }

      try {
        const access = await getStaffAccess(nextUser);
        if (!access.allowed || access.role !== 'admin') {
          await signOut(auth);
          if (active) {
            setUser(null);
            setProfile(null);
            setLegacyAccess(false);
            setError(access.active
              ? 'Esta conta não possui acesso administrativo.'
              : 'Esta conta está bloqueada ou ainda não foi liberada pela administração.');
            setReady(true);
          }
          return;
        }

        if (active) {
          setUser(nextUser);
          setProfile(access.profile);
          setLegacyAccess(access.legacy);
          setError('');
          setMessage('');
          setReady(true);
        }
      } catch {
        try { await signOut(auth); } catch {}
        if (active) {
          setUser(null);
          setProfile(null);
          setLegacyAccess(false);
          setError('Não foi possível validar o acesso administrativo. Tente novamente.');
          setReady(true);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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

  if (!user) {
    return (
      <main className="login-shell">
        <form className="panel login-card" onSubmit={login}>
          <div className="login-brand-block"><MartinpelBrand subtitle="Acesso administrativo" /></div>
          <p className="eyebrow">Área administrativa</p>
          <h1>Gestão de Personalização</h1>
          <p className="muted">Entre com uma conta ativa da equipe com função Administrador.</p>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <div className="inline-error">{error}</div>}
          {message && <div className="notice notice-success">{message}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
          <button className="button button-ghost" type="button" onClick={resetPassword} disabled={loading}>Esqueci minha senha</button>
        </form>
      </main>
    );
  }

  return children({ user, profile, legacyAccess, logout: () => signOut(auth) });
}
