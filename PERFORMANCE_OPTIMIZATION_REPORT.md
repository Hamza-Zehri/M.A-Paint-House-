# M.A Paint House — Performance & Reliability Optimization Report

Date: 2026-11-20

## Scope

The existing React/Vite/Firebase application was optimized in place. No business logic,
financial formula, page design, data model meaning, or feature was intentionally removed.
There is no custom API server: "API/backend" work here means Firestore access patterns,
client transactions, batches, rules, indexes, caching, retries, and request deduplication.

A pre-change checkpoint exists as Git tag `backup/pre-optimization`
(`66ddbe61dfc09ee05c0472dee823ba41b296331f`) and a file backup at
`C:\Users\Engr. Hamza Asad\AppData\Local\Temp\opencode\maph-backup-20261120`.

---

## 1. Modules optimized

| Area | What changed |
|---|---|
| Startup shell | All secondary pages lazy-loaded; Dashboard kept eager; splash minimum reduced from 950 ms to 180 ms; idle prefetch for likely pages and PDF code; hover/focus prefetch on nav and New Invoice. |
| Central store | Every post-mutation `refresh()` that re-read all 12 collections was replaced with targeted state patches. Derived `useMemo` maps give O(1) lookups for customers, products, invoices, ledger balances, paid amounts, and per-customer lists. |
| Invoice workflow | Product/customer lookups indexed; search deferred; line item product map; single idempotency key per save intent; invoice draft saved to localStorage; duplicate-click lock retained; atomic financial transaction. |
| Payment workflow | Deterministic payment receipt IDs from idempotency key; transaction-safe allocation using `paidAmount`; customer balance document; deferred/month memoized lists; payment draft preservation; duplicate-click lock. |
| Dashboard / Reports / Ledger | Single-pass memoized aggregates, memoized sorts, indexed balance lookups, deferred report filters. |
| Catalogue / Customers / Families / Pricing | Prebuilt search indexes, memoized family/category maps, O(1) family/pricing lookups, deferred search. |
| Invoice history | Indexed customer and paid lookups, single balance computation, deferred search, 100-row incremental rendering. |
| PDF | jsPDF and its transitive chunks moved behind a dynamic-import facade; synchronous HTML print path left untouched to preserve popup behavior. |
| Reliability | Timeouts, retry only for retryable network/timeout errors, idempotency keys, deterministic document IDs, connection indicator, offline-safe error messages. |
| Observability | `window.__maphPerf` records real durations for navigation, UI actions, and data operations. |

---

## 2. Files changed

### New

- `src/lib/perf.ts` — rolling real-duration instrumentation and `window.__maphPerf`.
- `src/lib/asyncUtils.ts` — `withTimeout`, `retry`, network-error classification, paint/idle helpers, friendly errors.
- `src/lib/selectors.ts` — indexed selectors, balance rebuild, product search helpers, idempotent ID helper, chunking.
- `src/lib/pdfLazy.ts` — dynamic PDF facade with `prefetchPdf()`.
- `src/lib/pdfNames.ts` — lightweight filename helpers with no jsPDF dependency.
- `firestore.indexes.json` — deployed index config; intentionally empty because all current queries use Firestore's automatic single-field indexes.
- `tests/core.test.ts`, `tests/async.test.ts` — Node 25 built-in test runner suites.
- `PERFORMANCE_OPTIMIZATION_REPORT.md` — this report.

### Modified

- `src/App.tsx` — lazy routes, prefetch, Suspense skeleton, shorter splash, navigation perf marks.
- `src/store/AppContext.tsx` — derived indexes, targeted patches, batched writes, financial transactions, idempotency, balance documents, paid-amount maintenance.
- `src/lib/db.ts` — shared refs, `balanceRef`, write batches of 450, count aggregate helper, batched `clearAll`.
- `src/lib/types.ts` — optional `idempotencyKey` and `paidAmount` fields.
- `src/lib/asyncUtils.ts`, `src/lib/perf.ts`, `src/lib/selectors.ts` — hardened for tests/browser use.
- `src/hooks/useActionLock.ts` — synchronous ref-based duplicate-click prevention and UI action timing.
- `src/lib/seed.ts` — cleans stale legacy balance row.
- `src/pages/Dashboard.tsx`, `Reports.tsx`, `Ledger.tsx`.
- `src/pages/AllProducts.tsx`, `Customers.tsx`, `ProductFamilies.tsx`, `PriceManagement.tsx`.
- `src/pages/Invoice.tsx`, `InvoiceHistory.tsx`, `Payments.tsx`.
- `firestore.rules`, `firebase.json`, `package.json`.

---

## 3. Database / Firestore optimizations

1. **Removed post-mutation full refreshes.** Mutations now patch only affected arrays in React state. Previously nearly every mutation re-downloaded all 12 collections.
2. **Batched writes.** `commitWrites()` groups up to 450 operations per `writeBatch`, eliminating sequential N+1 round trips for pricing/import/delete operations.
3. **Atomic financial writes.** Invoice creation, editing, and payment recording use `runTransaction`.
4. **Canonical customer balance documents.** New `customerBalances/{customerId}` rows are read/written inside financial transactions. Web SDK transactions cannot read queries; deterministic doc reads give conflict detection when two users touch the same customer concurrently.
5. **Idempotency by deterministic IDs.** Invoice, payment, allocation, and ledger IDs are derived from the idempotency key. A retry after timeout targets the same documents instead of creating duplicates.
6. **Transaction-safe invoice allocation.** `Invoice.paidAmount` is updated atomically while recording or reversing payments, preventing two concurrent payments from over-allocating the same invoice.
7. **Aggregate counts.** `countDocs()` uses Firestore count aggregates instead of downloading documents just to count them.
8. **Indexes.** After removing `latestLedgerQuery`, every remaining Firestore query is a single-field equality query (`customerId`, `invoiceId`, or `paymentId`). Firestore provides those single-field indexes automatically, so `firestore.indexes.json` is intentionally empty. An initial composite-index proposal was rejected by Firebase as "not necessary"; it was removed and the empty index set deployed successfully.
9. **Security rules.** Signed-in non-legacy users required; conservative shape validation for invoices, payments, allocations, ledger, customer balances, customers, settings, and pricing; audit history is append-only.
10. **Parallel independent reads.** Initial `refresh()` uses `Promise.all`; payment candidate invoice reads and balance reads are parallelized where safe.

---

## 4. API / data-path optimizations

- One candidate-invoice query per payment save instead of repeated scans/fetches per allocation.
- No full-collection re-fetch after CRUD; targeted local patches reflect the exact documents written.
- Timeout wrapper on all mutations (15 s). Idempotent mutations retry once only on network/timeout/retryable codes.
- Request deduplication uses prebuilt maps rather than repeated `Array.find`.
- PDF chunks are requested only when a PDF is actually created, then cached by the browser/Vite.
- Idle prefetch keeps common navigation and PDF creation fast without blocking authentication or initial data load.

---

## 5. Measured performance — before / after

### Production bundle (real `pnpm build` output)

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Main JS chunk (raw) | 1,331.5 KB | 867.65 KB | −463.85 KB (−34.8%) |
| Main JS chunk (gzip) | not captured in baseline | 261.05 KB | — |
| CSS (raw) | 81.8 KB | 85.07 KB | +3.27 KB |
| All measured startup assets (raw) | 1,784.6 KB | 952.72 KB | −831.88 KB (−46.6%) |
| Startup assets (gzip) | not captured in baseline | 279.58 KB | — |
| Deferred PDF chunks (raw) | loaded upfront | 813.30 KB on demand | 0 KB at startup |
| Deferred PDF chunks (gzip) | loaded upfront | 248.51 KB on demand | 0 KB at startup |

The remaining main chunk is still above Vite's 500 KB warning threshold. It contains React,
Firebase Auth/Firestore, and the store; it is not PDF code.

### Real browser selector benchmark (Chrome, dev server, dynamic import of `selectors.ts`)

| Operation | Measured |
|---|---:|
| Build indexes + balances for 100 invoices/allocations | 1.10 ms |
| Build + filter search index for 100 products | 0.40 ms |

### Node 25 test-runner benchmark (final run)

| Operation | Measured |
|---|---:|
| 100-invoice index/balance build | 5.20 ms |
| 100-product search index/filter | 1.54 ms |

All benchmark assertions require <100 ms and pass with wide margin.

### Data-access path counts (analytical, from code)

| Path | Before | After |
|---|---:|---:|
| Refreshes after mutation | 12 collection reads | 0 |
| Invoice create financial writes | sequential writes | 1 transaction + targeted state patch |
| Payment record + allocations | sequential writes + refresh | 1 candidate query + 1 transaction |
| Bulk pricing/import writes | per-document writes | batches of up to 450 |

End-to-end Firestore latency could not be measured here because no authenticated Firebase
credentials were available in the harness. No network timings have been invented.

---

## 6. Tests performed

- `pnpm typecheck` — pass.
- `pnpm build` — pass.
- `pnpm test` — 15/15 pass.
- `pnpm deploy:rules` — pass; `firestore.rules` compiled and released to `ma-paint-house`.
- `pnpm deploy:indexes` — pass after correcting the index file; final empty index set deployed to `(default)` database.
  - Money/paisa calculations.
  - Indexed selectors, latest balances, invoice balances, ledger rebuild.
  - 100 invoices and 100 products benchmarks.
  - Deterministic idempotency IDs and 20 rapid duplicate-click simulation.
  - Timeout behavior, already-completed operation, retry of transient failures, no retry on validation errors.
  - Network-error classification and real duration/failure instrumentation.
- Browser smoke test on `http://localhost:8443/`:
  - Login screen renders.
  - `window.__maphPerf` is installed.
  - Zero console errors.
  - Lighthouse (dev server): Best Practices 1.00, SEO 1.00, Accessibility 0.98 (only issue: login page has no `<main>` landmark).

---

## 7. Remaining bottlenecks / issues needing attention

1. **Initial data load still reads all business collections.** The store loads 12 collections on authentication. This is now one parallel batch, but a large Firestore database will still be limited by the largest collection. Next step: cursor/paged loading or selective collection loading by page.
2. **Entry bundle remains 867 KB raw / 261 KB gzip.** Firebase SDK + React dominate. Splitting vendor chunks improves caching but does not reduce downloaded bytes much.
3. **Firestore latency/transaction conflicts not measured live.** Concurrent writes to the same customer intentionally conflict on `customerBalances` and retry; under heavy contention some operations may fail and must be retried by the user.
4. **Rules and indexes are deployed.** Both commands completed successfully against `ma-paint-house`. Re-run them if these files change.
5. **Timeout duplicate path UI patch.** If a save commits but the response times out, retries safely return the original record without duplicating data. Related derived rows may require a refresh to appear in the current view; no financial duplication occurs.
6. **Search behavior note.** `AllProducts` now also matches product brand via the shared search helper. This is additive, not a calculation change.
7. **Manual authenticated QA still recommended.** Exercise invoice save/share, payment record/reverse/delete, PDF download, import, and settings backup with production-like data and slow-network throttling.

---

## 8. Operational notes

- `window.__maphPerf.summary()` returns average/p95/max/failure counts for measured operations.
- `window.__maphPerf.clear()` resets the rolling buffer.
- `pnpm test` uses Node 25's built-in TypeScript stripping; no new test dependency was added.
- Deploy scripts: `pnpm deploy:rules`, `pnpm deploy:indexes`, `pnpm deploy:hosting`.
