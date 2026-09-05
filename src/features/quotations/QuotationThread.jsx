import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button, Card, Field, Textarea } from "../../components/ui";

function when(value) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QuotationThread({
  messages = [],
  canReply = false,
  isBusy = false,
  viewerIsCustomer = false,
  onSend,
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const text = draft.trim();
    if (!text || isBusy) return;
    onSend(text);
    setDraft("");
  }

  return (
    <Card padded={false}>
      <div className="border-b border-sand-200 px-5 py-3.5">
        <h2 className="text-xl font-semibold text-sand-900">Messages</h2>
        <p className="mt-0.5 text-sm text-sand-600">
          This thread stays on the quotation. Both sides see the same words.
        </p>
      </div>

      {messages.length === 0 ? (
        <p className="px-5 py-6 text-sm text-sand-600">Nothing has been written on this quotation yet.</p>
      ) : (
        <ol className="divide-y divide-sand-200">
          {messages.map((message) => {
            const mine = viewerIsCustomer ? message.fromCustomer : !message.fromCustomer;

            return (
              <li key={message.id} className="flex gap-3 px-5 py-3.5">
                <MessageSquare
                  className={`mt-0.5 h-4 w-4 shrink-0 ${mine ? "text-ink-500" : "text-sand-400"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm text-sand-800">{message.text}</p>
                  {(message.lineName || message.counterDiscountPct != null) && (
                    <p className="mt-1 text-xs font-medium text-sand-700">
                      {message.lineName && <>On {message.lineName}</>}
                      {message.lineName && message.counterDiscountPct != null && " · "}
                      {message.counterDiscountPct != null && (
                        <>Asked for {message.counterDiscountPct}% off</>
                      )}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-sand-500">
                    {mine ? "You" : message.by} · {when(message.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canReply && (
        <div className="space-y-3 border-t border-sand-200 px-5 py-4">
          <Field
            label="Write a reply"
            htmlFor="quote-thread"
            tooltip="Saved on this quotation. The other side sees it without a refresh if they have the page open."
          >
            <Textarea
              id="quote-thread"
              rows={3}
              value={draft}
              disabled={isBusy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
              }}
              placeholder="Ask a question or answer one."
            />
          </Field>
          <Button size="sm" disabled={isBusy || draft.trim().length === 0} onClick={submit}>
            Send
          </Button>
        </div>
      )}
    </Card>
  );
}
