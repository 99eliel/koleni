import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  "apiKey": "AIzaSyCnFjmGSvl_W5185JgLbg4rKZNBO9-TaxE",
  "authDomain": "personalizakoleni.firebaseapp.com",
  "projectId": "personalizakoleni",
  "storageBucket": "personalizakoleni.firebasestorage.app",
  "messagingSenderId": "909490650449",
  "appId": "1:909490650449:web:68a57e3c775fb5c7e8e770",
  "measurementId": "G-0MB2VW6EL7"
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const isFirebaseConfigured = true;
export { app };
