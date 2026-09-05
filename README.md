# DealFlow360

Self-governing B2B sales operations platform — quotation to cash with automated discount approval routing, multi-warehouse fulfilment, hybrid billing and customer portal negotiation.

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

Each instance has its own sign-in page: `/login` for live, `/demo` for the sample data.

| | **Demo** (`demo.db`) | **Live** (`dev.db`) |
|---|---|---|
| Holds | Sample customers, quotations, history | Master data only — an empty order book |
| For | Exploring and demonstrating | Real work |
| Accounts | The full list below | One admin; everyone else requests access |

They are two separate SQLite files opened by two separate connections. **Which one a session uses is
carried inside the signed login token**, not in a header or a setting, so a demo session cannot
reach live records by sending a different request — it would have to log in again. In demo mode a
thin rail sits above the header and the header carries a "Demo data" chip, so it is always clear
which database you are changing.

`npm run setup` is `prisma generate` + `npm run migrate:all` (migrates both files) + both seeds.
To reload just the demo data, run `npm run seed` again — it clears and rewrites everything.

## Signing up is a request, not an account

Internal signup is supported, but this system governs discount approvals, so letting anyone create
their own sales account would be a hole. Signing up creates a **pending
request with no role and no login token**. An admin opens **Access Requests**, picks the role, and
approves or declines with a reason. The role the admin chooses is what the person gets — what they
asked for on the form is recorded but grants nothing.

Both decisions are written to the audit trail and queued to the email outbox.

## Demo accounts

Every account uses the password **`demo1234`**. Open **/demo** and click any role to sign straight
in, or type the credentials by hand on the same page.

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
the `db` claim in the login token. That is the one rule, and it is what
keeps demo and live apart — every route follows it. See `server/src/routes/README.md`.

## What is implemented

| Area | State |
|---|---|
| Data model, seed data, SQLite setup | **Done** |
| Authentication, JWT, role-based access | **Done** |
| Access requests with admin approval | **Done** |
| Separate demo and live databases | **Done** |
| App shell, navigation, route guards, customer portal shell | **Done** |
| Design system and shared UI components | **Done** |
| Quotation builder and the quote-to-order loop | Next |
| Blended discount risk score and approval routing | Planned |
| Warehouse split and backorders | Planned |
| Hybrid billing, subscriptions, proration | Planned |
| Customer portal negotiation | Planned |
| Back-end configuration screens | Planned |
| Deal health dashboard and reports | Planned |

Screens that are not built yet already have their routes and role guards in place, and each one
states what it will contain rather than pretending to work.
