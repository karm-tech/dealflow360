import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FlaskConical } from "lucide-react";
import { AuthShell } from "./AuthShell";
import { SignInForm } from "./SignInForm";
import { RequestAccessForm } from "./RequestAccessForm";
import { Card } from "../../components/ui";
import { DB_MODES } from "../../lib/constants";

// Signs in to the live instance. The demo has its own address, /demo.
export function LoginPage() {
  const [screen, setScreen] = useState("login");
  const isRequest = screen === "request";

  return (
    <AuthShell>
      <Card>
        <h1 className="text-2xl font-semibold text-sand-900">
          {isRequest ? "Request access" : "Welcome back"}
        </h1>
        <p className="mt-1 text-base text-sand-600">
          {isRequest
            ? "An admin reviews every request and decides the role."
            : "Sign in to continue."}
        </p>

        <div className="mt-6">
          {isRequest ? (
            <RequestAccessForm mode={DB_MODES.LIVE} onDone={() => setScreen("login")} />
          ) : (
            <SignInForm
              mode={DB_MODES.LIVE}
              footer={
                <p className="mt-1 text-sm text-sand-700">
                  Looking for the demo?{" "}
                  <Link
                    to="/demo"
                    className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
                  >
                    Explore it here
                  </Link>
                </p>
              }
            />
          )}
        </div>
      </Card>

      {/* Visible rather than collapsed: the live database starts empty, so
          someone who misses this and signs in to live sees nothing. */}
      {!isRequest && (
        <Link
          to="/demo"
          className="group flex items-center gap-3 rounded-xl border border-demo-border bg-demo-soft p-4 text-left shadow-card transition-colors hover:border-demo/40"
        >
          <FlaskConical className="h-5 w-5 shrink-0 text-demo" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-base font-semibold text-demo">
              Explore the demo
            </span>
            <span className="block text-sm text-sand-700">
              Sample customers, quotations and history. Sign in as any role with one click.
            </span>
          </span>
          <ArrowRight
            className="h-4 w-4 shrink-0 text-demo transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}

      {!isRequest && (
        <p className="text-center text-sm text-sand-600">
          Work here and need an account?{" "}
          <button
            type="button"
            onClick={() => setScreen("request")}
            className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
          >
            Request access
          </button>
        </p>
      )}

      <p className="text-center text-xs text-sand-500">
        Requesting access is for internal staff. Customers do not sign up — you are sent a link
        when a quotation is shared with you.
      </p>
    </AuthShell>
  );
}
