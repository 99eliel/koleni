import { auth } from './firebase';

export async function ensureClientUser() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('Sua sessão interna expirou. Entre novamente no sistema.');
  }
  return user;
}
