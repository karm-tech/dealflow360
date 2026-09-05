import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { Spinner } from "../components/ui";

// Wraps a route so only logged-in users with an allowed role can open it.
// Pass no roles to mean "any logged-in user".
//
// This is a convenience for the person using the app — it keeps them out of
// pages they cannot use. The real check is on the server, because a browser
// guard can always be bypassed.
export function RequireRole({ roles = [], children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Spinner label="Checking your session" />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/no-access" replace />;
  }

  return children;
}
