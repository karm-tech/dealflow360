import { verifyToken } from "../lib/jwt.js";
import { dbForMode, normaliseMode } from "../lib/prisma.js";

// Blocks the request unless a valid login token was sent. On success sets
// req.user, req.dbMode and req.db.
//
// The instance comes from the signed token only, never a header or query
// string, which any caller could set.
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

// Restricts a route to one or more roles. Used after requireAuth; hiding
// controls in the browser is not access control.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have access to this action" });
    }
    next();
  };
}
