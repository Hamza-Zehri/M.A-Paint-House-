# M.A Paint House — Account Manager

A complete, production-ready business and customer accounting system for
**M.A Paint House, Kalat, Balochistan**. Built with React, TypeScript, Vite,
Tailwind CSS, Firebase Authentication and Cloud Firestore.

> **Credit:** Designed & developed by **Engr. Hamza Asad**.

---

## Highlights

- **Paint-shop login experience** — colourful, modern, fully responsive, with an
  animated splash screen and professional credit treatment.
- **Secure authentication** — Firebase Authentication only. The legacy
  `admin/admin123` bootstrap account is disabled in the app *and* in Firestore
  security rules.
- **Full CRUD** across customers, product families, products, invoices,
  payments, expenses and business settings.
- **Professional HTML documents** — invoices, payment receipts, customer
  statements and business reports are generated as modern, colourful,
  print-ready HTML pages with one-click **Print / Save as PDF** and
  **Download HTML** actions.
- **Live Firestore data** — every change is persisted to Cloud Firestore and
  reflected across dashboards, ledgers and reports.
- **Original shop data preserved** — the M.A Paint House settings, opening
  balance and product catalogue are seeded only when the database is empty.

---

## Features

### Customers & accounts
- Create, view, edit and delete customers
- Opening balances, custom discount rates, active/inactive status
- Live outstanding balance, total invoiced, total paid and ledger history
- Delete protection: customers with invoices or payments cannot be deleted

### Products & pricing
- Product families with Drum / Gallon / Quartar pricing
- Create, edit, delete and activate/deactivate individual products
- Per-product price overrides
- Bulk product import from Markdown tables or CSV
- Family-level price changes automatically propagate to non-overridden products

### Invoicing
- Family-first product catalogue: choose a family, then pick products
- Live line items, quantity stepper, editable rate and discount override
- Save, print, edit, cancel and delete invoices
- Editing a finalised invoice automatically appends a balancing ledger entry
- Branded HTML invoice with amount in words, payment status and watermark for
  draft/cancelled documents

### Payments & ledger
- Record full or partial payments with automatic invoice allocation
- Print professional payment receipts
- Edit payment date/method/reference/notes
- Reverse payments with a compensating ledger entry
- Customer statement with opening balance, debits, credits and closing balance

### Expenses & reports
- Expense tracking by category and payment method
- Create, edit and delete expenses
- Daily sales report with gross, discount, net and payments
- Customer outstanding report
- Export any report as a colourful, landscape HTML/PDF document

### Security
- No self-registration or automatic account creation
- The old `admin@mapainthouse.app` account is blocked client-side and in
  Firestore rules
- Password changes require at least 8 characters with upper case, lower case
  and a number
- Firestore collections require an authenticated, non-legacy account
- Authenticated-only access with a default-deny catch-all rule

---

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 + custom design system |
| Auth | Firebase Authentication (email/password) |
| Data | Cloud Firestore |
| Documents | Self-contained HTML + browser print-to-PDF |

---

## Getting started

```bash
pnpm install
pnpm dev
```

The development server runs on `http://localhost:8443`.

### Production build

```bash
pnpm typecheck
pnpm build
pnpm preview
```

---

## Firebase

This app is connected to the Firebase project **`ma-paint-house`**.

### Authentication

1. Open **Firebase Console → Authentication → Sign-in method** and enable
   **Email/Password**.
2. Open **Authentication → Users** and create an account for each trusted user.
3. Sign in with the **full email address** (for example
   `ceo@admin.com`) and its password.

> The legacy `admin@mapainthouse.app` account is intentionally blocked. Delete
> or disable it permanently in **Authentication → Users** once you have
> confirmed access with your own account.

### Firestore

Deploy the security rules and indexes:

```bash
pnpm deploy:rules
```

The app stores data in these collections:

`settings`, `customers`, `families`, `pricing`, `products`, `invoices`,
`payments`, `allocations`, `ledger`, `expenses`, `audit`, `users`.

---

## Deployment

Build and deploy the full production release (Firestore rules + Hosting):

```bash
pnpm deploy
```

Deploy only the web app:

```bash
pnpm deploy:hosting
```

Firebase Hosting serves the `dist/` folder with SPA rewrites, long-lived asset
caching and security headers.

Production URL: **https://ma-paint-house.web.app**

---

## Project structure

```
src/
  App.tsx                 App shell, login screen, splash screen
  index.css               Design system, login theme, splash animations
  components/Icon.tsx     Inline SVG icon set
  lib/
    auth.ts               Firebase Auth, password policy, legacy-account block
    firebase.ts           Firebase app / Auth / Firestore initialisation
    db.ts                 Firestore table wrapper
    pdf.ts                Professional HTML invoice/receipt/statement/report engine
    seed.ts               Original M.A Paint House seed data
    money.ts              Integer-paisa money helpers
    whatsapp.ts           WhatsApp sharing helpers
  pages/                  Dashboard, customers, products, invoices, payments,
                          ledger, expenses, reports, import, settings
  store/AppContext.tsx    Application state and CRUD operations
firestore.rules           Hardened production Firestore rules
firebase.json             Firestore + Hosting configuration
```

---

## Original data

The original M.A Paint House data is preserved:

- Business name, address and contact details
- Paint families and their Drum / Gallon / Quartar price lists
- Colour-code products and accessories

Seeding runs only when the relevant collections are empty, so existing
production data is never overwritten.

---

## Credit

**Designed & developed by Engr. Hamza Asad.**

© M.A Paint House, Kalat, Balochistan.
