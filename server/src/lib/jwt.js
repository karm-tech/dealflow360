import jwt from "jsonwebtoken";
import { normaliseMode } from "./prisma.js";

const SECRET = process.env.JWT_SECRET || "dev-only-secret";
const EXPIRES_IN = "12h";

// Payload is readable by anyone holding the token, so nothing secret goes in it.
// `db` records the instance and is signed: a session cannot be pointed at
// another database by editing a header.
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
