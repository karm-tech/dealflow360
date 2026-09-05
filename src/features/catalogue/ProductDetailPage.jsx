import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Warehouse } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Badge,
  Card,
  ErrorState,
  SmartButton,
  SmartButtons,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import { BILLING_TYPE_LABELS } from "../../lib/constants";

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-2xs font-semibold uppercase text-sand-500">{label}</p>
      <p className="mt-0.5 text-base text-sand-900">{children ?? "—"}</p>
    </div>
  );
}

export function ProductDetailPage() {
  const { id } = useParams();

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: async () => (await api.get(`/catalogue/products/${id}`)).data,
  });

  if (product.isLoading) return <Spinner label="Loading product" />;
  if (product.isError) {
    return <ErrorState message={errorMessage(product.error)} onRetry={product.refetch} />;
  }

  const { product: record, counts } = product.data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title={record.name}
        subtitle={`${record.sku} · ${record.category}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {record.isPromoted && <Badge>Promoted</Badge>}
            <SmartButtons>
              <SmartButton
                count={counts.quotations}
                label="In quotations"
                icon={FileText}
                to={`/quotations?productId=${record.id}`}
              />
              <SmartButton
                count={counts.warehouses}
                label="Stock"
                icon={Warehouse}
                onClick={() =>
                  document
                    .getElementById("stock-table")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              />
            </SmartButtons>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-sand-900">Commercial</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="List price">{formatMoney(record.salesPrice)}</Detail>
            <Detail label="Cost">{formatMoney(record.cost)}</Detail>
            <Detail label="Margin">{record.marginPct}%</Detail>
            <Detail label="Tax">{record.taxRatePct}%</Detail>
            <Detail label="Unit">{record.unit}</Detail>
            <Detail label="Category ceiling">{record.categoryCeilingPct}%</Detail>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-xl font-semibold text-sand-900">How it is sold</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Billing">
              {BILLING_TYPE_LABELS[record.defaultBillingType]}
              {record.defaultPlan && ` · ${record.defaultPlan}`}
            </Detail>
            <Detail label="Needs a warehouse">{record.isStockable ? "Yes" : "No"}</Detail>
            <Detail label="Comes back">{record.isReturnable ? "Yes, on return" : "No"}</Detail>
            <Detail label="Warranty">
              {record.warrantyMonths ? `${record.warrantyMonths} months` : "None included"}
            </Detail>
          </div>
        </Card>

        {record.priceLists.length > 0 && (
          <Card padded={false}>
            <h2 className="border-b border-sand-200 px-6 py-4 text-xl font-semibold text-sand-900">
              Price lists
            </h2>
            <Table>
              <THead>
                <TR>
                  <TH>List</TH>
                  <TH>Tier</TH>
                  <TH align="right">Price</TH>
                </TR>
              </THead>
              <TBody>
                {record.priceLists.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.name}</TD>
                    <TD>{row.tier}</TD>
                    <TD figure align="right">
                      {formatMoney(row.price)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}

        {record.stock.length > 0 && (
          <div id="stock-table" className="scroll-mt-24">
          <Card padded={false}>
            <h2 className="border-b border-sand-200 px-6 py-4 text-xl font-semibold text-sand-900">
              Stock
            </h2>
            <Table>
              <THead>
                <TR>
                  <TH>Warehouse</TH>
                  <TH align="right">On hand</TH>
                </TR>
              </THead>
              <TBody>
                {record.stock.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.warehouse}</TD>
                    <TD figure align="right">
                      {row.qty}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
}
