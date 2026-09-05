import { Outlet, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../app/AuthProvider";
import { DemoBanner, ModeBadge } from "./DemoBanner";
import { Wordmark } from "./Wordmark";
import { Button } from "./ui";

// Customers get their own shell, not the internal workspace with the menu
// hidden. The problem statement asks for a genuinely separate restricted view,
// so the portal never renders the staff navigation at all.
//
// It also reads differently on purpose — narrower column, no toolbar — so a
// customer never feels like they are looking at an internal system.
export function PortalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-canvas">
      <DemoBanner />

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

            <ModeBadge />

            <Button variant="ghost" size="sm" icon={LogOut} onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
