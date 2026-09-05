import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Save, Send } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  StatusPill,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

const BLANK = {
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: "false",
  smtpUser: "",
  smtpPassword: "",
  smtpFrom: "",
};

export function MailSettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState("");

  const smtp = useQuery({
    queryKey: ["smtp"],
    queryFn: async () => (await api.get("/company/smtp")).data.smtp,
  });

  useEffect(() => {
    if (!smtp.data) return;
    setForm({
      smtpHost: smtp.data.smtpHost || "",
      smtpPort: String(smtp.data.smtpPort ?? 587),
      smtpSecure: smtp.data.smtpSecure ? "true" : "false",
      smtpUser: smtp.data.smtpUser || "",
      // Never sent to the browser, so the box starts empty and only overwrites
      // the stored password when something is typed into it.
      smtpPassword: "",
      smtpFrom: smtp.data.smtpFrom || "",
    });
  }, [smtp.data]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch("/company/smtp", {
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort),
        smtpSecure: form.smtpSecure === "true",
        smtpUser: form.smtpUser.trim(),
        smtpFrom: form.smtpFrom.trim(),
        ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["smtp"] });
      setError("");

      // Saving also tries the connection, so a wrong host is caught here rather
      // than silently failing on the next customer email.
      const connection = response.data.connection;
      if (!form.smtpHost.trim()) toast("Outgoing mail turned off — messages will queue in the outbox");
      else if (connection?.ok) toast("Saved, and the mail server answered");
      else toast(`Saved, but the server did not answer: ${connection?.error}`, "error");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const test = useMutation({
    mutationFn: () => api.post("/company/smtp/test", { to: testTo.trim() }),
    onSuccess: () => {
      toast(`Test message sent to ${testTo.trim()}`);
      setError("");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (smtp.isLoading) return <Spinner label="Loading mail settings" />;
  if (smtp.isError) return <ErrorState message={errorMessage(smtp.error)} onRetry={smtp.refetch} />;

  const isConfigured = Boolean(form.smtpHost.trim());

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Outgoing mail"
        subtitle="Where the app sends customer email from."
        aside={
          <StatusPill tone={isConfigured ? "ok" : "warn"}>
            {isConfigured ? "Sending live" : "Queueing only"}
          </StatusPill>
        }
        actions={
          <Button icon={Save} isLoading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Mail server"
            subtitle="Leave the host empty to queue without sending. Clearing it also discards the saved credentials."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Host" htmlFor="smtp-host" hint="For example smtp.gmail.com.">
                <Input
                  id="smtp-host"
                  value={form.smtpHost}
                  onChange={(event) => set("smtpHost", event.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </Field>
            </div>

            <Field label="Port" htmlFor="smtp-port">
              <Input
                id="smtp-port"
                type="number"
                min={1}
                max={65535}
                value={form.smtpPort}
                onChange={(event) => set("smtpPort", event.target.value)}
              />
            </Field>

            <Field
              label="Encryption"
              htmlFor="smtp-secure"
              hint="Port 465 uses TLS from the start; 587 upgrades to it."
            >
              <Select
                id="smtp-secure"
                value={form.smtpSecure}
                onChange={(event) => set("smtpSecure", event.target.value)}
              >
                <option value="false">STARTTLS (587)</option>
                <option value="true">TLS (465)</option>
              </Select>
            </Field>

            <Field label="Username" htmlFor="smtp-user">
              <Input
                id="smtp-user"
                value={form.smtpUser}
                onChange={(event) => set("smtpUser", event.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="smtp-password"
              hint={smtp.data.hasPassword ? "A password is saved. Type to replace it." : "Not set."}
            >
              <Input
                id="smtp-password"
                type="password"
                value={form.smtpPassword}
                onChange={(event) => set("smtpPassword", event.target.value)}
                placeholder={smtp.data.hasPassword ? "••••••••" : ""}
                autoComplete="new-password"
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="From address"
                htmlFor="smtp-from"
                hint="What the customer sees as the sender."
              >
                <Input
                  id="smtp-from"
                  value={form.smtpFrom}
                  onChange={(event) => set("smtpFrom", event.target.value)}
                  placeholder="sales@yourcompany.com"
                />
              </Field>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Send a test" subtitle="Proves the settings before a customer relies on them." />

            <Field label="To" htmlFor="test-to">
              <Input
                id="test-to"
                type="email"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                placeholder="you@yourcompany.com"
              />
            </Field>

            <Button
              className="mt-4"
              variant="secondary"
              icon={Send}
              isLoading={test.isPending}
              disabled={!isConfigured || !testTo.trim()}
              onClick={() => test.mutate()}
            >
              Send test email
            </Button>

            {!isConfigured && (
              <p className="mt-3 text-sm text-sand-600">Set a host and save before testing.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="If sending fails" />
            <p className="text-sm text-sand-600">
              Every message is written to the outbox before it is handed to the mail server, so
              nothing is lost when sending fails. A failed message keeps the reason it failed.
            </p>
            <Link
              to="/outbox"
              className="mt-3 inline-block text-sm font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
            >
              Open the outbox
            </Link>
          </Card>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </div>
  );
}
