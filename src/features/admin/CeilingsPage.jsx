// Tiers and categories on one screen, because they are the same thing seen two
// ways: the two ceilings every quotation line is measured against. A line is
// judged by whichever is stricter, so reading them side by side is the only way
// to see what a rep can actually give away.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Modal,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

function TierDialog({ open, tier, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ id: "", name: "", maxDiscountPct: "", sequence: "0" });
  const [error, setError] = useState("");

  const isEdit = Boolean(tier);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      id: tier?.id || "",
      name: tier?.name || "",
      maxDiscountPct: tier ? String(tier.maxDiscountPct) : "",
      sequence: tier ? String(tier.sequence) : "0",
    });
  }, [open, tier]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        maxDiscountPct: Number(form.maxDiscountPct),
        sequence: Number(form.sequence),
      };
      return isEdit
        ? api.patch(`/config/tiers/${tier.id}`, body)
        : api.post("/config/tiers", { ...body, id: form.id.trim().toUpperCase() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-tiers"] });
      toast(isEdit ? `${form.name} updated` : `${form.name} added`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${tier.name}` : "New tier"}
      description="The most a rep may discount for a customer on this tier, before approval."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.name.trim() || form.maxDiscountPct === "" || (!isEdit && !form.id.trim())}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Save" : "Add tier"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!isEdit && (
          <Field label="Code" htmlFor="tier-id" hint="Capitals, no spaces. Cannot change later." tooltip="Primary key for the tier. Customers store this code, so it cannot be renamed later.">
            <Input
              id="tier-id"
              autoFocus
              value={form.id}
              onChange={(event) => set("id", event.target.value.toUpperCase())}
              placeholder="PLATINUM"
            />
          </Field>
        )}

        <Field label="Name" htmlFor="tier-name" tooltip="What staff see on the customer and on quotations.">
          <Input
            id="tier-name"
            autoFocus={isEdit}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            placeholder="Platinum"
          />
        </Field>

        <Field label="Discount ceiling %" htmlFor="tier-max" tooltip="The most this tier may be discounted. A category ceiling can still be stricter on a line.">
          <Input
            id="tier-max"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={form.maxDiscountPct}
            onChange={(event) => set("maxDiscountPct", event.target.value)}
          />
        </Field>

        <Field label="Order" htmlFor="tier-sequence" hint="Where it sits in the list." tooltip="Lower numbers appear first. Does not change the ceiling.">
          <Input
            id="tier-sequence"
            type="number"
            min={0}
            value={form.sequence}
            onChange={(event) => set("sequence", event.target.value)}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

function CategoryDialog({ open, category, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", discountCeilingPct: "" });
  const [error, setError] = useState("");

  const isEdit = Boolean(category);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm({
      name: category?.name || "",
      discountCeilingPct: category ? String(category.discountCeilingPct) : "",
    });
  }, [open, category]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        discountCeilingPct: Number(form.discountCeilingPct),
      };
      return isEdit
        ? api.patch(`/config/categories/${category.id}`, body)
        : api.post("/config/categories", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-categories"] });
      toast(isEdit ? `${form.name} updated` : `${form.name} added`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${category.name}` : "New category"}
      description="Thinner margin categories carry a lower ceiling than the customer's tier allows."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.name.trim() || form.discountCeilingPct === ""}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Save" : "Add category"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="category-name" tooltip="Groups products and holds a discount ceiling of its own.">
          <Input
            id="category-name"
            autoFocus
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            placeholder="Accessories"
          />
        </Field>

        <Field label="Discount ceiling %" htmlFor="category-ceiling" tooltip="Cap for products in this category. The line uses the lower of this and the customer tier.">
          <Input
            id="category-ceiling"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={form.discountCeilingPct}
            onChange={(event) => setForm((c) => ({ ...c, discountCeilingPct: event.target.value }))}
          />
        </Field>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function CeilingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tierDialog, setTierDialog] = useState(null);
  const [categoryDialog, setCategoryDialog] = useState(null);

  const tiers = useQuery({
    queryKey: ["config-tiers"],
    queryFn: async () => (await api.get("/config/tiers")).data.tiers,
  });

  const categories = useQuery({
    queryKey: ["config-categories"],
    queryFn: async () => (await api.get("/config/categories")).data.categories,
  });

  const removeTier = useMutation({
    mutationFn: (id) => api.delete(`/config/tiers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-tiers"] });
      toast("Tier deleted");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const removeCategory = useMutation({
    mutationFn: (id) => api.delete(`/config/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-categories"] });
      toast("Category deleted");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (tiers.isLoading || categories.isLoading) return <Spinner label="Loading ceilings" />;
  if (tiers.isError) return <ErrorState message={errorMessage(tiers.error)} onRetry={tiers.refetch} />;
  if (categories.isError) {
    return <ErrorState message={errorMessage(categories.error)} onRetry={categories.refetch} />;
  }

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Discount ceilings"
        subtitle="Two ceilings apply to every line, and the stricter one governs. A Gold customer still only gets the service ceiling on a service line."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card padded={false}>
          <div className="p-6">
            <CardHeader
              title="Customer tiers"
              subtitle="Set by hand. What the customer is allowed."
              actions={
                <Button size="sm" icon={Plus} onClick={() => setTierDialog({})}>
                  New tier
                </Button>
              }
            />
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Tier</TH>
                <TH align="right">Ceiling</TH>
                <TH align="right">Customers</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {tiers.data.map((tier) => (
                <TR key={tier.id}>
                  <TD>
                    <span className="font-medium text-sand-900">{tier.name}</span>
                    <span className="ml-2 font-mono text-sm text-sand-500">{tier.id}</span>
                  </TD>
                  <TD figure align="right">
                    {tier.maxDiscountPct}%
                  </TD>
                  <TD figure align="right">
                    {tier.customerCount}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setTierDialog(tier)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => removeTier.mutate(tier.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card padded={false}>
          <div className="p-6">
            <CardHeader
              title="Product categories"
              subtitle="A margin floor per kind of product."
              actions={
                <Button size="sm" icon={Plus} onClick={() => setCategoryDialog({})}>
                  New category
                </Button>
              }
            />
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH align="right">Ceiling</TH>
                <TH align="right">Products</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {categories.data.map((category) => (
                <TR key={category.id}>
                  <TD>
                    <span className="font-medium text-sand-900">{category.name}</span>
                  </TD>
                  <TD figure align="right">
                    {category.discountCeilingPct}%
                  </TD>
                  <TD figure align="right">
                    {category.productCount}
                  </TD>
                  <TD align="right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Pencil}
                        onClick={() => setCategoryDialog(category)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        onClick={() => removeCategory.mutate(category.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="What a rep can actually give" subtitle="The stricter of the two, per combination." />

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-sand-200 px-3 py-2 text-left font-medium text-sand-600">
                  Tier
                </th>
                {categories.data.map((category) => (
                  <th
                    key={category.id}
                    className="border-b border-sand-200 px-3 py-2 text-right font-medium text-sand-600"
                  >
                    {category.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.data.map((tier) => (
                <tr key={tier.id}>
                  <td className="border-b border-sand-100 px-3 py-2 font-medium text-sand-900">
                    {tier.name}
                  </td>
                  {categories.data.map((category) => {
                    const effective = Math.min(tier.maxDiscountPct, category.discountCeilingPct);
                    // Highlighted where the category is what binds, since that
                    // is the case reps are surprised by.
                    const isCategoryBinding = category.discountCeilingPct < tier.maxDiscountPct;

                    return (
                      <td
                        key={category.id}
                        className="border-b border-sand-100 px-3 py-2 text-right font-mono"
                      >
                        {isCategoryBinding ? (
                          <StatusPill tone="warn">{effective}%</StatusPill>
                        ) : (
                          <span className="text-sand-700">{effective}%</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm text-sand-600">
          Highlighted where the category ceiling is the one that binds, not the tier.
        </p>
      </Card>

      <TierDialog
        open={Boolean(tierDialog)}
        tier={tierDialog?.id ? tierDialog : null}
        onClose={() => setTierDialog(null)}
      />
      <CategoryDialog
        open={Boolean(categoryDialog)}
        category={categoryDialog?.id ? categoryDialog : null}
        onClose={() => setCategoryDialog(null)}
      />
    </div>
  );
}
