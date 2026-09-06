import { Link } from "react-router-dom";
import {
  Activity,
  BarChart3,
  Bell,
  FileText,
  GitBranch,
  MessagesSquare,
  Package,
  Receipt,
  ShieldCheck,
  Tags,
  UserCheck,
  Warehouse,
} from "lucide-react";
import { MarkGround } from "../../components/MarkGround";
import { Wordmark } from "../../components/Wordmark";
import { StatusPill } from "../../components/ui";
import { formatMoney } from "../../lib/format";
import dashboardShot from "../../../docs/screenshots/02-dashboard.png";
import quotationShot from "../../../docs/screenshots/04-quotation.png";
import portalShot from "../../../docs/screenshots/06-portal.png";

const STAGES = [
  { label: "Draft", state: "past" },
  { label: "Approval", state: "past" },
  { label: "Sent", state: "here" },
  { label: "Negotiate", state: "next" },
  { label: "Confirmed", state: "next" },
  { label: "Paid", state: "next" },
];

const SAMPLE_LINES = [
  { name: "Core access switch", qty: 12, amount: 18400 },
  { name: "Support plan · yearly", qty: 1, amount: 4200 },
];

const STEPS = [
  {
    title: "Build the quotation",
    text: "Lines, variants and captured unit prices sit on one record. A discount is written on the line that will be charged.",
  },
  {
    title: "Confirm scores it",
    text: "Crossing a ceiling opens the next approver by itself. In-ceiling quotes go through without a review.",
  },
  {
    title: "The customer replies",
    text: "Accept, turn down, or request a change. An ask is stored on the message — it is not applied until the rep sends a revision.",
  },
  {
    title: "Confirming hands off",
    text: "Stock is allocated, the invoice is raised, and any subscription starts from that one action.",
  },
];

const FEATURES = [
  { icon: FileText, title: "Quotation builder", text: "Lines, variants, captured prices and a running total on the same screen." },
  { icon: ShieldCheck, title: "Discount ceilings", text: "A cap per tier and per category. The server reads them on every confirm." },
  { icon: UserCheck, title: "Approval routing", text: "A blended risk score opens manager, then finance, only when the band says so." },
  { icon: MessagesSquare, title: "Portal negotiation", text: "The customer talks on this quotation. There is no second inbox." },
  { icon: GitBranch, title: "One record to order", text: "Confirming does not copy the quote. The same number becomes the order." },
  { icon: Warehouse, title: "Multi-warehouse stock", text: "Stockable lines split across warehouses or wait on a backorder." },
  { icon: Receipt, title: "Hybrid billing", text: "One-time invoices and subscriptions from the same confirmed order." },
  { icon: Activity, title: "Deal health", text: "Stall, overage, delivery slip and approval wait, scored on the live book." },
  { icon: BarChart3, title: "Reports", text: "The same filters as Deal Health, written out as PDF or Excel." },
  { icon: Package, title: "Customer catalogue", text: "Tier-priced products. A buyer adds lines and asks for a quotation." },
  { icon: Bell, title: "Live updates", text: "Approvals, messages and status changes arrive without a refresh." },
  { icon: Tags, title: "Price lists and tiers", text: "The list on the customer is what the line is allowed to charge." },
];

const LOOKS = [
  { src: quotationShot, title: "The builder", text: "Customer, dates, lines and the risk preview on one quotation." },
  { src: portalShot, title: "The portal", text: "The customer sees the sent quote, not the workspace." },
  { src: dashboardShot, title: "Deal health", text: "The live book, scored from stall, overage and wait." },
];

function Section({ id, className = "", children }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 ${className}`}>
      {children}
    </section>
  );
}

function DoorLink({ to, variant = "primary", className = "", children }) {
  const look =
    variant === "primary"
      ? "border-transparent bg-ink-700 text-white hover:bg-ink-800"
      : "border-sand-300 bg-surface text-sand-800 hover:border-sand-400 hover:bg-sand-50";

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-base font-medium transition-colors ${look} ${className}`}
    >
      {children}
    </Link>
  );
}

function DealTrack() {
  return (
    <ol className="flex min-w-max items-center gap-0">
      {STAGES.map((stage, index) => {
        const here = stage.state === "here";
        const past = stage.state === "past";

        return (
          <li key={stage.label} className="flex items-center">
            {index > 0 && (
              <span
                className={`mx-1 h-px w-8 sm:w-10 ${past || here ? "bg-ink-400" : "bg-sand-300"}`}
                aria-hidden="true"
              />
            )}
            <span className="flex flex-col items-center gap-1.5">
              <span
                className={`h-2.5 w-2.5 rounded-full border ${
                  here
                    ? "border-ink-700 bg-ink-700"
                    : past
                      ? "border-ink-400 bg-ink-400"
                      : "border-sand-300 bg-surface"
                }`}
                aria-hidden="true"
              />
              <span className={`text-xs ${here ? "font-medium text-ink-700" : "text-sand-600"}`}>
                {stage.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function QuoteSheet() {
  const goods = SAMPLE_LINES[0].amount;
  const plan = SAMPLE_LINES[1].amount;
  const asked = 12;
  const afterAsk = Math.round((goods + plan) * (1 - asked / 100));

  return (
    <div className="rounded-xl border border-sand-200 bg-surface p-6 shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="figure text-sm text-sand-600">DF-Q-2084</p>
          <p className="mt-0.5 text-lg font-medium text-sand-900">Beta Industries</p>
        </div>
        <StatusPill tone="info">Sent</StatusPill>
      </div>

      <ul className="mt-5 space-y-2 border-t border-sand-200 pt-4">
        {SAMPLE_LINES.map((line) => (
          <li key={line.name} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-sand-800">
              {line.name}
              <span className="ml-2 text-sand-500">× {line.qty}</span>
            </span>
            <span className="figure text-sand-900">{formatMoney(line.amount)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-dashed border-sand-300 pt-4">
        <span className="text-sm text-sand-600">Customer asked</span>
        <span className="figure text-sm font-medium text-ink-700">{asked}%</span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-sand-900">If that were applied</span>
        <span className="figure text-lg font-medium text-sand-900">{formatMoney(afterAsk)}</span>
      </div>

      <p className="mt-4 text-sm text-sand-600">
        The percentage sits on the message. Sending the revision re-scores the
        same quotation.
      </p>
    </div>
  );
}

function CeilingNote() {
  return (
    <div className="rounded-xl border border-sand-200 bg-surface p-6 shadow-card">
      <p className="figure text-sm text-sand-600">DF-Q-1002 · Silver</p>
      <p className="mt-1 text-lg font-medium text-sand-900">Hardware line at 18%</p>
      <dl className="mt-5 space-y-2 border-t border-sand-200 pt-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-sand-600">Silver ceiling</dt>
          <dd className="figure text-sand-900">10%</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sand-600">Hardware ceiling</dt>
          <dd className="figure text-sand-900">15%</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sand-600">Overage</dt>
          <dd className="figure font-medium text-ink-700">8 points</dd>
        </div>
      </dl>
      <p className="mt-4 border-t border-dashed border-sand-300 pt-4 text-sm text-sand-700">
        Band 2 opens the manager, then finance. Nobody routes that by hand.
      </p>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-sand-200 bg-canvas/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="rounded-lg">
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-sand-600 md:flex">
            <a href="#loop" className="hover:text-sand-900">The loop</a>
            <a href="#how" className="hover:text-sand-900">How it works</a>
            <a href="#features" className="hover:text-sand-900">Features</a>
          </div>
          <div className="flex items-center gap-2">
            <DoorLink to="/demo" variant="secondary" className="hidden sm:inline-flex">
              Explore the demo
            </DoorLink>
            <DoorLink to="/login">Sign in</DoorLink>
          </div>
        </nav>
      </header>

      <MarkGround>
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 lg:grid-cols-2 lg:pb-24 lg:pt-16">
          <div>
            <h1 className="text-4xl font-semibold text-sand-900">
              One quotation from the first line to the last payment.
            </h1>
            <p className="mt-4 max-w-md text-lg text-sand-600">
              A discount over a ceiling opens approval. A customer ask comes back
              on the same record. Confirming allocates stock and raises the bill.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <DoorLink to="/login">Sign in</DoorLink>
              <DoorLink to="/demo" variant="secondary">
                Explore the demo
              </DoorLink>
            </div>
            <div className="mt-10 overflow-x-auto pb-1">
              <DealTrack />
            </div>
          </div>
          <QuoteSheet />
        </div>
      </MarkGround>

      <div className="border-y border-sand-200 bg-sand-50">
        <Section id="loop" className="py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-2xs font-semibold uppercase text-ink-700">The loop</p>
              <h2 className="mt-3 text-3xl font-semibold text-sand-900">
                Most tools copy a quote into an order. This one never does.
              </h2>
              <p className="mt-4 text-lg text-sand-600">
                The number you send is the number that gets confirmed, fulfilled
                and billed. A customer ask does not rewrite the lines. Sending
                the revision runs the same score again.
              </p>
              <ul className="mt-6 space-y-3 text-base text-sand-700">
                <li>
                  <span className="font-medium text-sand-900">One quotation.</span>
                  {" "}Draft through paid stays on the same record.
                </li>
                <li>
                  <span className="font-medium text-sand-900">An ask is a request.</span>
                  {" "}It lives on the message until a rep applies it.
                </li>
                <li>
                  <span className="font-medium text-sand-900">The server decides.</span>
                  {" "}Hiding a button is a convenience, never the control.
                </li>
              </ul>
            </div>
            <CeilingNote />
          </div>
        </Section>
      </div>

      <Section id="how" className="py-20">
        <p className="text-2xs font-semibold uppercase text-ink-700">How it works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold text-sand-900">
          From the first line to a settled invoice
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.title} className="rounded-xl border border-sand-200 bg-surface p-5 shadow-card">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-sm font-medium text-ink-700">
                {index + 1}
              </span>
              <p className="mt-3 font-medium text-sand-900">{step.title}</p>
              <p className="mt-1.5 text-sm text-sand-600">{step.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="border-y border-sand-200 bg-sand-50">
        <Section id="features" className="py-20">
          <p className="text-2xs font-semibold uppercase text-ink-700">Features</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold text-sand-900">
            Everything the order book needs
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-sand-200 bg-surface p-5 shadow-card">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-ink-50 text-ink-700">
                  <feature.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-3 font-medium text-sand-900">{feature.title}</p>
                <p className="mt-1.5 text-sm text-sand-600">{feature.text}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section id="look" className="py-20">
        <p className="text-2xs font-semibold uppercase text-ink-700">A closer look</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold text-sand-900">
          The workspace and the portal
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {LOOKS.map((shot) => (
            <figure key={shot.title} className="overflow-hidden rounded-xl border border-sand-200 bg-surface shadow-card">
              <img src={shot.src} alt={shot.title} className="w-full border-b border-sand-200" />
              <figcaption className="p-5">
                <p className="font-medium text-sand-900">{shot.title}</p>
                <p className="mt-1 text-sm text-sand-600">{shot.text}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section className="pb-20">
        <div className="rounded-xl border border-sand-200 bg-sand-50 px-8 py-14 text-center">
          <h2 className="text-3xl font-semibold text-sand-900">Open a role and walk the loop</h2>
          <p className="mx-auto mt-4 max-w-xl text-sand-600">
            The demo is a full order book. Sign in as the rep, the manager, finance
            or the customer — the password is the same on every account.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <DoorLink to="/demo">Explore the demo</DoorLink>
            <DoorLink to="/login" variant="secondary">Sign in</DoorLink>
          </div>
        </div>
      </Section>

      <footer className="border-t border-sand-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-sand-500 sm:flex-row">
          <Wordmark />
          <p>Quotation to cash on one record.</p>
          <Link to="/login" className="font-medium text-sand-600 hover:text-sand-900">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
