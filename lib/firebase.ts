import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';

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

// App Check (reCAPTCHA v3) attaches a proof that requests come from this site, so scripts can be told
// apart in Firebase Console → App Check. On only when NEXT_PUBLIC_RECAPTCHA_SITE_KEY is set.
// Keep ENFORCEMENT OFF for Firestore: lib/server-meta.ts, the ban check in lib/server/storage.ts and the
// aligner read or write Firestore over REST without App Check tokens, and the upload route refuses
// uploads when it cannot read the profile — enforcement would block every upload.
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
if (fresh && typeof window !== 'undefined' && RECAPTCHA_SITE_KEY && process.env.NEXT_PUBLIC_USE_EMULATORS !== '1') {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

// Optional fields are left undefined all over the app; Firestore would reject them otherwise.
export const db: Firestore = fresh
  ? initializeFirestore(app, { ignoreUndefinedProperties: true })
  : getFirestore(app);

export const auth = getAuth(app);
// Letters (email confirmation, password reset) come in Russian.
auth.languageCode = 'ru';

// Local testing against the Firebase emulators (Firestore :8080, Auth :9099), e.g. to check
// firestore.rules with the real app: NEXT_PUBLIC_USE_EMULATORS=1 in .env.development.local.
if (fresh && process.env.NEXT_PUBLIC_USE_EMULATORS === '1') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
