import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Select, Table, TBody, TD, TH, THead, TR } from "../../components/ui";
import { RecordLink } from "../../components/RecordLink";
import { formatMoney } from "../../lib/format";
import { BILLING_TYPE, BILLING_TYPE_LABELS } from "../../lib/constants";

// Committed on blur or Enter rather than on every keystroke, so a half-typed
// number never reaches the server.
function NumberCell({ value, min = 0, max, suffix, disabled, onCommit }) {
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
          <TH>Qty</TH>
          <TH align="right">Unit price</TH>
          <TH align="right">Disc %</TH>
          <TH>Billing</TH>
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
                {line.category}
                {line.effectiveDiscountPct !== line.discountPct && (
                  <> · {line.effectiveDiscountPct}% with the order discount</>
                )}
                {line.isProrated && <> · first period prorated</>}
              </p>
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

// Products are grouped by category so the ceiling that applies to each is
// obvious while picking.
export function AddLineControl({ products, isBusy, onAdd }) {
  const [productId, setProductId] = useState("");

  const grouped = products.reduce((groups, product) => {
    (groups[product.category] ||= []).push(product);
    return groups;
  }, {});

  function add() {
    if (!productId) return;
    onAdd(Number(productId));
    setProductId("");
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Select
        value={productId}
        disabled={isBusy}
        aria-label="Product to add"
        onChange={(event) => setProductId(event.target.value)}
        className="!w-auto min-w-[18rem]"
      >
        <option value="">Choose a product…</option>
        {Object.entries(grouped).map(([category, items]) => (
          <optgroup key={category} label={`${category} — up to ${items[0].categoryCeilingPct}% discount`}>
            {items.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {formatMoney(product.price)}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>

      <Button icon={Plus} disabled={isBusy || !productId} onClick={add}>
        Add line
      </Button>

      {products.some((product) => product.isPromoted) && (
        <Badge>Some products are promoted this quarter</Badge>
      )}
    </div>
  );
}
