import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function readGarment(id) {
  const snapshot = await getDoc(doc(db, 'garments', id));
  return snapshot.exists() ? snapshot.data() : null;
}
