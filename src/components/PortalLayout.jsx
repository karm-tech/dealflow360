import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FileText, LogOut, Store } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { BasketProvider, useBasket } from "../features/portal/BasketProvider";
import { DemoRail, ModeChip } from "./InstanceMarker";
import { Wordmark } from "./Wordmark";
import { Button } from "./ui";

const TABS = [
  { to: "/portal", label: "Catalogue", icon: Store, end: true },
  { to: "/portal/quotations", label: "My quotations", icon: FileText },
];

function Tab({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-1.5 border-b-2 px-1 pb-2.5 pt-3 text-sm font-medium transition-colors ${
          isActive
            ? "border-ink-700 text-ink-700"
            : "border-transparent text-sand-600 hover:text-sand-900"
        }`
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

// Named for what it does rather than what it is. A customer is not buying here,
// they are asking us to price something, and the button has to say so.
function RequestButton() {
  const navigate = useNavigate();
  const { count } = useBasket();

  return (
    <Button
      variant={count > 0 ? "primary" : "secondary"}
      size="sm"
      onClick={() => navigate("/portal/request")}
    >
      Request a quotation
      {count > 0 && (
        <span className="figure ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
          {count}
        </span>
      )}
    </Button>
  );
}

// A separate shell rather than the workspace with the menu hidden: the staff
// navigation is never rendered here.
export function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <BasketProvider>
      <div className="min-h-screen bg-canvas">
        <DemoRail />

        <header className="border-b border-sand-200 bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
            <Wordmark />
            <span className="hidden border-l border-sand-200 pl-4 text-sm text-sand-600 sm:block">
              Customer portal
            </span>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-sand-900">{user.name}</p>
                <p className="text-xs text-sand-600">{user.email}</p>
              </div>

              <ModeChip />

              <Button variant="ghost" size="sm" icon={LogOut} onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </div>

          <div className="mx-auto flex max-w-4xl items-center gap-5 px-4">
            {TABS.map((tab) => (
              <Tab key={tab.to} {...tab} />
            ))}
            <div className="ml-auto pb-2">
              <RequestButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-8">
          <Outlet />
        </main>
      </div>
    </BasketProvider>
  );
}
