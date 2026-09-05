import jwt from "jsonwebtoken";
import { normaliseMode } from "./prisma.js";

const SECRET = process.env.JWT_SECRET || "dev-only-secret";
const EXPIRES_IN = "12h";

// The token carries only what the server needs to identify the caller.
// Never put anything secret in here — a token can be read by anyone holding it.
//
// `db` records which instance the person logged into, demo or live. It lives in
// the signed token on purpose: the token cannot be edited without the server's
// secret, so nobody can point a live session at demo data by changing a header.
export function signToken(user, dbMode) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId || null,
      db: normaliseMode(dbMode),
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// Throws when the token is missing, tampered with, or expired.
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}
