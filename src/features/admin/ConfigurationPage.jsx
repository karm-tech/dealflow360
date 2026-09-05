import { Link } from "react-router-dom";

// Admin screens live behind Configuration rather than in the main navigation,
// which keeps the workspace tabs to the six a rep actually works in. Grouped by
// what a setting does, not by which table it lives in.
const CONFIG_GROUPS = [
  {
    title: "What the rules read",
    hint: "Change a number here and the next quotation is judged by it.",
    links: [
      {
        to: "/ceilings",
        label: "Discount ceilings",
        hint: "Per customer tier and per product category",
      },
      {
        to: "/approval-rules",
        label: "Approval bands",
        hint: "Which overage needs a manager, and which needs finance too",
      },
      {
        to: "/deal-health-settings",
        label: "Deal health thresholds",
        hint: "When a deal counts as stalled, and what each problem costs it",
      },
      { to: "/price-lists", label: "Price lists", hint: "What a product costs each tier" },
    ],
  },
  {
    title: "Records",
    hint: "The master data every quotation is built from.",
    links: [
      { to: "/products", label: "Products", hint: "The catalogue every quotation line is priced from" },
      { to: "/customers", label: "Customers", hint: "Who we sell to, and the tier they sit on" },
      { to: "/warehouses", label: "Warehouses and stock", hint: "Where stock sits, and receiving more of it" },
    ],
  },
  {
    title: "This installation",
    hint: "Who we are, and how we reach a customer.",
    links: [
      { to: "/company", label: "Company details", hint: "Name, address and logo, printed on every document" },
      { to: "/mail-settings", label: "Outgoing mail", hint: "The server customer email is sent through" },
      { to: "/portal-settings", label: "Portal settings", hint: "Who picks up requests raised from the customer portal" },
      { to: "/access-requests", label: "Access requests", hint: "Approve who can sign in, and set their role" },
      { to: "/outbox", label: "Email outbox", hint: "Every message the system has sent or queued" },
    ],
  },
];

export function ConfigurationPage() {
  return (
    <div className="animate-fadeUp">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-sand-900">Configuration</h1>
        <p className="mt-1 text-base text-sand-600">
          Everything the rules read from, editable here rather than in the code.
        </p>
      </div>

      <div className="space-y-8">
        {CONFIG_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-lg font-semibold text-sand-900">{group.title}</h2>
            <p className="mt-0.5 mb-3 text-sm text-sand-600">{group.hint}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {group.links.map((link) => (
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
          </section>
        ))}
      </div>
    </div>
  );
}
