import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Select,
  Spinner,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { ROLE_LABELS } from "../../lib/constants";

// A request typed in on the portal arrives with nobody attached to it. These
// two settings decide who picks it up and what it is priced at.
export function PortalSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();


  const [salesRepId, setSalesRepId] = useState("");
  const [tierId, setTierId] = useState("");

  const config = useQuery({
    queryKey: ["portal-settings"],
    queryFn: async () => (await api.get("/admin/portal-settings")).data,
  });

  useEffect(() => {
    if (!config.data) return;
    setSalesRepId(config.data.settings.portalSalesRepId?.toString() ?? "");
    setTierId(config.data.settings.portalDefaultTierId ?? "");
  }, [config.data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch("/admin/portal-settings", {
        portalSalesRepId: salesRepId ? Number(salesRepId) : null,
        portalDefaultTierId: tierId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal-settings"] });
      toast("Portal settings saved");
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (config.isLoading) return <Spinner label="Loading portal settings" />;
  if (config.isError) {
    return <ErrorState message={errorMessage(config.error)} onRetry={config.refetch} />;
  }

  const { reps, tiers } = config.data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Portal settings"
        subtitle="How self-service requests from the customer portal are handled."
      />

      <Card className="max-w-xl">
        <CardHeader title="Incoming requests" />

        <div className="mt-4 space-y-4">
          <Field
            label="Website salesperson"
            htmlFor="portalSalesRepId"
            hint="Every quotation requested from the portal is assigned to this person, who is notified as soon as it arrives."
            tooltip="If nobody is named, the request still arrives as a draft but has no owner."
          >
            <Select
              id="portalSalesRepId"
              value={salesRepId}
              onChange={(event) => setSalesRepId(event.target.value)}
            >
              <option value="">Nobody — requests arrive unassigned</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name} — {ROLE_LABELS[rep.role]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Starting tier for new customers"
            htmlFor="portalDefaultTierId"
            hint="What a company that registers itself is priced at until someone moves them."
            tooltip="Only for self-registered companies. Existing customers keep the tier already on their record."
          >
            <Select
              id="portalDefaultTierId"
              value={tierId}
              onChange={(event) => setTierId(event.target.value)}
            >
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={() => save.mutate()} isLoading={save.isPending} disabled={!tierId}>
            Save settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
