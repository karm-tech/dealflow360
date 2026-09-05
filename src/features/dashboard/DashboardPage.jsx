// The landing screen: what needs attention first, then how the business is
// doing.
//
// Every figure here is worked out on the server from the records underneath it.
// Nothing on this page is a stored total, so it cannot disagree with the
// quotation it came from.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, Bell, ChevronUp, Clock } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Modal,
  Spinner,
  StatusPill,
  Textarea,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatMoney, daysSince } from "../../lib/format";
import { QUOTATION_STATUS_LABELS } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";
import { TierSuggestions } from "./TierSuggestions";

const HEALTH_TONES = { HEALTHY: "ok", AT_RISK: "warn", CRITICAL: "bad" };
const BAND_TONES = { TRUSTED: "ok", RELIABLE: "ok", NEW: "info", WATCH: "warn", RISKY: "bad" };

// Only the stages a deal passes through on its way to being won. Cancelled and
// rejected are outcomes, not stages, and are counted in the win rate instead.
const PIPELINE_ORDER = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "UNDER_NEGOTIATION", "CONFIRMED"];

function Kpi({ label, value, hint, tone }) {
  return (
    <Card>
      <p className="text-sm text-sand-600">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${tone || "text-sand-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-sand-600">{hint}</p>}
    </Card>
  );
}

function NoteDialog({ open, title, description, action, isBusy, onClose, onConfirm }) {
  const [note, setNote] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={isBusy} onClick={() => onConfirm(note.trim())}>
            {action}
          </Button>
        </>
      }
    >
      <Field label="Note" htmlFor="nudge-note" hint="Optional. Sent with the alert.">
        <Textarea
          id="nudge-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Customer asked us to come back after their budget round."
        />
      </Field>
    </Modal>
  );
}

// The score and the sentence behind it. The reasons are what make the number
// worth showing: a score nobody can explain is a score nobody acts on.
function AlertCard({ alert, onNudge, onEscalate, canNudge }) {
  const idle = daysSince(alert.lastActivityAt);

  return (
    <div className="rounded-xl border border-sand-200 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/quotations/${alert.id}`}
              className="font-mono font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
            >
              {alert.number}
            </Link>
            <StatusPill tone={HEALTH_TONES[alert.health.band]}>
              {alert.health.label} · {alert.health.score}
            </StatusPill>
            <StatusPill tone="neutral">{QUOTATION_STATUS_LABELS[alert.status]}</StatusPill>
          </div>

          <p className="mt-1 text-base text-sand-800">
            {alert.customer}
            {alert.rep && <span className="text-sand-600"> · {alert.rep}</span>}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          {canNudge && alert.repId && (
            <Button size="sm" variant="ghost" icon={Bell} onClick={() => onNudge(alert)}>
              Nudge
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={ChevronUp} onClick={() => onEscalate(alert)}>
            Escalate
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-sand-200 pt-3">
        {alert.health.penalties.map((penalty) => (
          <li key={penalty.kind} className="flex gap-2 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-state-warn" aria-hidden="true" />
            <span className="text-sand-700">
              <span className="font-medium text-sand-900">−{penalty.points}</span> {penalty.detail}
            </span>
          </li>
        ))}
      </ul>

      {alert.customerScore && alert.customerScore.band !== "TRUSTED" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-sand-600">
          <StatusPill tone={BAND_TONES[alert.customerScore.band]}>
            {alert.customerScore.label} · {alert.customerScore.score}
          </StatusPill>
          <span>{alert.customerScore.summary}</span>
        </p>
      )}

      {idle !== null && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-sand-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Last touched {idle === 0 ? "today" : `${idle} days ago`}
        </p>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [nudging, setNudging] = useState(null);
  const [escalating, setEscalating] = useState(null);

  const dashboard = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
  });

  const nudge = useMutation({
    mutationFn: ({ id, note }) => api.post(`/dashboard/deals/${id}/nudge`, { note }),
    onSuccess: (response) => {
      // Deliberately does not refetch the score: a nudge is a message, not
      // progress, so the alert stays until the deal actually moves.
      toast(`${response.data.nudged} has been told`);
      setNudging(null);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const escalate = useMutation({
    mutationFn: ({ id, note }) => api.post(`/dashboard/deals/${id}/escalate`, { note }),
    onSuccess: (response) => {
      toast(
        response.data.escalatedTo === 1
          ? "The sales manager has been told"
          : `${response.data.escalatedTo} managers have been told`,
      );
      setEscalating(null);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (dashboard.isLoading) return <Spinner label="Working out where things stand" />;
  if (dashboard.isError) {
    return <ErrorState message={errorMessage(dashboard.error)} onRetry={dashboard.refetch} />;
  }

  const data = dashboard.data;
  const { counts } = data.health;
  const needsAttention = counts.AT_RISK + counts.CRITICAL;

  const pipeline = PIPELINE_ORDER.map((status) => ({
    stage: QUOTATION_STATUS_LABELS[status],
    count: data.pipeline.find((row) => row.status === status)?.count || 0,
  }));

  const healthChart = [
    { band: "Healthy", count: counts.HEALTHY, fill: "#067647" },
    { band: "At risk", count: counts.AT_RISK, fill: "#b54708" },
    { band: "Critical", count: counts.CRITICAL, fill: "#b42318" },
  ];

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title={`Good to see you, ${(user?.name || "").split(" ")[0] || "there"}`}
        subtitle={
          data.scope === "own"
            ? "Your deals, and the ones that need a next step."
            : "Every open deal, and the ones that need a next step."
        }
        aside={
          needsAttention > 0 ? (
            <StatusPill tone={counts.CRITICAL > 0 ? "bad" : "warn"}>
              {needsAttention} {needsAttention === 1 ? "deal needs" : "deals need"} attention
            </StatusPill>
          ) : (
            <StatusPill tone="ok">Nothing needs chasing</StatusPill>
          )
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Deals in play"
          value={data.health.liveCount}
          hint={`${counts.HEALTHY} healthy`}
        />
        <Kpi
          label="Need attention"
          value={needsAttention}
          hint={counts.CRITICAL > 0 ? `${counts.CRITICAL} critical` : "None critical"}
          tone={needsAttention > 0 ? "text-state-warn" : undefined}
        />
        <Kpi
          label="Waiting on approval"
          value={data.approvals.pending}
          hint={
            data.approvals.oldestWaitingSince
              ? `Oldest waiting ${daysSince(data.approvals.oldestWaitingSince)} days`
              : "Queue is clear"
          }
        />
        <Kpi
          label="Win rate"
          value={data.winRatePct === null ? "—" : `${data.winRatePct}%`}
          hint={`${data.won} won, ${data.lost} lost over six months`}
        />
      </div>

      {data.money && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Collected"
            value={formatMoney(data.money.collected)}
            hint={`of ${formatMoney(data.money.billed)} billed`}
          />
          <Kpi label="Outstanding" value={formatMoney(data.money.outstanding)} hint="Not yet paid" />
          <Kpi
            label="Overdue"
            value={formatMoney(data.money.overdue)}
            hint="Past its due date"
            tone={data.money.overdue > 0 ? "text-state-bad" : undefined}
          />
          <Kpi
            label="Recurring per month"
            value={formatMoney(data.money.recurringMonthly)}
            hint={`${data.money.activeSubscriptions} active subscriptions`}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card padded={false}>
            <div className="p-6">
              <CardHeader
                title="Needs attention"
                subtitle="Worst first, with the reason for every point lost."
                actions={
                  data.alertCount > data.alerts.length ? (
                    <StatusPill tone="neutral">
                      showing {data.alerts.length} of {data.alertCount}
                    </StatusPill>
                  ) : null
                }
              />
            </div>

            <div className="space-y-3 px-6 pb-6">
              {data.alerts.length === 0 ? (
                <EmptyState
                  title="Nothing is going wrong"
                  hint="Every open deal is scoring 75 or better. Alerts appear here as soon as one slips."
                />
              ) : (
                data.alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    canNudge={alert.repId !== user?.id}
                    onNudge={setNudging}
                    onEscalate={setEscalating}
                  />
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Health of the book" />
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthChart} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" vertical={false} />
                  <XAxis dataKey="band" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e0d8", fontSize: 13 }}
                    formatter={(value) => [value, "deals"]}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {healthChart.map((entry) => (
                      <Cell key={entry.band} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <CardHeader title="Won and lost" subtitle="Last six months." />
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e0d8", fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="won" name="Won" fill="#067647" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lost" name="Lost" fill="#b42318" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Pipeline"
          subtitle="Where the open deals are sitting."
          actions={
            <Link to="/quotations">
              <Button size="sm" variant="secondary" icon={ArrowUpRight}>
                Open the list
              </Button>
            </Link>
          }
        />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pipeline} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d8" vertical={false} />
              <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e0d8", fontSize: 13 }}
                formatter={(value) => [value, "deals"]}
              />
              <Bar dataKey="count" fill="#3d4450" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <TierSuggestions />

      <NoteDialog
        open={Boolean(nudging)}
        title={`Nudge ${nudging?.rep || "the owner"}`}
        description={`A message about ${nudging?.number}. It does not change the deal, so the alert stays until the deal moves.`}
        action="Send nudge"
        isBusy={nudge.isPending}
        onClose={() => setNudging(null)}
        onConfirm={(note) => nudge.mutate({ id: nudging.id, note })}
      />

      <NoteDialog
        open={Boolean(escalating)}
        title={`Escalate ${escalating?.number || ""}`}
        description="Puts this deal in front of the sales manager and records it on the timeline. It does not change who has to approve the discount."
        action="Escalate"
        isBusy={escalate.isPending}
        onClose={() => setEscalating(null)}
        onConfirm={(note) => escalate.mutate({ id: escalating.id, note })}
      />
    </div>
  );
}
