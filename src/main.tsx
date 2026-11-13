import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Suppress harmless Firestore internal BloomFilter warnings.
// These are a known non-issue in Firebase SDK — Firestore recovers automatically.
// We only silence this one specific message; all other warnings remain visible.
if (import.meta.env.PROD) {
  const _warn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("BloomFilter")) return;
    _warn(...args);
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
