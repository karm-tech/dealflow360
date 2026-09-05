import { verifyToken } from "../lib/jwt.js";
import { dbForMode, normaliseMode } from "../lib/prisma.js";

// Blocks the request unless a valid login token was sent.
//
// On success:
//   req.user    { id, email, role, customerId }
//   req.dbMode  "demo" or "live"
//   req.db      the Prisma client for that instance
//
// The database comes from the signed token and nowhere else. It is deliberately
// NOT read from a header or a query string: those can be typed by anyone, so a
// demo session could ask for live data simply by sending ?mode=live. The token
// is signed, so the only way to change instance is to log in again.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Please log in to continue" });
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.dbMode = normaliseMode(payload.db);
    req.db = dbForMode(req.dbMode);
    next();
  } catch {
    return res.status(401).json({ error: "Your session expired, please log in again" });
  }
}

// Restricts a route to one or more roles. Always used after requireAuth.
//
// Access control is decided here on the server, not by hiding buttons in the
// browser. Even if someone calls the API directly with
// a valid login, the role is checked again before anything happens.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this action" });
    }
    next();
  };
}
