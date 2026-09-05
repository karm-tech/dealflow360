// The numbers behind the health score. Editable because a threshold is a
// judgement about this business, not a constant: what counts as a stalled deal
// in enterprise hardware is a normal week in retail.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { RotateCcw, Save } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Spinner,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

// Grouped as "how much per day" and "never more than", because that is the pair
// of decisions each penalty actually needs.
const PENALTIES = [
  {
    title: "Gone quiet",
    detail: "Counted only after the grace period below.",
    perDay: { key: "stalledPerDay", label: "Points per day" },
    cap: { key: "stalledCap", label: "Never more than" },
  },
  {
    title: "Delivery slipped",
    detail: "Days between what the customer asked for and what the split can do.",
    perDay: { key: "slippagePerDay", label: "Points per day" },
    cap: { key: "slippageCap", label: "Never more than" },
  },
  {
    title: "Waiting on approval",
    detail: "Our own delay, and the one always fixable today.",
    perDay: { key: "approvalWaitPerDay", label: "Points per day" },
    cap: { key: "approvalWaitCap", label: "Never more than" },
  },
];

export function DealHealthSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  const settings = useQuery({
    queryKey: ["deal-health-settings"],
    queryFn: async () => (await api.get("/config/deal-health")).data,
  });

  useEffect(() => {
    if (!settings.data) return;
    const current = settings.data.settings;
    setForm({
      stalledAfterDays: String(current.stalledAfterDays),
      discountAnomalyThresholdPct: String(current.discountAnomalyThresholdPct),
      minQuotesForRepAverage: String(current.minQuotesForRepAverage),
      weights: Object.fromEntries(
        Object.entries(current.healthWeights).map(([key, value]) => [key, String(value)]),
      ),
    });
  }, [settings.data]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setWeight(key, value) {
    setForm((current) => ({ ...current, weights: { ...current.weights, [key]: value } }));
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch("/config/deal-health", {
        stalledAfterDays: Number(form.stalledAfterDays),
        discountAnomalyThresholdPct: Number(form.discountAnomalyThresholdPct),
        minQuotesForRepAverage: Number(form.minQuotesForRepAverage),
        healthWeights: Object.fromEntries(
          Object.entries(form.weights).map(([key, value]) => [key, Number(value)]),
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-health-settings"] });
      // The score is worked out on every read, so the dashboard reflects this
      // immediately rather than on a nightly job.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Saved — the dashboard has already re-scored");
      setError("");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (settings.isLoading || !form) return <Spinner label="Loading thresholds" />;
  if (settings.isError) {
    return <ErrorState message={errorMessage(settings.error)} onRetry={settings.refetch} />;
  }

  function restoreDefaults() {
    setForm((current) => ({
      ...current,
      weights: Object.fromEntries(
        Object.entries(settings.data.defaults).map(([key, value]) => [key, String(value)]),
      ),
    }));
  }

  const worstCase = Object.entries(form.weights)
    .filter(([key]) => key.endsWith("Cap") || key === "discountAnomaly")
    .reduce((total, [, value]) => total + Number(value || 0), 0);

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Deal health thresholds"
        subtitle="A score is never stored, so a change here re-scores every open deal on the next read."
        actions={
          <Button icon={Save} isLoading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="When something counts as wrong" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Stalled after"
              htmlFor="stalled-days"
              hint="Days of silence before a deal is penalised."
              tooltip="Grace period. Only days after this count toward the stalled penalty."
            >
              <Input
                id="stalled-days"
                type="number"
                min={1}
                value={form.stalledAfterDays}
                onChange={(event) => set("stalledAfterDays", event.target.value)}
              />
            </Field>

            <Field
              label="Discount jump"
              htmlFor="anomaly-threshold"
              hint="Points above the rep's own average."
              tooltip="Compared to this rep's confirmed history, not a company-wide number."
            >
              <Input
                id="anomaly-threshold"
                type="number"
                min={0}
                max={100}
                value={form.discountAnomalyThresholdPct}
                onChange={(event) => set("discountAnomalyThresholdPct", event.target.value)}
              />
            </Field>

            <Field
              label="Deals before an average"
              htmlFor="min-quotes"
              hint="Below this a rep has no baseline and the penalty is skipped."
              tooltip="A tiny sample is not a baseline. The anomaly penalty is skipped until this many deals exist."
            >
              <Input
                id="min-quotes"
                type="number"
                min={1}
                value={form.minQuotesForRepAverage}
                onChange={(event) => set("minQuotesForRepAverage", event.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Bands" />
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-sand-700">Healthy</span>
              <span className="font-mono text-sand-600">75 and above</span>
            </li>
            <li className="flex justify-between">
              <span className="text-sand-700">At risk</span>
              <span className="font-mono text-sand-600">50 to 74</span>
            </li>
            <li className="flex justify-between">
              <span className="text-sand-700">Critical</span>
              <span className="font-mono text-sand-600">below 50</span>
            </li>
          </ul>
          <p className="mt-4 border-t border-sand-200 pt-3 text-sm text-sand-600">
            With these weights the worst a deal can lose is{" "}
            <span className="font-mono text-sand-800">{worstCase}</span> points before the
            customer's own rating is applied.
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="What each problem costs"
          subtitle="Points off a starting score of 100."
          actions={
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={restoreDefaults}>
              Restore defaults
            </Button>
          }
        />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PENALTIES.map((penalty) => (
            <div key={penalty.title} className="rounded-lg border border-sand-200 bg-sand-50 p-4">
              <p className="font-medium text-sand-900">{penalty.title}</p>
              <p className="mt-0.5 mb-3 text-sm text-sand-600">{penalty.detail}</p>

              <div className="space-y-3">
                <Field
                  label={penalty.perDay.label}
                  htmlFor={penalty.perDay.key}
                  tooltip="Points subtracted for each day this condition holds, until the cap."
                >
                  <Input
                    id={penalty.perDay.key}
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.weights[penalty.perDay.key]}
                    onChange={(event) => setWeight(penalty.perDay.key, event.target.value)}
                  />
                </Field>

                <Field
                  label={penalty.cap.label}
                  htmlFor={penalty.cap.key}
                  tooltip="Maximum this penalty can take from one deal."
                >
                  <Input
                    id={penalty.cap.key}
                    type="number"
                    min={0}
                    value={form.weights[penalty.cap.key]}
                    onChange={(event) => setWeight(penalty.cap.key, event.target.value)}
                  />
                </Field>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-sand-200 bg-sand-50 p-4">
            <p className="font-medium text-sand-900">Discount out of character</p>
            <p className="mt-0.5 mb-3 text-sm text-sand-600">
              A flat cost, since one jump is one jump however large.
            </p>

            <Field label="Points" htmlFor="discountAnomaly" tooltip="Flat cost for one out-of-character discount. Size of the jump does not add more.">
              <Input
                id="discountAnomaly"
                type="number"
                min={0}
                max={100}
                value={form.weights.discountAnomaly}
                onChange={(event) => setWeight("discountAnomaly", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <p className="mt-4 border-t border-sand-200 pt-4 text-sm text-sand-600">
          A fifth penalty comes from the customer's own record and is not set here — it is earned
          rather than configured. See it on the{" "}
          <Link
            to="/dashboard"
            className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
          >
            dashboard
          </Link>
          .
        </p>
      </Card>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </div>
  );
}
