import { Router } from "express";
import { z } from "zod";
import { queueEmail } from "../lib/outbox.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ASSIGNABLE_ROLES, ROLES, USER_STATUS } from "../lib/constants.js";

export const adminRouter = Router();

// Admin-only. Enforced here, not by hiding the menu item.
adminRouter.use(requireAuth, requireRole(ROLES.ADMIN));

const approveSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES, { errorMap: () => ({ message: "Choose a role for this person" }) }),
});

const rejectSchema = z.object({
  reason: z.string().min(3, "Give a reason so the person knows why"),
});

function requestView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    role: user.role,
    requestedRole: user.requestedRole,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
    rejectionReason: user.rejectionReason,
    approvedBy: user.approvedBy ? user.approvedBy.name : null,
  };
}

// Pending requests first, because those are the ones needing a decision.
adminRouter.get("/access-requests", async (req, res) => {
  const users = await req.db.user.findMany({
    where: { status: { in: [USER_STATUS.PENDING, USER_STATUS.REJECTED] } },
    include: { approvedBy: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  res.json({
    requests: users.map(requestView),
    assignableRoles: ASSIGNABLE_ROLES,
  });
});

// Approval creates the usable account: status ACTIVE plus a role. The role is
// the admin's choice, never the requestedRole from the signup form.
adminRouter.post("/access-requests/:id/approve", async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = Number(req.params.id);
  const user = await req.db.user.findUnique({ where: { id } });

  if (!user) {
    return res.status(404).json({ error: "That request no longer exists" });
  }
  if (user.status === USER_STATUS.ACTIVE) {
    return res.status(409).json({ error: "This account is already active" });
  }

  const updated = await req.db.user.update({
    where: { id },
    data: {
      status: USER_STATUS.ACTIVE,
      role: parsed.data.role,
      approvedById: req.user.id,
      approvedAt: new Date(),
      rejectionReason: null,
    },
  });

  // Audit trail: who did what, to whom, and when.
  await req.db.activityLog.create({
    data: {
      userId: req.user.id,
      action: "ACCESS_REQUEST_APPROVED",
      detail: `Approved ${updated.email} as ${updated.role}`,
    },
  });

  queueEmail({
    to: updated.email,
    subject: "Your DealFlow360 access has been approved",
    body: `Hi ${updated.name}, your account is active. You can now sign in as ${updated.role}.`,
  });

  res.json({ request: requestView(updated) });
});

adminRouter.post("/access-requests/:id/reject", async (req, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const id = Number(req.params.id);
  const user = await req.db.user.findUnique({ where: { id } });

  if (!user) {
    return res.status(404).json({ error: "That request no longer exists" });
  }
  if (user.status === USER_STATUS.ACTIVE) {
    return res.status(409).json({ error: "This account is already active" });
  }

  const updated = await req.db.user.update({
    where: { id },
    data: {
      status: USER_STATUS.REJECTED,
      role: null,
      approvedById: req.user.id,
      approvedAt: new Date(),
      rejectionReason: parsed.data.reason,
    },
  });

  await req.db.activityLog.create({
    data: {
      userId: req.user.id,
      action: "ACCESS_REQUEST_REJECTED",
      detail: `Declined ${updated.email}: ${parsed.data.reason}`,
    },
  });

  queueEmail({
    to: updated.email,
    subject: "Your DealFlow360 access request",
    body: `Hi ${updated.name}, your access request was not approved. Reason: ${parsed.data.reason}`,
  });

  res.json({ request: requestView(updated) });
});
