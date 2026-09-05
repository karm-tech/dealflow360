import { MessageSquare } from "lucide-react";
import { Card } from "../../components/ui";

// The customer's own words, kept apart from the history. What they asked for
// when they raised the request, and what they said when they sent it back —
// the wording a rep needs before picking up the phone.
export function CustomerMessages({ messages }) {
  if (!messages || messages.length === 0) return null;

  return (
    <Card padded={false}>
      <div className="border-b border-sand-200 px-5 py-3.5">
        <h2 className="text-xl font-semibold text-sand-900">From the customer</h2>
      </div>

      <ol className="divide-y divide-sand-200">
        {messages.map((message) => (
          <li key={message.id} className="flex gap-3 px-5 py-3.5">
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sand-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-sand-800">{message.text}</p>
              <p className="mt-0.5 text-xs text-sand-500">
                {message.by} ·{" "}
                {new Date(message.at).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
