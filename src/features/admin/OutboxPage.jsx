import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/PageHeader";
import {
  EmptyState,
  ErrorState,
  Spinner,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";

export function OutboxPage() {
  const outbox = useQuery({
    queryKey: ["outbox"],
    queryFn: async () => (await api.get("/notifications/outbox")).data,
  });

  if (outbox.isLoading) return <Spinner label="Loading outbox" />;
  if (outbox.isError) {
    return <ErrorState message={errorMessage(outbox.error)} onRetry={outbox.refetch} />;
  }

  const { messages, smtpConfigured } = outbox.data;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Outbox"
        subtitle={
          smtpConfigured
            ? "Mail sent through the configured SMTP server."
            : "No SMTP server is configured, so mail is recorded here instead of being sent."
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          title="No mail yet"
          hint="Approvals, decisions and access requests all send a message from here."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>To</TH>
              <TH>Subject</TH>
              <TH>Body</TH>
              <TH>Status</TH>
              <TH align="right">Queued</TH>
            </TR>
          </THead>
          <TBody>
            {messages.map((message) => (
              <TR key={message.id}>
                <TD>{message.to}</TD>
                <TD>{message.subject}</TD>
                <TD className="max-w-md text-sand-600">{message.body}</TD>
                <TD>
                  <StatusPill tone={message.status === "SENT" ? "ok" : "neutral"}>
                    {message.status}
                  </StatusPill>
                </TD>
                <TD figure align="right">
                  {formatDate(message.createdAt)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
