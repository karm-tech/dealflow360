import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { APPROVAL_STATUS, QUOTATION_STATUS, ROLES } from "../lib/constants.js";
import { logActivity } from "../lib/activity.js";
import { canActOnStep, countApprovers, currentStep } from "../lib/approvals.js";
import { QUOTATION_INCLUDE, quotationSummary } from "../lib/quotationView.js";
import { notify, usersInRole, NOTIFICATION_TYPES } from "../lib/notify.js";
import { scoreQuotation } from "../lib/risk.js";
import { suggestFulfilment } from "../lib/fulfilmentService.js";

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.SALES_MANAGER, ROLES.FINANCE));

const decisionSchema = z.object({ reason: z.string().max(500).optional() });

const reasonRequiredSchema = z.object({
  reason: z
    .string({ required_error: "Give a reason so the rep knows what to change" })
    .trim()
    .min(3, "Give a reason so the rep knows what to change"),
});

async function loadWithSteps(db, id) {
  return db.quotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });
}

// Waiting on this person: the live step must match their role, and they cannot
// act on a deal they raised themselves.
async function actionableFor(req) {
  const quotations = await req.db.quotation.findMany({
    where: { status: QUOTATION_STATUS.PENDING_APPROVAL },
    include: QUOTATION_INCLUDE,
    orderBy: { approvalPendingSince: "asc" },
  });

  return quotations.filter((quotation) => {
    const step = currentStep(quotation.approvalSteps);
    return canActOnStep(step, quotation, req.user);
  });
}

approvalsRouter.get("/", async (req, res) => {
  const mine = await actionableFor(req);

  res.json({
    quotations: mine.map((quotation) => {
      const step = currentStep(quotation.approvalSteps);
      const risk = scoreQuotation(quotation);

      return {
        ...quotationSummary(quotation),
        riskScore: risk.score,
        moneyOverCeiling: risk.moneyOverCeiling,
        breachCount: risk.breaches.length,
        waitingOnRole: step.role,
        waitingSince: quotation.approvalPendingSince,
      };
    }),
  });
});

// A quotation opened from this queue pages through the queue, not through every
// quotation in the system.
approvalsRouter.get("/:id/neighbours", async (req, res) => {
  const rows = await actionableFor(req);
  const index = rows.findIndex((row) => row.id === Number(req.params.id));

  if (index === -1) {
    return res.json({ prevId: null, nextId: null, position: null, total: rows.length });
  }

  res.json({
    prevId: index > 0 ? rows[index - 1].id : null,
    nextId: index < rows.length - 1 ? rows[index + 1].id : null,
    position: index + 1,
    total: rows.length,
  });
});

// Shared checks for every decision: the step is live, and this person may take
// it.
async function loadActionable(req, res) {
  const quotation = await loadWithSteps(req.db, Number(req.params.id));
  if (!quotation) {
    res.status(404).json({ error: "That quotation no longer exists" });
    return null;
  }

  const step = currentStep(quotation.approvalSteps);
  if (!step) {
    res.status(409).json({ error: "This quotation is not waiting for approval" });
    return null;
  }

  if (req.user.id === quotation.repId) {
    res.status(403).json({ error: "You cannot approve a quotation you raised yourself" });
    return null;
  }

  if (!canActOnStep(step, quotation, req.user)) {
    res.status(403).json({ error: `This step is waiting on ${step.role.replace("_", " ").toLowerCase()}` });
    return null;
  }

  return { quotation, step };
}

// Claims the step only if it is still pending, so two approvers acting at once
// cannot both succeed. The second is told who got there first.
async function claimStep(req, res, step, status, reason) {
  const claimed = await req.db.approvalStep.updateMany({
    where: { id: step.id, status: APPROVAL_STATUS.PENDING },
    data: { status, actorId: req.user.id, reason: reason || null, actedAt: new Date() },
  });

  if (claimed.count === 0) {
    const settled = await req.db.approvalStep.findUnique({
      where: { id: step.id },
      include: { actor: { select: { name: true } } },
    });
    const who = settled?.actor?.name || "someone else";
    res.status(409).json({ error: `This quotation was already handled by ${who}.` });
    return false;
  }

  return true;
}

approvalsRouter.post("/:id/approve", async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const loaded = await loadActionable(req, res);
  if (!loaded) return;
  const { quotation, step } = loaded;

  if (!(await claimStep(req, res, step, APPROVAL_STATUS.APPROVED, parsed.data.reason))) return;

  const next = quotation.approvalSteps.find(
    (row) => row.sequence > step.sequence && row.status === APPROVAL_STATUS.WAITING,
  );

  if (next) {
    await req.db.approvalStep.update({
      where: { id: next.id },
      data: { status: APPROVAL_STATUS.PENDING },
    });

    await logActivity(req.db, {
      quotationId: quotation.id,
      userId: req.user.id,
      action: "APPROVAL_STEP_APPROVED",
      detail: `Approved as ${step.role} · now with ${next.role}`,
    });

    await notify(req.db, req.dbMode, {
      users: await usersInRole(req.db, next.role, quotation.repId),
      type: NOTIFICATION_TYPES.APPROVAL_ESCALATED,
      title: `${quotation.number} needs your approval`,
      body: `Approved by ${step.role.replace("_", " ").toLowerCase()} · discount risk ${quotation.riskScore} points`,
      quotationId: quotation.id,
    });
  } else {
    await req.db.quotation.update({
      where: { id: quotation.id },
      data: { status: QUOTATION_STATUS.APPROVED, approvalPendingSince: null },
    });

    await logActivity(req.db, {
      quotationId: quotation.id,
      userId: req.user.id,
      action: "QUOTATION_APPROVED",
      detail: `Approved as ${step.role}`,
    });

    // Approval is where the split is worked out. Nothing is reserved yet.
    await suggestFulfilment(req.db, quotation.id);

    await notify(req.db, req.dbMode, {
      users: [quotation.rep],
      type: NOTIFICATION_TYPES.QUOTATION_APPROVED,
      title: `${quotation.number} approved`,
      body: `${quotation.customer.name} · ready to send to the customer`,
      quotationId: quotation.id,
    });
  }

  res.json({ ok: true });
});

approvalsRouter.post("/:id/reject", async (req, res) => {
  const parsed = reasonRequiredSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const loaded = await loadActionable(req, res);
  if (!loaded) return;
  const { quotation, step } = loaded;

  if (!(await claimStep(req, res, step, APPROVAL_STATUS.REJECTED, parsed.data.reason))) return;

  // Later steps never run: the deal is over, not moving on.
  await req.db.approvalStep.updateMany({
    where: { quotationId: quotation.id, status: APPROVAL_STATUS.WAITING },
    data: { status: APPROVAL_STATUS.SKIPPED },
  });

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: {
      status: QUOTATION_STATUS.CANCELLED,
      cancelReason: parsed.data.reason,
      approvalPendingSince: null,
    },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_REJECTED",
    detail: `Rejected as ${step.role} · ${parsed.data.reason}`,
  });

  await notify(req.db, req.dbMode, {
    users: [quotation.rep],
    type: NOTIFICATION_TYPES.QUOTATION_REJECTED,
    title: `${quotation.number} was rejected`,
    body: parsed.data.reason,
    quotationId: quotation.id,
  });

  res.json({ ok: true });
});

// Sends it back to the rep. The quotation becomes editable again and is scored
// from scratch when it is resubmitted.
approvalsRouter.post("/:id/return", async (req, res) => {
  const parsed = reasonRequiredSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const loaded = await loadActionable(req, res);
  if (!loaded) return;
  const { quotation, step } = loaded;

  if (!(await claimStep(req, res, step, APPROVAL_STATUS.RETURNED, parsed.data.reason))) return;

  await req.db.approvalStep.updateMany({
    where: { quotationId: quotation.id, status: APPROVAL_STATUS.WAITING },
    data: { status: APPROVAL_STATUS.SKIPPED },
  });

  await req.db.quotation.update({
    where: { id: quotation.id },
    data: { status: "RETURNED", approvalPendingSince: null },
  });

  await logActivity(req.db, {
    quotationId: quotation.id,
    userId: req.user.id,
    action: "QUOTATION_RETURNED",
    detail: `Returned for revision by ${step.role} · ${parsed.data.reason}`,
  });

  await notify(req.db, req.dbMode, {
    users: [quotation.rep],
    type: NOTIFICATION_TYPES.QUOTATION_RETURNED,
    title: `${quotation.number} returned for revision`,
    body: parsed.data.reason,
    quotationId: quotation.id,
  });

  res.json({ ok: true });
});

// How many approvers a role has, used to show that a step sits with a pool.
approvalsRouter.get("/:id/approvers", async (req, res) => {
  const quotation = await loadWithSteps(req.db, Number(req.params.id));
  if (!quotation) return res.status(404).json({ error: "That quotation no longer exists" });

  const step = currentStep(quotation.approvalSteps);
  if (!step) return res.json({ approverCount: 0 });

  res.json({ approverCount: await countApprovers(req.db, step.role, quotation.repId) });
});
