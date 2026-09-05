import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, RefreshCw, Settings } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { DemoRail, ModeChip } from "./InstanceMarker";
import { Wordmark } from "./Wordmark";
import { Button } from "./ui";
import { ROLES, ROLE_LABELS } from "../lib/constants";

// The workspace menu. Each entry lists the roles allowed to see it, so the nav
// and the route guards agree with each other.
const NAV_ITEMS = [
  { to: "/quotations", label: "Quotations", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER, ROLES.FINANCE] },
  { to: "/pipeline", label: "Pipeline", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER] },
  { to: "/approvals", label: "Approvals", roles: [ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE] },
  { to: "/fulfilment", label: "Fulfilment", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE] },
  { to: "/billing", label: "Billing", roles: [ROLES.ADMIN, ROLES.FINANCE] },
  { to: "/dashboard", label: "Deal Health", roles: [ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE] },
  { to: "/access-requests", label: "Access Requests", roles: [ROLES.ADMIN] },
];

// The active tab is marked with an underline in the accent colour rather than a
// filled pill. Seven filled pills in a row would fight the page for attention.
function navLinkClasses({ isActive }) {
  const base = "relative rounded-md px-2.5 py-2 text-base font-medium transition-colors";
  return isActive
    ? `${base} text-ink-700 after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink-700`
    : `${base} text-sand-600 hover:bg-sand-100 hover:text-sand-900`;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  // Throw away everything cached and fetch it again, so the rep can be sure
  // prices and stock are current.
  function reloadData() {
    queryClient.invalidateQueries();
  }

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-canvas">
      <DemoRail />

      <header className="border-b border-sand-200 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <NavLink to="/quotations" aria-label="DealFlow360 home">
            <Wordmark />
          </NavLink>

          <nav className="flex flex-wrap gap-0.5" aria-label="Main">
            {visibleItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClasses}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={RefreshCw}
              onClick={reloadData}
              title="Refresh pricing, stock and approval data"
            >
              Reload
            </Button>

            {user.role === ROLES.ADMIN && (
              <NavLink to="/backend" title="Configuration and settings">
                <Button variant="secondary" size="sm" icon={Settings}>
                  Back-end
                </Button>
              </NavLink>
            )}

            <div className="hidden border-l border-sand-200 pl-3 text-right sm:block">
              <p className="text-sm font-medium text-sand-900">{user.name}</p>
              <p className="text-xs text-sand-600">{ROLE_LABELS[user.role]}</p>
            </div>

            <ModeChip />

            <Button
              variant="ghost"
              size="sm"
              icon={LogOut}
              onClick={handleLogout}
              title="Close workspace"
            >
              Close
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
