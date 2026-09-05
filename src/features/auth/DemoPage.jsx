import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { AuthShell } from "./AuthShell";
import { SignInForm } from "./SignInForm";
import { RequestAccessForm } from "./RequestAccessForm";
import { RegisterCustomerForm } from "./RegisterCustomerForm";
import { useAuth } from "../../app/AuthProvider";
import { api, errorMessage } from "../../lib/api";
import { Card } from "../../components/ui";
import { DB_MODES, ROLE_LABELS, ROLE_ORDER, ROLES } from "../../lib/constants";

const DEMO_PASSWORD = "demo1234";

const SCREEN_COPY = {
  accounts: {
    title: "Explore the demo",
    subtitle: "Pick a role to sign in with one click.",
  },
  request: {
    title: "Request access",
    subtitle: "Your request is filed in the demo database, so you can approve it as the admin.",
  },
  register: {
    title: "Create a customer account",
    subtitle: "Registers a company in the demo database and signs you into its portal.",
  },
};

// The entrance spells out what the demo instance is; inside the app the same
// idea is carried by the rail and chip.
function DemoStrip() {
  return (
    <div className="bg-demo">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-white">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-semibold">Demo mode</span>
          {" — "}
          sample data. Nothing here is saved to live records.
        </p>
      </div>
    </div>
  );
}

// Everything here signs in to the demo database. One click on an account signs
// straight in; the typed form below is the alternative.
export function DemoPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [screen, setScreen] = useState("accounts");
  const [signingIn, setSigningIn] = useState(null);
  const [error, setError] = useState("");

  const accounts = useQuery({
    queryKey: ["demo-accounts", DB_MODES.DEMO],
    queryFn: async () =>
      (await api.get("/auth/demo-accounts", { params: { mode: DB_MODES.DEMO } })).data.users,
  });

  async function signInAs(email) {
    setError("");
    setSigningIn(email);
    try {
      const user = await login(email, DEMO_PASSWORD, DB_MODES.DEMO);
      navigate(user.role === ROLES.CUSTOMER ? "/portal" : "/quotations", { replace: true });
    } catch (caught) {
      setError(errorMessage(caught));
      setSigningIn(null);
    }
  }

  // Grouped so the five roles read as five choices rather than one long list.
  const groups = (accounts.data || [])
    .reduce((acc, user) => {
      const group = acc.find((item) => item.role === user.role);
      if (group) group.users.push(user);
      else acc.push({ role: user.role, users: [user] });
      return acc;
    }, [])
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));

  const isAccounts = screen === "accounts";

  return (
    <AuthShell strip={<DemoStrip />}>
      <Card>
        <h1 className="text-2xl font-semibold text-sand-900">
          {SCREEN_COPY[screen].title}
        </h1>
        <p className="mt-1 text-base text-sand-600">{SCREEN_COPY[screen].subtitle}</p>

        {screen === "request" && (
          <div className="mt-6">
            <RequestAccessForm mode={DB_MODES.DEMO} onDone={() => setScreen("accounts")} />
          </div>
        )}

        {screen === "register" && (
          <div className="mt-6">
            <RegisterCustomerForm mode={DB_MODES.DEMO} onDone={() => setScreen("accounts")} />
          </div>
        )}

        {isAccounts && (
          <>
            {accounts.isLoading && (
              <p className="mt-6 text-sm text-sand-600">Loading demo accounts…</p>
            )}

            {accounts.isError && (
              <p className="mt-6 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
                Could not reach the API. Is the server running on port 4000?
              </p>
            )}

            {error && (
              <p className="mt-6 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
                {error}
              </p>
            )}

            <div className="mt-6 space-y-4">
              {groups.map((group) => (
                <div key={group.role}>
                  <p className="text-2xs font-semibold uppercase text-sand-600">
                    {ROLE_LABELS[group.role]}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {group.users.map((user) => (
                      <button
                        key={user.email}
                        type="button"
                        disabled={Boolean(signingIn)}
                        onClick={() => signInAs(user.email)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-sand-200 px-3 py-2 text-left transition-colors hover:border-ink-200 hover:bg-ink-50 disabled:opacity-60"
                      >
                        <span>
                          <span className="block text-base font-medium text-sand-900">
                            {user.name}
                          </span>
                          <span className="block text-xs text-sand-600">{user.email}</span>
                        </span>
                        {signingIn === user.email ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-700" aria-hidden="true" />
                        ) : (
                          <span className="shrink-0 text-sm font-medium text-ink-700">Sign in</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Typing an address still works, for anyone who prefers it. */}
      {isAccounts && (
        <Card>
          <p className="text-base font-medium text-sand-900">Or sign in by hand</p>
          <p className="mt-0.5 text-sm text-sand-600">
            Every demo account uses the password{" "}
            <code className="figure rounded bg-sand-100 px-1.5 py-0.5 text-sand-800">
              {DEMO_PASSWORD}
            </code>
            .
          </p>
          <div className="mt-4">
            <SignInForm mode={DB_MODES.DEMO} />
          </div>
        </Card>
      )}

      {isAccounts && (
        <div className="space-y-1 text-center text-sm text-sand-600">
          <p>
            Want to see the portal from outside?{" "}
            <button
              type="button"
              onClick={() => setScreen("register")}
              className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
            >
              Register as a customer
            </button>
          </p>
          <p>
            Work here and need an account?{" "}
            <button
              type="button"
              onClick={() => setScreen("request")}
              className="font-medium text-ink-700 underline underline-offset-2 hover:text-ink-800"
            >
              Request access
            </button>
          </p>
        </div>
      )}

      <p className="text-center">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sand-600 hover:text-sand-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
