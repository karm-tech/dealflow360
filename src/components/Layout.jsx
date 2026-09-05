import { NavLink, Outlet } from "react-router-dom";
import { Settings } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { DemoRail } from "./InstanceMarker";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { Wordmark } from "./Wordmark";
import { Button } from "./ui";
import { ROLES } from "../lib/constants";

// Each entry lists the roles allowed to see it, matching the route guards.
const NAV_ITEMS = [
  { to: "/quotations", label: "Quotations", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER, ROLES.FINANCE] },
  { to: "/pipeline", label: "Pipeline", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.SALES_MANAGER] },
  { to: "/approvals", label: "Approvals", roles: [ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE] },
  { to: "/fulfilment", label: "Fulfilment", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE] },
  { to: "/billing", label: "Billing", roles: [ROLES.ADMIN, ROLES.SALES_REP, ROLES.FINANCE] },
  { to: "/dashboard", label: "Deal Health", roles: [ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE] },
];

// Active tab is underlined rather than filled; filled pills compete with the
// page content.
function navLinkClasses({ isActive }) {
  const base = "relative rounded-md px-2.5 py-2 text-base font-medium transition-colors";
  return isActive
    ? `${base} text-ink-700 after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink-700`
    : `${base} text-sand-600 hover:bg-sand-100 hover:text-sand-900`;
}

export function Layout() {
  const { user } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-canvas">
      <DemoRail />

      <header className="border-b border-sand-200 bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-x-3 px-4 py-3">
          <NavLink to="/quotations" aria-label="DealFlow360 home">
            <Wordmark />
          </NavLink>

          {/* overflow-y must be set explicitly: with only overflow-x, the y axis
              computes to auto and the active item's underline triggers a scrollbar. */}
          <nav className="flex min-w-0 gap-0.5 overflow-x-auto overflow-y-hidden" aria-label="Main">
            {visibleItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClasses}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            {user.role === ROLES.ADMIN && (
              <NavLink to="/backend" title="Products, price lists, ceilings and settings">
                <Button variant="secondary" size="sm" icon={Settings}>
                  Configuration
                </Button>
              </NavLink>
            )}

            <NotificationBell />

            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
