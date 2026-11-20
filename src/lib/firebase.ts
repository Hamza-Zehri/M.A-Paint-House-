import { noteQuotaExhausted } from "./asyncUtils";
import { recordFirestoreCall, recordQuota } from "./firestoreDiagnostics";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

// The web API key is a public application identifier, not a secret. Restrict it
// in the Firebase console to the authorized HTTP referrers (production host +
// localhost) and to the APIs this app uses. Firestore rules (see firestore.rules)
// remain the real authorization boundary and are never relaxed for performance.
const firebaseConfig = {
  apiKey: "AIzaSyCjxZp-I73eKfz0KMhoBVDSBtYbK4L90zQ",
  authDomain: "ma-paint-house.firebaseapp.com",
  projectId: "ma-paint-house",
  storageBucket: "ma-paint-house.firebasestorage.app",
  messagingSenderId: "758159782085",
  appId: "1:758159782085:web:c37d2a3990b13d368d00ac",
  measurementId: "G-BM95H7CZXB",
};

// Firestore retries a 429 five times internally (RESOURCE_EXHAUSTED is treated
// as a transient error by the SDK's transaction runner). Remember the first
// quota response immediately so every *new* request is blocked while the SDK
// finishes retrying the one already in flight, and honour Retry-After.
if (typeof window !== "undefined" && !(window as any).__maphQuotaFetchWatch) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/firestore\.googleapis\.com/.test(url)) return response;
    recordFirestoreCall("transport.fetch");
    if (response.status === 429) {
      recordQuota("transport.fetch");
      let retryAfterMs = 0;
      try {
        const header = response.headers?.get?.("retry-after");
        if (header) {
          const seconds = Number(header);
          retryAfterMs = Number.isFinite(seconds) && seconds > 0
            ? seconds * 1000
            : Math.max(0, Date.parse(header) - Date.now());
        }
      } catch { /* header may be absent or opaque */ }
      noteQuotaExhausted(retryAfterMs);
    }
    return response;
  };
  (window as any).__maphQuotaFetchWatch = true;
}

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
// Long polling is far more reliable than the default WebChannel streaming
// transport in some networks/browsers, where the first request can hang.
// A persistent local cache lets the app survive a temporary Firestore quota
// error without losing the last successfully loaded workspace.
function createFirestore(): Firestore {
  // Vite HMR re-evaluates this module. Keep one instance so a reload never
  // calls initializeFirestore() twice with different options.
  const existing = (globalThis as any).__maphFirestore as Firestore | undefined;
  if (existing) return existing;

  const options = { experimentalForceLongPolling: true } as const;
  let instance: Firestore;
  if (typeof indexedDB !== "undefined") {
    try {
      instance = initializeFirestore(app, {
        ...options,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (error) {
      console.warn("Persistent Firestore cache unavailable; using memory cache.", error);
      instance = initializeFirestore(app, options);
    }
  } else {
    instance = initializeFirestore(app, options);
  }
  (globalThis as any).__maphFirestore = instance;
  return instance;
}

export const firestore = createFirestore();
export default app;