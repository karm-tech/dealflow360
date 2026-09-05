// Suggested tier moves. A person still has to apply them.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  StatusPill,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { CUSTOMER_BAND_TONES, ROLES } from "../../lib/constants";
import { useAuth } from "../../app/AuthProvider";

export function TierSuggestions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [ignored, setIgnored] = useState([]);

  // Only the roles that may actually move a ceiling are asked; for anyone else
  // the request would be refused and the panel would show an error for nothing.
  const canDecide = [ROLES.ADMIN, ROLES.SALES_MANAGER].includes(user?.role);

  const suggestions = useQuery({
    queryKey: ["tier-suggestions"],
    queryFn: async () => (await api.get("/dashboard/tier-suggestions")).data.suggestions,
    enabled: canDecide,
  });

  const apply = useMutation({
    mutationFn: ({ customerId, tierId }) =>
      api.post(`/dashboard/tier-suggestions/${customerId}/apply`, { tierId }),
    onSuccess: (_response, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tier-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast(`${variables.customerName} moved to ${variables.tierName}`);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (!canDecide) return null;

  const rows = (suggestions.data || []).filter((row) => !ignored.includes(row.customerId));
  if (rows.length === 0) return null;

  return (
    <Card className="mt-5" padded={false}>
      <div className="p-6">
        <CardHeader
          title="Tier suggestions"
          subtitle="Based on how these customers have actually behaved. Nothing changes until you say so."
        />
      </div>

      <ul className="divide-y divide-sand-200">
        {rows.map((row) => {
          const isPromote = row.direction === "PROMOTE";

          return (
            <li key={row.customerId} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sand-900">{row.customerName}</span>
                  <StatusPill tone={CUSTOMER_BAND_TONES[row.band]}>
                    {row.label} · {row.score}
                  </StatusPill>
                  <StatusPill tone={isPromote ? "ok" : "warn"}>
                    {isPromote ? (
                      <ArrowUp className="mr-1 h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="mr-1 h-3 w-3" aria-hidden="true" />
                    )}
                    {row.currentTierName} to {row.toTierName}
                  </StatusPill>
                </div>

                <p className="mt-1 text-sm text-sand-700">{row.reason}</p>
                <p className="mt-0.5 text-sm text-sand-500">{row.summary}</p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Check}
                  isLoading={apply.isPending && apply.variables?.customerId === row.customerId}
                  onClick={() =>
                    apply.mutate({
                      customerId: row.customerId,
                      tierId: row.toTierId,
                      customerName: row.customerName,
                      tierName: row.toTierName,
                    })
                  }
                >
                  {isPromote ? "Promote" : "Demote"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  onClick={() => setIgnored((current) => [...current, row.customerId])}
                >
                  Ignore
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
