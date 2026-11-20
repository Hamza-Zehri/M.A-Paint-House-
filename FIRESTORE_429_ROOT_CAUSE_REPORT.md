# Firestore `429 RESOURCE-EXHAUSTED` on `customerBalances` — Root Cause & Fix

Date: 2026-11-20 · Firebase JS SDK 13.3.0 (`@firebase/firestore` 4.20.0)

## Executive summary

The 429 was **not** caused by a React render loop, an `onSnapshot` listener, or a component fetching the balance independently. The current source has **zero** `onSnapshot` listeners and no component performs a balance fetch on render.

The repeated `BatchGetDocuments` calls came from **Firestore transaction retries**. Every financial mutation reads the canonical `customerBalances/{customerId}` document inside `runTransaction()`:

| Path | Balance read |
|---|---|
| `createInvoice` | `tx.get(balanceRef(customerId))` |
| `editInvoice` | `tx.get(balanceRef(customerId))` when net payable changed |
| `recordPayment` | `tx.get(balanceRef(customerId))` |

The previous optimization removed invoice/customer/settings reads from these transactions and left the balance document as the only atomic read. That fixed the `invoices/inv_...` storm but concentrated all contention and retry pressure on `customerBalances`.

When the backend returns `RESOURCE_EXHAUSTED` (429) — or `ABORTED` from write contention — the Firestore Web SDK treats it as a **transient** error (`isPermanentError(RESOURCE_EXHAUSTED) === false`) and re-runs the whole transaction callback up to **5 times** with exponential backoff. Each attempt re-issues `tx.get(balanceRef(...))`, producing exactly the observed pattern: the same balance document requested repeatedly within seconds, followed by a `resource-exhausted` console error.

The `Invoice-C9P0ucy6.js` / `useActionLock onClick` stack frame is the **click path**, not the code that owns the Firestore call:

```
Invoice button onClick
  → useActionLock.lock("save-invoice" | "save-share")
  → Invoice.handleSave()
  → createInvoice() / editInvoice()
  → runCustomerTransaction()
  → readBalanceInTransaction()
  → tx.get(balanceRef(customerId))   // BatchGetDocuments
```

`useActionLock` itself never calls Firestore. Its ref-based busy set correctly blocks two rapid clicks on the *same* key, but the two save buttons used different keys (`save-invoice` and `save-share`) and the lock is per component instance, so a remount or the other button could still start a second transaction. The deterministic idempotency key prevents duplicate invoice documents, but a second transaction still repeats the balance read.

Two more app-level defects amplified it:

1. **`recordPayment` nested two guarded/timeout wrappers** (`guardIdempotent` → `guard` → `runTransaction`). A 15 s timeout rejects the outer promise but cannot cancel the SDK transaction; the outer retry then started a second full transaction. Up to 10 balance reads for one payment.
2. **Non-transactional balance writes** (`cancelInvoice`, `reversePayment`, `deleteInvoice`, `deletePayment`) computed the new balance from the ledger-derived React map, not the canonical document. Besides being a stale-data risk, those batched writes to the same balance document caused `ABORTED` conflicts with the transactions, triggering more SDK retries.

The quota gate only checked *before* starting an action (`assertQuotaAvailable`). Once a transaction was in flight, nothing could stop the SDK's internal retry loop.

## Fix implemented

### 1. Centralized balance service — `src/lib/customerBalanceService.ts` (new)

- Single owner of all balance Firestore reads (`getDoc`, `getDocFromCache`, `tx.get`, and the optional `onSnapshot` helper).
- **Short-lived (10 s) display cache** — never used to authorize a financial write. `peekBalance()` is the synchronous O(1) read used by the UI.
- **Single-flight de-duplication**: concurrent requests for the same customer share one promise (`inFlight` map).
- **Per-customer keyed mutex**: transactions for the same customer queue instead of racing, eliminating contention-driven `ABORTED` retries.
- **Authoritative transaction read** (`readBalanceInTransaction`) always calls `tx.get()` — cached values are never used for money decisions.
- **Bounded, jittered retry** (max 2 attempts) with a global quota gate checked before every attempt; `resource-exhausted` is never retried.
- `primeBalance` / `primeBalances` / `invalidateBalance` after successful writes; a ledger-derived value cannot overwrite a newer authoritative value.
- `balanceWriteOp()` centralizes batched balance writes.
- `watchBalance()` provides one tracked listener per customer with a real unsubscribe (the UI does not subscribe today).

### 2. SDK retry storm stopped at the source — `src/store/AppContext.tsx`

- All three financial transactions now call `runCustomerTransaction(customerId, operation, fn)`, which:
  - serializes per customer,
  - passes **`{ maxAttempts: 1 }`** to `runTransaction`, so a 429 cannot re-read the balance 5 times inside the SDK,
  - checks the quota gate before each attempt,
  - performs at most one additional app-level retry with jitter only for genuinely retryable errors.
- Removed the nested `guard("payment.transaction", ...)` around `recordPayment`; one guarded idempotent path remains.
- `getFreshBalance()` is now used before `cancelInvoice`, `reversePayment`, `deleteInvoice` and `deletePayment`, so no mutation is finalized with a display-cache value. Ledger rows rewritten by delete paths are drift-aligned with the canonical balance.
- Successful transactions prime the service with the exact committed balance; failure/invalidation paths are explicit.
- `customerBalance()` now delegates to the service and every page (Dashboard, Customers, Invoice, Payments, Ledger, Reports) uses that one API.

### 2b. Invoice click path made single-flight — `src/pages/Invoice.tsx`, `src/store/AppContext.tsx`

- Both save buttons now use the **same lock key** (`save-invoice`) and `lockResult`, so Save and Save & WhatsApp cannot run concurrently. The busy state disables both buttons.
- `handleSave` returns the saved invoice and resets `saving` in `finally`; the idempotency key rotates only after a successful save.
- `createInvoice`, `editInvoice` and `recordPayment` are wrapped in a module-level promise map keyed by idempotency key (or invoice id). A second click, remount, or outer timeout retry joins the original in-flight operation instead of opening a second transaction and repeating `tx.get(customerBalances/{id})`.
- Duplicate-operation hits are exposed in diagnostics as `operationDedupHits`.

### 3. Retry-After and rate-limit handling — `src/lib/asyncUtils.ts`, `src/lib/firebase.ts`

- `noteQuotaExhausted(retryAfterMs?)` stores a cooldown (60 s minimum, 5 min maximum) using **exponential backoff with jitter** (60 s → 120 s → 240 s for consecutive quota failures). `Retry-After` always wins over the computed delay. New requests are blocked by `assertQuotaAvailable()` until the cooldown expires; a 429 is never retried immediately.
- The `window.fetch` interceptor parses `Retry-After` on Firestore 429 responses and records the quota event immediately.
- `assertQuotaAvailable()` is exported and checked in guards, refresh, seeding, cleanup and the balance service.
- All failures propagate to the existing `friendlyError()` toast; no failed request is treated as successful.

### 4. Diagnostics — `src/lib/firestoreDiagnostics.ts` (new)

`window.__maphFirestoreDiag.snapshot()` / `.reset()` report:

- reads per customer (hashed token, no raw IDs/names/amounts),
- repeated identical document reads within 2 s,
- in-flight balance-read dedup hits and duplicate invoice/payment operation hits, display-cache hits, persistent-cache hits,
- active snapshot listeners (0 in this app),
- Firestore call counts (`getDoc`, `getDocs`, `runTransaction`, `batch.commit`, transport fetches),
- failed requests by error code, resource-exhausted count, retry counts,
- request timestamps for frequency checks,
- last 240 read events with operation label.

All `db.ts` reads/writes are instrumented; no customer data is logged.

### 5. Firestore read reduction

| Path | Before | After |
|---|---:|---:|
| Invoice create balance read | 1 per SDK attempt (up to 5 on 429/contention) | 1 per action (SDK `maxAttempts: 1`, ≤2 app attempts) |
| Payment record balance read | 1 per SDK attempt × up to 2 nested transactions | 1 per action, serialized per customer |
| Second Save / Save & WhatsApp click or remount | second transaction + second balance read | joined to the first promise (`operationDedupHits`) |
| Concurrent saves, same customer | conflicting → `ABORTED` → SDK retries | queued by per-customer mutex |
| Quota exhaustion | SDK retries continued; new actions still started | cooldown set on first 429; **zero** new reads until it expires |
| Component balance display | memoized ledger map (no reads) | same, via one service API |
| Snapshot listeners on balances | none | none (tracked helper available) |

## Security review

- `firestore.rules` unchanged and **not weakened**: signed-in non-legacy users only, shape validation on money documents, append-only audit, self-only user profile reads, deny by default.
- No privileged credentials in frontend code. `firebaseConfig.apiKey` is a public app identifier; a comment now records that it must be referrer/API restricted in the Firebase console (production host + localhost).
- **App Check is not configured in the client and not enforced in rules.** This is a console-side decision: enabling it requires a site key and a rules change (`request.appCheck`). It was deliberately not enabled blindly, because doing so without a valid provider would break all reads. Recommended next step: enable reCAPTCHA Enterprise/Play Integrity in the console, add the client provider, then enforce in rules.
- Rules/indexes were already deployed previously; no rules or index changes are part of this fix, so only hosting needs redeploying.

## Testing

- `pnpm typecheck` — pass (0 errors).
- `pnpm test` — **23/23 pass**, including per-customer mutex serialization/release, duplicate financial-action promise dedupe, exponential quota backoff with jitter, quota cooldown + Retry-After, and hashed diagnostics with duplicate-read detection.
- `pnpm build` — pass (main chunk 959.39 kB raw / 288.14 kB gzip; unchanged scope).
- Browser smoke test after the latest build on the running dev server (`http://localhost:8443/`): login screen renders, `window.__maphFirestoreDiag` and `window.__maphPerf` are installed, **0 console errors**, **0 Firestore calls**, **0 balance reads**, **0 operation dedup hits**, **0 active listeners** before authentication.

Not verifiable in this harness: authenticated end-to-end QA (dashboard → customer → ledger → invoice → payment → repeated navigation, throttled network) because no Firebase Authentication credentials are available here. Those steps must be run by the owner against the production project, using `window.__maphFirestoreDiag.snapshot()` before and after each flow. Expected result: `duplicateBalanceReads === 0`, `readsPerCustomer` grows by at most one per financial action, `operationDedupHits` only rises on intentional duplicate clicks, `activeListeners === 0`, `quotaEvents === 0` after a normal flow.

## Production stack trace verification

The later production console trace confirms the same diagnosis:

- Request timestamps `01:42:51.812`, `01:42:53.557`, `01:42:54.643`, `01:42:57.171`, `01:43:00.702` are exactly **five** `BatchGetDocuments` attempts for the same `customerBalances/mwnfpsgj-qbw0xlmy` document. That matches the SDK default `maxAttempts: 5`, not the fixed build.
- The stack includes `KS.retries`, `enqueueAfterDelay`, `handleDelayElapsed`, and `setTimeout`, which are Firestore's internal `TransactionRetry` async queue — not React state/effect retries.
- The production chunk names in that trace are `index-ymKLqpr_.js`, `Invoice-C9P0ucy6.js`, and `useActionLock-2W4jBKN5.js`.
- The current fixed local build emits `index-DgAwLPWm.js`, `Invoice-yUvHgaUk.js`, and `useActionLock-DNL0j9bw.js`.

Therefore the tested production page was still serving the old bundle (or a cached old `index.html`). After deploying, verify the loaded chunk names change and hard-reload once before judging the fix.

## Deployment

```bash
pnpm deploy:hosting
```

No rules/index deploy required for this change.
