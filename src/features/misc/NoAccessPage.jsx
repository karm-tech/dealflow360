import { Link } from "react-router-dom";
import { ShieldOff, Compass } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { Wordmark } from "../../components/Wordmark";
import { Button } from "../../components/ui";
import { ROLE_LABELS, ROLES } from "../../lib/constants";

// Shared shell so both messages sit in the same place on the page.
function MessagePage({ icon: Icon, title, children, action }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-12">
      <Wordmark />
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="rounded-full border border-sand-200 bg-surface p-3 shadow-card">
          <Icon className="h-5 w-5 text-sand-500" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-semibold text-sand-900">{title}</h1>
        <p className="text-base text-sand-600">{children}</p>
        {action}
      </div>
    </div>
  );
}

export function NoAccessPage() {
  const { user } = useAuth();
  const homePath = user?.role === ROLES.CUSTOMER ? "/portal" : "/quotations";

  return (
    <MessagePage
      icon={ShieldOff}
      title="This page is not open to your role"
      action={
        <Link to={homePath} className="mt-2">
          <Button>Back to your workspace</Button>
        </Link>
      }
    >
      You are signed in as {user ? ROLE_LABELS[user.role] : "a guest"}. Ask an admin if you need
      access to this area.
    </MessagePage>
  );
}

export function NotFoundPage() {
  return (
    <MessagePage
      icon={Compass}
      title="Page not found"
      action={
        <Link to="/" className="mt-2">
          <Button>Go home</Button>
        </Link>
      }
    >
      That address does not exist in DealFlow360.
    </MessagePage>
  );
}
