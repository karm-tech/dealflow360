import { PlannedPlaceholder } from "../../components/PlannedPlaceholder";

// Every screen has a route; unbuilt ones say what they will contain.

export function QuotationsPage() {
  return (
    <PlannedPlaceholder
      title="Quotations"
      area="Core loop"
      description="Active and draft quotations for your customers."
      willInclude={[
        "Quotation list with customer, amount and stage",
        "Quotation builder: pick products, adjust quantity, apply line and order discounts",
        "Live order total and margin indicator",
        "Confirm a quotation to turn it into an order",
      ]}
    />
  );
}

export function PipelinePage() {
  return (
    <PlannedPlaceholder
      title="Pipeline"
      area="Core loop"
      description="Deals grouped by stage."
      willInclude={["Kanban board by quotation status", "Open a card to edit the deal"]}
    />
  );
}

export function ApprovalsPage() {
  return (
    <PlannedPlaceholder
      title="Approvals"
      area="Governance"
      description="Quotations waiting on you."
      willInclude={[
        "Blended discount risk score for each quotation",
        "Approval chain: Sales Manager, then Finance when the overage is large",
        "Approve, reject or return for revision, with the reason recorded",
        "Full audit trail of who did what and when",
      ]}
    />
  );
}

export function FulfilmentPage() {
  return (
    <PlannedPlaceholder
      title="Fulfilment"
      area="Fulfilment"
      description="Where each order ships from."
      willInclude={[
        "Suggested warehouse split based on live stock",
        "Quantity, shipment count and cost per warehouse",
        "Accept the suggestion or override it by hand",
        "Backorders, and a prompt to consolidate when stock arrives",
      ]}
    />
  );
}

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

export function BackendPage() {
  return (
    <PlannedPlaceholder
      title="Back-end configuration"
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
