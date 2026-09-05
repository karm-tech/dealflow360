import { Link } from "react-router-dom";
import { PlannedPlaceholder } from "../../components/PlannedPlaceholder";

// Every screen has a route; unbuilt ones say what they will contain.

export function BillingPage() {
  return (
    <PlannedPlaceholder
      title="Billing"
      area="Hybrid billing"
      description="One-time and recurring lines on the same order."
      willInclude={[
        "One-time lines invoiced on confirmation",
        "Recurring lines with their upcoming billing schedule",
        "Proration when a subscription starts or changes mid cycle",
        "Payments, and a credit note when a subscription is cancelled early",
      ]}
    />
  );
}

export function DashboardPage() {
  return (
    <PlannedPlaceholder
      title="Deal Health"
      area="Dashboard and reports"
      description="Deals that need attention."
      willInclude={[
        "Stalled deals, discount anomalies and delivery slippage",
        "A health score with the reason for every point lost",
        "Nudge or escalate straight from an alert",
        "Reports filtered by period, rep, approval status and product",
      ]}
    />
  );
}

// Admin screens live behind Configuration rather than in the main navigation,
// which keeps the workspace tabs to the six a rep actually works in.
const CONFIG_LINKS = [
  { to: "/access-requests", label: "Access requests", hint: "Approve who can sign in, and set their role" },
  { to: "/outbox", label: "Email outbox", hint: "Every message the system has queued" },
];

export function BackendPage() {
  return (
    <div className="animate-fadeUp">
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {CONFIG_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-xl border border-sand-200 bg-surface p-4 shadow-card transition-colors hover:border-ink-200"
          >
            <p className="text-base font-medium text-ink-700">{link.label}</p>
            <p className="mt-0.5 text-sm text-sand-600">{link.hint}</p>
          </Link>
        ))}
      </div>

      <PlannedPlaceholder
        title="Configuration"
        area="Admin config"
        description="Everything the rules read from, editable here."
        willInclude={[
          "Products, variants and price lists",
          "Discount ceilings per customer tier and per category",
          "Approval chain rules",
          "Warehouses, stock levels and shipping weights",
          "Recurring plans and proration rules",
          "Settings: stall threshold, anomaly threshold, health weights",
        ]}
      />
    </div>
  );
}

export function PortalPage() {
  return (
    <PlannedPlaceholder
      title="Your quotations"
      area="Customer portal"
      description="Review, comment on and confirm the quotations sent to you."
      willInclude={[
        "Quotation details and current status",
        "Line level comments and change requests",
        "Counter a discount, which sends the quote back through approval on its own",
        "Confirm the final terms in one click",
      ]}
    />
  );
}
