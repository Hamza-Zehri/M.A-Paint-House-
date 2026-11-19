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
- `src/lib/snapshotCache.ts` — last-known-good workspace snapshot used for instant reloads and quota fallback.
- `firestore.indexes.json` — deployed index config; intentionally empty because all current queries use Firestore's automatic single-field indexes.
- `tests/core.test.ts`, `tests/async.test.ts`, `tests/snapshot.test.ts` — Node 25 built-in test runner suites.
- `PERFORMANCE_OPTIMIZATION_REPORT.md` — this report.

### Modified

- `src/App.tsx` — lazy routes, prefetch, Suspense skeleton, shorter splash, navigation perf marks, phone bottom navigation.
- `src/index.css` — responsive tables/forms/grids/drawer plus a final phone-breakpoint correction block; viewport-fit safe areas.
- `index.html` — `viewport-fit=cover` for notched phones.
- `src/store/AppContext.tsx` — derived indexes, targeted patches, batched writes, financial transactions, idempotency, balance documents, paid-amount maintenance, snapshot cache/cooldown, snapshot refresh on local patches.
- `src/lib/db.ts` — shared refs, `balanceRef`, write batches of 450, count aggregate helper, batched `clearAll`.
- `src/lib/types.ts` — optional `idempotencyKey` and `paidAmount` fields.
- `src/lib/firebase.ts` — persistent Firestore local cache with multi-tab manager, long-polling retained.
- `src/lib/asyncUtils.ts`, `src/lib/perf.ts`, `src/lib/selectors.ts` — hardened for tests/browser use; quota errors are no longer retried.
- `src/hooks/useActionLock.ts` — synchronous ref-based duplicate-click prevention and UI action timing.
- `src/lib/seed.ts` — one-time batched legacy cleanup; quota-aware seeding that skips count queries during cooldown.
- `src/pages/Dashboard.tsx`, `Reports.tsx`, `Ledger.tsx`.
- `src/pages/AllProducts.tsx`, `Customers.tsx`, `ProductFamilies.tsx`, `PriceManagement.tsx`.
- `src/pages/Invoice.tsx`, `InvoiceHistory.tsx`, `Payments.tsx`.
- `firestore.rules` — deletes separated from validated create/update so cleanup is no longer denied.
- `firebase.json`, `package.json`.

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
9. **Security rules.** Signed-in non-legacy users required; conservative shape validation for invoices, payments, allocations, ledger, customer balances, customers, settings, and pricing; audit history is append-only. Delete operations are now explicitly allowed for trusted users instead of being accidentally denied by `request.resource.data` validation (which is null on delete).
10. **Parallel independent reads.** Initial `refresh()` uses `Promise.all`; payment candidate invoice reads and balance reads are parallelized where safe.
11. **Quota-aware seeding and cleanup.** Legacy cleanup now runs once, uses one batched commit, and is skipped during cooldown. Seeding skips all count aggregates when a cached workspace already exists. This removed the repeated `RunAggregationQuery` and permission errors seen on every login.
12. **Persistent local cache.** Firestore uses `persistentLocalCache` with a multi-tab manager, so the last successful read set survives reloads and can back the UI during a quota event.
13. **Fresh-snapshot short circuit.** A snapshot updated by any local mutation skips the full 12-collection read for 30 seconds, removing read amplification from quick reloads and tab switches.

---

## 4. API / data-path optimizations

- One candidate-invoice query per payment save instead of repeated scans/fetches per allocation.
- No full-collection re-fetch after CRUD; targeted local patches reflect the exact documents written.
- Timeout wrapper on all mutations (15 s). Idempotent mutations retry once only on network/timeout/retryable codes.
- `resource-exhausted` / HTTP 429 is explicitly **not** retried. A 60-second cooldown is persisted locally, so a reload during quota exhaustion serves cached data instead of starting another SDK retry storm.
- Invoice create/edit no longer re-read the invoice document inside the transaction. Idempotent retries resolve from the in-memory index or Firestore's local cache, and customer/settings values come from the workspace snapshot. Only the canonical `customerBalances` document is read atomically, so concurrent financial writes still conflict safely. This removed four `BatchGetDocuments` reads per save and eliminated the reported `invoices/inv_...` 429 retry storm.
- A fetch-level quota watcher records the first Firestore 429 response immediately, so action guards block all later clicks while the SDK finishes retrying the request already in flight.
- Firestore initialization is idempotent, so Vite HMR cannot re-create the instance with different options.
- Request deduplication uses prebuilt maps rather than repeated `Array.find`.
- Last-known-good snapshot cache is written after a successful refresh and after local mutation patches, including product/invoice/payment data.
- PDF chunks are requested only when a PDF is actually created, then cached by the browser/Vite.
- Idle prefetch keeps common navigation and PDF creation fast without blocking authentication or initial data load.

---

## 5. Measured performance — before / after

### Production bundle (real `pnpm build` output)

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Main JS chunk (raw) | 1,331.5 KB | 950.84 KB | −380.66 KB (−28.6%) |
| Main JS chunk (gzip) | not captured in baseline | 285.15 KB | — |
| CSS (raw) | 81.8 KB | 90.41 KB | +8.61 KB |
| All measured startup assets (raw) | 1,784.6 KB | 1,041.80 KB | −742.80 KB (−41.6%) |
| Startup assets (gzip) | not captured in baseline | 305.14 KB | — |
| Deferred PDF chunks (raw) | loaded upfront | 813.30 KB on demand | 0 KB at startup |
| Deferred PDF chunks (gzip) | loaded upfront | 248.51 KB on demand | 0 KB at startup |

The remaining main chunk is still above Vite's 500 KB warning threshold. It contains React,
Firebase Auth/Firestore, the store, and the new snapshot/cache logic; it is not PDF code.
The CSS increase is the consolidated phone/tablet/desktop responsive layer.

### Browser quota/reload check (real dev-server session)

| Check | Result |
|---|---:|
| Firestore document-read requests on reload with a fresh snapshot | 0 |
| Console errors/warnings on that reload | 0 |
| Legacy cleanup after deploying corrected rules | succeeded, no permission error |
| Login layout at 390px iframe width | single column, showcase hidden, `scrollWidth === 390` |
| Phone shell CSS at max-width 768px | off-canvas drawer, `margin-left: 0`, visible 5-item bottom nav, no horizontal overflow |

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
- `pnpm test` — 17/17 pass.
- `pnpm deploy:rules` — pass; corrected `firestore.rules` compiled and released to `ma-paint-house` again after the delete-rule fix.
- `pnpm deploy:indexes` — pass after correcting the index file; final empty index set deployed to `(default)` database.
  - Money/paisa calculations.
  - Indexed selectors, latest balances, invoice balances, ledger rebuild.
  - 100 invoices and 100 products benchmarks.
  - Deterministic idempotency IDs and 20 rapid duplicate-click simulation.
  - Timeout behavior, already-completed operation, retry of transient failures, no retry on validation errors.
  - Network-error classification, quota non-retry, actionable quota message, and real duration/failure instrumentation.
  - Snapshot cache round-trip and stale-snapshot rejection.
- Browser smoke test on `http://localhost:8443/`:
  - Login screen renders and is responsive at 390px.
  - `window.__maphPerf` is installed.
  - Zero console errors after quota cooldown/cache fixes.
  - Reload with a fresh snapshot issued 0 Firestore document-read requests.
  - Legacy cleanup invoked directly succeeded after the rules deploy (flag set, no permission warning).
  - Phone CSS overrides verified in the cascade after the older `display: none !important` bottom-nav rule.
  - Phone invoice page now renders the product catalogue inline instead of a bottom-sheet popup; the old Add Products buttons are hidden, and a product tap scrolls to the current invoice. Verified in the live DOM and CSS cascade.
  - Verified no `tx.get(invoices/...)` remains in invoice create/edit paths; the only remaining transaction invoice reads are candidate invoices for atomic payment allocation.
  - Clean console after reload: zero errors or warnings.
  - Lighthouse (dev server): Best Practices 1.00, SEO 1.00, Accessibility 0.98 (only issue: login page has no `<main>` landmark).

---

## 7. Remaining bottlenecks / issues needing attention

1. **First-ever load still reads all business collections.** The store loads 12 collections in one parallel batch; repeat loads within 30 seconds use the updated snapshot. A brand-new device with a very large Firestore database is still limited by the largest collection. Next step: cursor/paged or per-page selective loading.
2. **Entry bundle remains 950 KB raw / 285 KB gzip.** Firebase SDK + React dominate. Splitting vendor chunks improves caching but does not reduce downloaded bytes much.
3. **Firestore project quota was exhausted during live testing.** The app now degrades to cached data, records the first 429 immediately, blocks later clicks during cooldown, and no longer re-reads invoice documents inside invoice transactions. The Firebase project still needs a quota/usage review in the console if `429 resource-exhausted` persists after the daily reset.
4. **Firestore latency/transaction conflicts not measured live.** Concurrent writes to the same customer intentionally conflict on `customerBalances` and retry; under heavy contention some operations may fail and must be retried by the user.
5. **Rules and indexes are deployed.** Both commands completed successfully against `ma-paint-house`. Re-run them if these files change.
6. **Timeout duplicate path UI patch.** If a save commits but the response times out, retries safely return the original record without duplicating data. Related derived rows may require a refresh to appear in the current view; no financial duplication occurs.
7. **Search behavior note.** `AllProducts` now also matches product brand via the shared search helper. This is additive, not a calculation change.
8. **Manual authenticated QA still recommended.** Exercise invoice save/share, payment record/reverse/delete, PDF download, import, and settings backup with production-like data and slow-network throttling.

---

## 8. Operational notes

- `window.__maphPerf.summary()` returns average/p95/max/failure counts for measured operations.
- `window.__maphPerf.clear()` resets the rolling buffer.
- `pnpm test` uses Node 25's built-in TypeScript stripping; no new test dependency was added.
- Deploy scripts: `pnpm deploy:rules`, `pnpm deploy:indexes`, `pnpm deploy:hosting`.

---

## 9. Deployment status

- GitHub: latest commit `Show phone catalogue inline and stop invoice 429 retry storm` pushed to `origin/main` (previous: `Fix phone layout, Firestore permissions, and quota retry storm`).
- Firestore rules: redeployed to `ma-paint-house` after separating delete permissions from create/update validation.
- Vercel: the latest production deployment is live and aliased to `https://ma-paint-house.vercel.app`; verified main asset `index-ymKLqpr_.js`.
- `npx vercel curl https://ma-paint-house.vercel.app` returned HTML referencing `index-ymKLqpr_.js` with `viewport-fit=cover`, confirming the new build is served.
- Deployment protection (`vercel_authentication`) remains enabled on the Vercel project.
