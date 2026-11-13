# Development Status — M.A Paint House Business Management & Accounting + Centralized Product Pricing

## Stack
- Frontend: React 19 + Vite 8 + Tailwind CSS v4
- Persistence: IndexedDB (Dexie) — browser-local (Figma Make environment has no backend)
- PDF: jsPDF
- Auth: SHA-256 password hashing, localStorage session

## Modules
- Dashboard (real-time metrics, recent invoices/payments, quick actions)
- Customer Management (CRUD, profile, balance)
- Product Families (expandable, colour codes, inherited pricing)
- All Products (search/filter by family/size)
- Price Management (centralized Drum/Gallon/Quartar per family, propagation, confirmation)
- Import Products (Markdown/CSV paste + import report)
- Invoice Creation (multi-customer, customer-specific discount, click-to-add products, calculations, payment received)
- Invoice History (filter, cancel, PDF, WhatsApp)
- Payments & Receipts (record, allocate, reverse, receipt PDF)
- Customer Ledger (per customer, running balance, PDF statement)
- Reports (daily grouped totals, outstanding, export PDF)
- Expenses (CRUD, categories)
- Settings & Backup (business details, backup/restore, password)
- Authentication

## Centralized pricing
- FamilyPricing is single source of truth
- updateFamilyPricing propagates to all non-override products of that family+size
- New colour codes inherit family pricing
- Other families/sizes unaffected
- Historical invoices retain snapshot prices

## Accounting integrity
- Money stored as integer paisa
- Invoice → ledger debit; payment → ledger credit + allocations
- Customer balance from ledger entries
- Daily report groups invoices by date

## Test results
- Propagation test: Aqua Matt Gallon 5700 → 6000 updated 54 products; reverted to 5700. PASS
- Build: tsc 0 errors, vite build success. PASS
- Login + dashboard render: PASS

## Limitations
- No real PostgreSQL backend in Figma Make environment; persistence is IndexedDB.
- WhatsApp sharing opens wa.me with prepared message and downloads PDF.
- Run: pnpm install && pnpm dev (port 8443)
- Build: pnpm build