# DealFlow360

Self-governing B2B sales operations platform — quotation to cash with automated discount approval routing, multi-warehouse fulfilment, hybrid billing and customer portal negotiation. Odoo Hackathon 2026.

Most sales tools stop at "create a quote, confirm an order, invoice it". DealFlow360 enforces
pricing discipline, reacts to real stock, keeps one-time and recurring lines reconciled on a single
order, and gives the customer a living document to negotiate instead of a static PDF.

---

## Run it

Requires Node 18 or newer. Nothing else — the database is a single SQLite file, so there is no
database server to install and the app runs with no internet connection.

```bash
git clone https://github.com/karm-tech/dealflow360.git
cd dealflow360
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run setup                 # creates both databases and loads their data
npm run dev                   # API on :4000, app on :5173
```

Open **http://localhost:5173**.

## Two databases: demo and live

The login screen asks which instance you want before you sign in.

| | **Demo** (`demo.db`) | **Live** (`dev.db`) |
|---|---|---|
| Holds | Sample customers, quotations, history | Master data only — an empty order book |
| For | Exploring and demonstrating | Real work |
| Accounts | The full list below | One admin; everyone else requests access |

They are two separate SQLite files opened by two separate connections. **Which one a session uses is
carried inside the signed login token**, not in a header or a setting, so a demo session cannot
reach live records by sending a different request — it would have to log in again. Every screen in
demo mode carries an amber banner so there is never any doubt which data you are changing.

`npm run setup` is `prisma generate` + `npm run migrate:all` (migrates both files) + both seeds.
To reload just the demo data, run `npm run seed` again — it clears and rewrites everything.

## Signing up is a request, not an account

The problem statement allows internal signup, but this system governs discount approvals, so
letting anyone create their own sales account would be a hole. Signing up creates a **pending
request with no role and no login token**. An admin opens **Access Requests**, picks the role, and
approves or declines with a reason. The role the admin chooses is what the person gets — what they
asked for on the form is recorded but grants nothing.

Both decisions are written to the audit trail and queued to the email outbox.

## Demo accounts

Every account uses the password **`demo1234`**. Choose **Open the demo** on the login screen; it
lists the internal accounts and fills the form when you click one.

| Role | Email | Sees |
|---|---|---|
| Admin | `admin@dealflow360.test` | Everything, including back-end configuration |
| Sales Rep | `rep@dealflow360.test` | Quotations, pipeline, fulfilment |
| Sales Rep | `rep2@dealflow360.test` | A second rep, so the pipeline is not all one person |
| Sales Manager | `manager@dealflow360.test` | Approvals and the deal health dashboard |
| Finance | `finance@dealflow360.test` | Second-level approvals, billing |
| Customer | `acme@portal.test` | The customer portal only — their own quotations |

Other portal logins: `beta@portal.test`, `cyrus@portal.test`, `delta@portal.test`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the API and the web app together |
| `npm run dev:api` | API only, on port 4000 |
| `npm run dev:web` | Web app only, on port 5173 |
| `npm run setup` | Generate client, migrate both databases, seed both |
| `npm run migrate:all` | Apply migrations to the demo and live databases |
| `npm run seed` | Reload the demo database (sample data) |
| `npm run seed:live` | Reset the live database to master data and one admin |
| `npm run build` | Production build of the frontend |

## How it is put together

```
src/                     Frontend (React + Vite + Tailwind)
  app/                   Auth state and route guards
  components/            Layout, shared UI, loading and empty states
  features/              One folder per module
  lib/                   API client, formatting, shared constants
server/                  Backend (Express + Prisma + SQLite)
  src/routes/            One file per resource (see routes/README.md)
  src/middleware/        Login and role guards
  src/lib/               Database client, tokens, constants
  prisma/                schema.prisma and seed.js
```

**Every business rule is enforced on the server.** The browser shows and asks; the server decides
and validates. Hiding a button is a convenience, never the control.

### Three ideas worth knowing before reading the code

**A quotation and an order are the same record.** There is no separate order table. A quotation
moves through `DRAFT → PENDING_APPROVAL → APPROVED → SENT → UNDER_NEGOTIATION → CONFIRMED`, and
becoming an order simply means reaching `CONFIRMED`. Nothing is copied, so the deal keeps its whole
history — which is what makes the negotiation loop work: a counter-offer just moves the record
backwards through its own statuses.

**Billing and fulfilment are decided by two different fields.** `QuotationLine.billingType` says
whether a line is charged once or every period. `Product.isStockable` says whether it needs a
warehouse. They are independent: a rented printer is recurring *and* stockable, a support plan is
neither. A single order can therefore mix one-time products and subscriptions, and only the
stockable lines ever reach a warehouse.

**Routes never import a database client.** They use `req.db`, which the auth middleware sets from
the `db` claim in the login token. That is the one rule every later phase follows, and it is what
keeps demo and live apart. See `server/src/routes/README.md`.

## Build status

| Phase | Area | State |
|---|---|---|
| 1 | Foundation — schema, seed, auth, RBAC, app shell | **Done** |
| 1.5 | Access requests, separate demo and live databases | **Done** |
| 2 | Quotation builder and the core loop | Next |
| 3 | Blended risk score and approval routing | Planned |
| 4 | Warehouse split and backorders | Planned |
| 5 | Hybrid billing, subscriptions, proration | Planned |
| 6 | Customer portal negotiation | Planned |
| 7 | Back-end configuration screens | Planned |
| 8 | Deal health dashboard and reports | Planned |

Screens for phases 2–8 already have routes and role guards; each one names the phase that fills it.
