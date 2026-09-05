import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES } from "../lib/constants.js";
import { listEmails, isSmtpConfigured } from "../lib/outbox.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const notifications = await req.db.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const unreadCount = await req.db.notification.count({
    where: { userId: req.user.id, readAt: null },
  });

  res.json({ notifications, unreadCount });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  // Scoped to the caller, so an id from someone else's list does nothing.
  await req.db.notification.updateMany({
    where: { id: Number(req.params.id), userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({ ok: true });
});

notificationsRouter.post("/read-all", async (req, res) => {
  await req.db.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });

  res.json({ ok: true });
});

// What the app has sent. Admin only: it lists every recipient's address.
notificationsRouter.get("/outbox", requireRole(ROLES.ADMIN), async (req, res) => {
  res.json({ messages: await listEmails(req.db), smtpConfigured: isSmtpConfigured() });
});
