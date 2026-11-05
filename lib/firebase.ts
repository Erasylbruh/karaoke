import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';

// Web config is public by design (access is controlled by firestore.rules). Files live in Supabase Storage (lib/blob-store.ts).
// Values can be overridden with NEXT_PUBLIC_FIREBASE_* in .env.local.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBIPxWfy5kQVl-VRNgBdceiT_Xh0MYzP58',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'karaoke-craft.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'karaoke-craft',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '580167002539',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:580167002539:web:e7e9b9c6fe73e3be858aee',
};

const fresh = getApps().length === 0;
export const app = fresh ? initializeApp(firebaseConfig) : getApp();

// Optional fields are left undefined all over the app; Firestore would reject them otherwise.
export const db: Firestore = fresh
  ? initializeFirestore(app, { ignoreUndefinedProperties: true })
  : getFirestore(app);

export const auth = getAuth(app);
