import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function writeGarment(id, data) {
  await setDoc(doc(db, 'garments', id), data);
}
