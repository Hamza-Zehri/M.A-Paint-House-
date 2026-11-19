import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
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

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
// Long polling is far more reliable than the default WebChannel streaming
// transport in some networks/browsers, where the first request can hang.
// A persistent local cache lets the app survive a temporary Firestore quota
// error without losing the last successfully loaded workspace.
function createFirestore() {
  const options = { experimentalForceLongPolling: true } as const;
  if (typeof indexedDB !== "undefined") {
    try {
      return initializeFirestore(app, {
        ...options,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch (error) {
      console.warn("Persistent Firestore cache unavailable; using memory cache.", error);
    }
  }
  return initializeFirestore(app, options);
}

export const firestore = createFirestore();
export default app;