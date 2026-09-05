import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dbForMode, normaliseMode } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { queueEmail } from "../lib/outbox.js";
import { requireAuth } from "../middleware/auth.js";
import { DB_MODES, USER_STATUS } from "../lib/constants.js";

export const authRouter = Router();

// Server-side validation. The form's own checks are a convenience.
const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  mode: z.string().optional(),
});

const signupSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  requestedRole: z.string().optional(),
  mode: z.string().optional(),
});

// The routes below run before a token exists, so they resolve the instance
// from the request. Each database holds its own separate list of accounts.
function dbFromRequest(source) {
  return dbForMode(normaliseMode(source?.mode));
}

// Shape sent to the browser. Excludes the password hash.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    customerId: user.customerId,
  };
}

// Shown only after the password check passes.
const STATUS_MESSAGES = {
  [USER_STATUS.PENDING]: "Your access request is waiting for admin approval.",
  [USER_STATUS.REJECTED]: "Your access request was declined.",
  [USER_STATUS.DISABLED]: "This account has been disabled.",
};

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { email, password } = parsed.data;
  const mode = normaliseMode(parsed.data.mode);
  const db = dbFromRequest(parsed.data);

  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });

  // Same message for unknown email and wrong password, so the response cannot
  // be used to discover which accounts exist.
  if (!user) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }

  // Password verified, so the account status can safely be explained.
  if (user.status !== USER_STATUS.ACTIVE) {
    return res.status(403).json({ error: STATUS_MESSAGES[user.status] || "This account cannot sign in." });
  }

  // An active account with no role means an approval only half applied.
  if (!user.role) {
    return res.status(403).json({ error: "Your account has no role yet. Please contact an admin." });
  }

  res.json({ token: signToken(user, mode), user: publicUser(user), mode });
});

// Files an access request for internal staff. Creates no role and returns no
// token; an admin decides both on approval.
authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { name, password, requestedRole } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const db = dbFromRequest(parsed.data);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: null,
      status: USER_STATUS.PENDING,
      // Advisory only; the admin picks the role on approval.
      requestedRole: requestedRole || null,
    },
  });

  queueEmail({
    to: email,
    subject: "DealFlow360 access request received",
    body: `Hi ${name}, your access request has been sent to an admin for review.`,
  });

  res.status(201).json({
    status: USER_STATUS.PENDING,
    message: "Request submitted. An admin will review it and you will be emailed once it is approved.",
  });
});

// Read fresh from the database so a disabled account stops working immediately
// rather than when the token expires.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await req.db.user.findUnique({ where: { id: req.user.id } });

  if (!user || user.status !== USER_STATUS.ACTIVE) {
    return res.status(401).json({ error: "Your account is no longer active" });
  }

  res.json({ user: publicUser(user), mode: req.dbMode });
});

// Accounts listed on the demo sign-in page. Demo instance only: this route
// needs no login and the live database holds real addresses.
authRouter.get("/demo-accounts", async (req, res) => {
  const mode = normaliseMode(req.query?.mode);

  if (mode !== DB_MODES.DEMO) {
    return res.json({ users: [] });
  }

  const users = await dbForMode(mode).user.findMany({
    where: { status: USER_STATUS.ACTIVE },
    select: { name: true, email: true, role: true },
    orderBy: { id: "asc" },
  });
  res.json({ users });
});
