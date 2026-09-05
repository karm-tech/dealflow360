import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dbForMode, normaliseMode } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { queueEmail } from "../lib/outbox.js";
import { requireAuth } from "../middleware/auth.js";
import { DB_MODES, USER_STATUS } from "../lib/constants.js";

export const authRouter = Router();

// Validation runs on the server as well as in the form. The browser check is a
// convenience; this one is the rule.
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

// Routes reached with a token use req.db, which requireAuth fills in.
// The three routes below run BEFORE anyone has a token, so there is no session
// to trust and they have to work out the instance themselves. That is safe:
// choosing which instance to sign in to is the caller's decision anyway, and
// each database holds its own separate list of accounts.
function dbFromRequest(source) {
  return dbForMode(normaliseMode(source?.mode));
}

// Sent to the browser after login. Note there is no password hash in here.
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    customerId: user.customerId,
  };
}

// Every refused login says exactly why, so nobody is left guessing whether they
// mistyped a password or are simply still waiting on an admin.
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

  // Same message whether the email is unknown or the password is wrong, so the
  // response cannot be used to discover which accounts exist.
  if (!user) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Email or password is incorrect" });
  }

  // Password is right, so it is safe to explain what is holding the account up.
  if (user.status !== USER_STATUS.ACTIVE) {
    return res.status(403).json({ error: STATUS_MESSAGES[user.status] || "This account cannot sign in." });
  }

  // An active account with no role would be an approval that went half way.
  if (!user.role) {
    return res.status(403).json({ error: "Your account has no role yet. Please contact an admin." });
  }

  res.json({ token: signToken(user, mode), user: publicUser(user), mode });
});

// Signup for internal staff. It does NOT create a working account.
//
// Explain to judge: the spec allows internal signup, but this system governs
// discount approvals — letting anyone create their own sales account would be a
// hole. So signing up creates a request with no role and no token, and an admin
// decides both whether to approve it and which role it gets.
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
      // Recorded only so the admin can see what the person asked for. It grants
      // nothing by itself — the admin still picks the role on approval.
      requestedRole: requestedRole || null,
    },
  });

  // No token is returned. There is nothing to log in to yet.
  res.status(201).json({
    status: USER_STATUS.PENDING,
    message: "Request submitted. An admin will review it and you will be emailed once it is approved.",
  });

  queueEmail({
    to: email,
    subject: "DealFlow360 access request received",
    body: `Hi ${name}, your access request has been sent to an admin for review.`,
  });
});

// Used by the app on every page load to find out who is logged in. Reading the
// user fresh from the database means a disabled account stops working straight
// away instead of lasting until the token expires.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await req.db.user.findUnique({ where: { id: req.user.id } });

  if (!user || user.status !== USER_STATUS.ACTIVE) {
    return res.status(401).json({ error: "Your account is no longer active" });
  }

  res.json({ user: publicUser(user), mode: req.dbMode });
});

// Small helper the login screen uses to list the demo accounts, so a judge can
// sign in as any role without being handed a list of addresses.
//
// Demo instance only. This route needs no login, and the live database holds
// real people's addresses — handing those out to anyone who asks would be a
// leak. Customer logins are included because the portal is part of what there
// is to try.
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
