// The bands that decide who has to approve a discount.
//
// Bands are read in order and the first match wins, so a gap between two of
// them means a quotation lands in no band and skips approval altogether. The
// server reports gaps and overlaps rather than silently allowing them, and they
// are shown here as warnings because they are a policy mistake, not a crash.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
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
import { ROLE_LABELS } from "../../lib/constants";

const BLANK = {
  name: "",
  minOveragePoints: "",
  maxOveragePoints: "",
  approvers: "manager",
  sequence: "0",
  isActive: "true",
};

// Who signs off. Kept as one choice rather than two checkboxes, since the three
// combinations that matter are an ordered escalation.
const APPROVERS = {
  manager: { label: "Sales manager", requiresManager: true, requiresFinance: false },
  finance: { label: "Finance", requiresManager: false, requiresFinance: true },
  both: { label: "Sales manager, then finance", requiresManager: true, requiresFinance: true },
};

function approversKey(band) {
  if (band.requiresManager && band.requiresFinance) return "both";
  if (band.requiresFinance) return "finance";
  return "manager";
}

function BandDialog({ open, band, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const isEdit = Boolean(band);

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      band
        ? {
            name: band.name,
            minOveragePoints: String(band.minOveragePoints),
            maxOveragePoints: band.maxOveragePoints === null ? "" : String(band.maxOveragePoints),
            approvers: approversKey(band),
            sequence: String(band.sequence),
            isActive: band.isActive ? "true" : "false",
          }
        : BLANK,
    );
  }, [open, band]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        minOveragePoints: Number(form.minOveragePoints),
        // Empty means no upper limit, which is how the top band catches
        // everything above it.
        maxOveragePoints: form.maxOveragePoints === "" ? null : Number(form.maxOveragePoints),
        ...APPROVERS[form.approvers],
        sequence: Number(form.sequence),
        isActive: form.isActive === "true",
      };

      return isEdit
        ? api.patch(`/config/approval-rules/${band.id}`, body)
        : api.post("/config/approval-rules", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
      toast(isEdit ? `${form.name} updated` : `${form.name} added`);
      onClose();
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${band.name}` : "New approval band"}
      description="A quotation's overage is how many discount points it sits past its ceilings, added up across every line."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={save.isPending}
            disabled={!form.name.trim() || form.minOveragePoints === ""}
            onClick={() => save.mutate()}
          >
            {isEdit ? "Save" : "Add band"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Name" htmlFor="band-name">
            <Input
              id="band-name"
              autoFocus
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Over ceiling, needs finance"
            />
          </Field>
        </div>

        <Field label="From (points)" htmlFor="band-min" hint="Inclusive.">
          <Input
            id="band-min"
            type="number"
            min={0}
            step="0.5"
            value={form.minOveragePoints}
            onChange={(event) => set("minOveragePoints", event.target.value)}
          />
        </Field>

        <Field label="Up to (points)" htmlFor="band-max" hint="Exclusive. Leave empty for no limit.">
          <Input
            id="band-max"
            type="number"
            min={0}
            step="0.5"
            value={form.maxOveragePoints}
            onChange={(event) => set("maxOveragePoints", event.target.value)}
            placeholder="No limit"
          />
        </Field>

        <Field label="Approved by" htmlFor="band-approvers">
          <Select
            id="band-approvers"
            value={form.approvers}
            onChange={(event) => set("approvers", event.target.value)}
          >
            {Object.entries(APPROVERS).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status" htmlFor="band-active">
          <Select
            id="band-active"
            value={form.isActive}
            onChange={(event) => set("isActive", event.target.value)}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
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

export function ApprovalRulesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);

  const rules = useQuery({
    queryKey: ["approval-rules"],
    queryFn: async () => (await api.get("/config/approval-rules")).data,
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/config/approval-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval-rules"] });
      toast("Band deleted");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (rules.isLoading) return <Spinner label="Loading approval bands" />;
  if (rules.isError) return <ErrorState message={errorMessage(rules.error)} onRetry={rules.refetch} />;

  const { bands, problems, approvers } = rules.data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Approval bands"
        subtitle="The first band a quotation's overage falls into decides who signs it off."
        actions={
          <Button icon={Plus} onClick={() => setDialog({})}>
            New band
          </Button>
        }
      />

      {problems.length > 0 && (
        <div className="mb-5 rounded-xl border border-state-warnBorder bg-state-warnSoft p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-state-warn" aria-hidden="true" />
            <div>
              <p className="font-medium text-state-warn">
                {problems.length === 1
                  ? "One range is not covered"
                  : `${problems.length} ranges are not covered`}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-state-warn">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <TR>
              <TH>Band</TH>
              <TH align="right">Overage</TH>
              <TH>Approved by</TH>
              <TH>Status</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {bands.map((band) => (
              <TR key={band.id}>
                <TD>
                  <span className="font-medium text-sand-900">{band.name}</span>
                </TD>
                <TD figure align="right">
                  {band.minOveragePoints}
                  {band.maxOveragePoints === null ? " and above" : ` to ${band.maxOveragePoints}`}
                </TD>
                <TD>{APPROVERS[approversKey(band)].label}</TD>
                <TD>
                  <StatusPill tone={band.isActive ? "ok" : "neutral"}>
                    {band.isActive ? "Active" : "Inactive"}
                  </StatusPill>
                </TD>
                <TD align="right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setDialog(band)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      onClick={() => remove.mutate(band.id)}
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

      <Card className="mt-5">
        <CardHeader
          title="Who is available to approve"
          subtitle="A band with nobody in the role is escalated past rather than left waiting."
        />

        <div className="flex flex-wrap gap-6">
          {approvers.map((entry) => (
            <div key={entry.role}>
              <p className="text-sm text-sand-600">{ROLE_LABELS[entry.role] || entry.role}</p>
              <p className="mt-0.5 text-xl font-semibold text-sand-900">
                {entry.count}
                <span className="ml-1.5 text-sm font-normal text-sand-600">
                  {entry.count === 1 ? "person" : "people"}
                </span>
              </p>
            </div>
          ))}
        </div>

        {approvers.some((entry) => entry.count === 0) && (
          <p className="mt-4 text-sm text-sand-600">
            A role with nobody in it is dropped from the chain, so a band naming only that role
            approves the quotation outright.
          </p>
        )}
      </Card>

      <BandDialog
        open={Boolean(dialog)}
        band={dialog?.id ? dialog : null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
