import { useEffect, useState } from "react";
import { Minus, Percent, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import {
  Button,
  FieldHelp,
  Modal,
  RecordPicker,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { RecordLink } from "../../components/RecordLink";
import { searchProducts } from "../../lib/pickers";
import { formatMoney } from "../../lib/format";
import { BILLING_TYPE, BILLING_TYPE_LABELS } from "../../lib/constants";

// Committed on blur or Enter rather than on every keystroke, so a half-typed
// number never reaches the server.
function NumberCell({ value, min = 0, max, suffix, disabled, ariaLabel, onCommit }) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed === value) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min, parsed));
    setDraft(String(clamped));
    onCommit(clamped);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
        className="figure w-16 rounded-md border border-sand-300 bg-surface px-2 py-1 text-right text-sm text-sand-900 transition-colors hover:border-sand-400 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-500/20 disabled:bg-sand-100 disabled:text-sand-500"
      />
      {suffix && <span className="text-xs text-sand-500">{suffix}</span>}
    </span>
  );
}

function QtyCell({ line, disabled, onChange }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        icon={Minus}
        aria-label={`Reduce quantity of ${line.productName}`}
        disabled={disabled || line.qty <= 1}
        onClick={() => onChange(line.qty - 1)}
        className="!px-1.5"
      />
      <NumberCell value={line.qty} min={1} disabled={disabled} onCommit={onChange} />
      <Button
        variant="ghost"
        size="sm"
        icon={Plus}
        aria-label={`Increase quantity of ${line.productName}`}
        disabled={disabled}
        onClick={() => onChange(line.qty + 1)}
        className="!px-1.5"
      />
    </span>
  );
}

export function LinesTable({ lines, plans, isEditable, isBusy, onUpdateLine, onRemoveLine }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH>
            <span className="inline-flex items-center">
              Qty
              <FieldHelp text="Committed on blur. Stockable lines later allocate this quantity from warehouses." />
            </span>
          </TH>
          <TH align="right">
            <span className="inline-flex items-center justify-end">
              Unit price
              <FieldHelp text="Captured when the line is added. A later catalogue change does not rewrite it." />
            </span>
          </TH>
          <TH align="right">
            <span className="inline-flex items-center justify-end">
              Disc %
              <FieldHelp text="Capped by the lower of the customer tier and the product category." />
            </span>
          </TH>
          <TH>
            <span className="inline-flex items-center">
              Billing
              <FieldHelp text="One-time invoices on confirm. Recurring opens a subscription for this line." />
            </span>
          </TH>
          <TH align="right">Tax</TH>
          <TH align="right">Line total</TH>
          <TH />
        </TR>
      </THead>

      <TBody>
        {lines.map((line) => (
          <TR key={line.id}>
            <TD>
              <RecordLink to={`/products/${line.productId}`}>{line.productName}</RecordLink>
              <p className="mt-0.5 text-xs text-sand-500">
                {line.variantLabel && <>{line.variantLabel} · </>}
                {line.category}
                {line.isStockable && (
                  <> · {line.onHand} on hand</>
                )}
                {line.isProrated && <> · first period prorated</>}
              </p>
              {line.description && (
                <p className="mt-0.5 text-xs text-sand-500">{line.description}</p>
              )}
              {line.isShort && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-state-warn">
                  <TriangleAlert size={12} />
                  Not available — {line.qty} asked, {line.onHand} on hand. Check the quantity.
                </p>
              )}
            </TD>

            <TD>
              <QtyCell
                line={line}
                disabled={!isEditable || isBusy}
                onChange={(qty) => onUpdateLine(line.id, { qty })}
              />
            </TD>

            {/* Price comes from the customer's price list and is captured when the
                line is added, so the only lever here is the discount. */}
            <TD figure align="right">
              {formatMoney(line.unitPrice)}
            </TD>

            <TD align="right">
              <NumberCell
                value={line.discountPct}
                min={0}
                max={100}
                suffix="%"
                disabled={!isEditable || isBusy}
                onCommit={(discountPct) => onUpdateLine(line.id, { discountPct })}
              />
            </TD>

            <TD>
              <div className="flex flex-col gap-1">
                <Select
                  value={line.billingType}
                  disabled={!isEditable || isBusy}
                  aria-label={`Billing for ${line.productName}`}
                  onChange={(event) => onUpdateLine(line.id, { billingType: event.target.value })}
                  className="!w-32 !py-1 !text-sm"
                >
                  {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>

                {line.billingType === BILLING_TYPE.RECURRING && (
                  <Select
                    value={line.planId || ""}
                    disabled={!isEditable || isBusy}
                    aria-label={`Billing period for ${line.productName}`}
                    onChange={(event) => onUpdateLine(line.id, { planId: event.target.value })}
                    className="!w-32 !py-1 !text-sm"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </Select>
                )}

                {/* How far ahead of each period its renewal quotation is
                    raised. Capped just under the period so only one renewal
                    is ever open. */}
                {line.billingType === BILLING_TYPE.RECURRING && (
                  <span className="flex items-center gap-1 text-xs text-sand-500">
                    <RefreshCw size={11} aria-hidden="true" />
                    Renew
                    <NumberCell
                      value={line.renewalLeadDays ?? 0}
                      min={1}
                      max={line.renewalLeadDaysMax ?? undefined}
                      suffix={`d ahead (max ${line.renewalLeadDaysMax ?? "—"})`}
                      disabled={!isEditable || isBusy}
                      ariaLabel={`Renewal notice in days for ${line.productName}`}
                      onCommit={(renewalLeadDays) => onUpdateLine(line.id, { renewalLeadDays })}
                    />
                  </span>
                )}
              </div>
            </TD>

            <TD figure align="right">
              {line.taxRatePct}%
            </TD>

            <TD figure align="right">
              {formatMoney(line.net)}
              {line.billingType === BILLING_TYPE.RECURRING && (
                <span className="block text-xs text-sand-500">per {line.planName?.toLowerCase()}</span>
              )}
            </TD>

            <TD align="right">
              {isEditable && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label={`Remove ${line.productName}`}
                  disabled={isBusy}
                  onClick={() => onRemoveLine(line.id)}
                />
              )}
            </TD>
          </TR>
        ))}

        {lines.length === 0 && (
          <TR>
            <TD className="py-8 text-center text-sand-600" colSpan={8}>
              No products yet. Add one to start building this quotation.
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}

// One row that adds a fully specified line: product, quantity, discount and
// billing all chosen before anything is sent.
export function AddLineControl({ tierId, plans, isBusy, onAdd }) {
  const [product, setProduct] = useState(null);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [discountPct, setDiscountPct] = useState("0");
  const [billingType, setBillingType] = useState("");
  const [planId, setPlanId] = useState("");

  // Until a product is picked its own default decides how it is billed.
  const effectiveBilling = billingType || product?.record.defaultBillingType || BILLING_TYPE.ONE_TIME;
  const isRecurring = effectiveBilling === BILLING_TYPE.RECURRING;

  function reset() {
    setProduct(null);
    setVariantId("");
    setQty("1");
    setDiscountPct("0");
    setBillingType("");
    setPlanId("");
  }

  const asked = Math.max(1, Number(qty) || 1);
  const onHand = product?.record.isStockable ? product.record.onHand : null;
  const isShort = onHand !== null && asked > onHand;

  function add() {
    if (!product) return;
    onAdd({
      productId: product.id,
      variantId: variantId ? Number(variantId) : undefined,
      qty: asked,
      discountPct: Math.min(100, Math.max(0, Number(discountPct) || 0)),
      billingType: effectiveBilling,
      planId: isRecurring ? planId || product.record.defaultPlanId || "MONTHLY" : undefined,
    });
    reset();
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-sand-300 bg-sand-50 p-3">
      <div className="min-w-[16rem] flex-1">
        <label htmlFor="add-product" className="mb-1 block text-xs font-medium text-sand-600">
          Product
        </label>
        <RecordPicker
          id="add-product"
          queryKey={`products-${tierId}`}
          fetchOptions={searchProducts(tierId)}
          value={product?.id}
          selected={product}
          onChange={(next) => {
            setProduct(next);
            setVariantId("");
          }}
          noun="products"
          placeholder="Search the catalogue…"
          disabled={isBusy}
          openTo={(id) => `/products/${id}`}
        />
      </div>

      {product?.record.variants?.length > 0 && (
        <div>
          <label htmlFor="add-variant" className="mb-1 block text-xs font-medium text-sand-600">
            Variant
          </label>
          <Select
            id="add-variant"
            value={variantId}
            disabled={isBusy}
            onChange={(event) => setVariantId(event.target.value)}
            className="!w-44"
          >
            <option value="">Choose…</option>
            {product.record.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.attribute}: {variant.value}
                {variant.extraPrice ? ` (+${formatMoney(variant.extraPrice)})` : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div>
        <label htmlFor="add-qty" className="mb-1 block text-xs font-medium text-sand-600">
          Qty
        </label>
        <input
          id="add-qty"
          type="number"
          min={1}
          value={qty}
          disabled={isBusy}
          onChange={(event) => setQty(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          className="figure w-20 rounded-lg border border-sand-300 bg-surface px-3 py-2 text-right text-base text-sand-900 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-500/20"
        />
      </div>

      <div>
        <label htmlFor="add-discount" className="mb-1 block text-xs font-medium text-sand-600">
          Disc %
        </label>
        <input
          id="add-discount"
          type="number"
          min={0}
          max={100}
          value={discountPct}
          disabled={isBusy}
          onChange={(event) => setDiscountPct(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && add()}
          className="figure w-20 rounded-lg border border-sand-300 bg-surface px-3 py-2 text-right text-base text-sand-900 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-500/20"
        />
      </div>

      <div>
        <label htmlFor="add-billing" className="mb-1 block text-xs font-medium text-sand-600">
          Billing
        </label>
        <Select
          id="add-billing"
          value={effectiveBilling}
          disabled={isBusy}
          onChange={(event) => setBillingType(event.target.value)}
          className="!w-32"
        >
          {Object.entries(BILLING_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {isRecurring && (
        <div>
          <label htmlFor="add-plan" className="mb-1 block text-xs font-medium text-sand-600">
            Period
          </label>
          <Select
            id="add-plan"
            value={planId || product?.record.defaultPlanId || "MONTHLY"}
            disabled={isBusy}
            onChange={(event) => setPlanId(event.target.value)}
            className="!w-32"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <Button
        icon={Plus}
        disabled={isBusy || !product || (product.record.variants?.length > 0 && !variantId)}
        onClick={add}
      >
        Add line
      </Button>

      {isShort && (
        <p className="basis-full mt-1 flex items-center gap-1.5 text-sm font-medium text-state-warn">
          <TriangleAlert size={14} />
          This product is not available — {asked} asked, {onHand} on hand. Check the quantity,
          then add it if you still want to proceed.
        </p>
      )}
    </div>
  );
}

// Writes one discount onto every line. It replaces what is there, so the
// current figures are named before anything changes.
export function BulkDiscountControl({ lines, isBusy, onApply }) {
  const [isOpen, setIsOpen] = useState(false);
  const [value, setValue] = useState("");

  const discountPct = Math.min(100, Math.max(0, Number(value) || 0));
  const current = lines.map((line) => `${line.discountPct}%`).join(", ");

  function apply() {
    onApply(discountPct);
    setIsOpen(false);
    setValue("");
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Percent}
        disabled={isBusy || lines.length === 0}
        onClick={() => setIsOpen(true)}
      >
        Set discount on all lines
      </Button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Set discount on all lines"
        description="Every line is set to this figure. There is one discount per line, so this replaces what is there."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={value === ""}>
              Set {discountPct}% on {lines.length} {lines.length === 1 ? "line" : "lines"}
            </Button>
          </>
        }
      >
        <label htmlFor="bulk-discount" className="mb-1 block text-sm font-medium text-sand-700">
          Discount %
        </label>
        <input
          id="bulk-discount"
          type="number"
          min={0}
          max={100}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="figure w-32 rounded-lg border border-sand-300 bg-surface px-3 py-2 text-right text-base text-sand-900 focus:border-ink-500 focus:outline-none focus:ring-2 focus:ring-ink-500/20"
        />

        <p className="mt-3 text-sm text-sand-600">
          This replaces the current discounts ({current}).
        </p>
      </Modal>
    </>
  );
}
