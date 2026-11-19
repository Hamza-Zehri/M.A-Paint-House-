import { noteQuotaExhausted } from "./asyncUtils";
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCjxZp-I73eKfz0KMhoBVDSBtYbK4L90zQ",
  authDomain: "ma-paint-house.firebaseapp.com",
  projectId: "ma-paint-house",
  storageBucket: "ma-paint-house.firebasestorage.app",
  messagingSenderId: "758159782085",
  appId: "1:758159782085:web:c37d2a3990b13d368d00ac",
  measurementId: "G-BM95H7CZXB",
};

// Firestore retries a 429 five times internally. Remember the first quota
// response immediately so the app's action guards can block every later click
// while the SDK is still retrying the request that is already in flight.
if (typeof window !== "undefined" && !(window as any).__maphQuotaFetchWatch) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (response.status === 429 && /firestore\.googleapis\.com/.test(url)) noteQuotaExhausted();
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