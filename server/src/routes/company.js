// Company identity and outgoing mail.
//
// The name, address and logo here are what a customer actually sees, on the
// portal and on every PDF. They are held as data rather than in the code so the
// same build can be handed to a different company.

import { Router } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ROLES } from "../lib/constants.js";
import { logEvent } from "../lib/activity.js";
import { sendTestEmail, verifySmtp } from "../lib/mailer.js";
import { UPLOADS_DIR } from "../lib/uploads.js";

export const companyRouter = Router();

companyRouter.use(requireAuth);

const companySchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name"),
  companyAddress: z.string().trim().max(300).optional().nullable(),
  companyGstin: z.string().trim().max(20).optional().nullable(),
  companyPhone: z.string().trim().max(40).optional().nullable(),
  companyEmail: z.string().trim().email("Enter a valid email address").optional().nullable().or(z.literal("")),
  companyWebsite: z.string().trim().max(120).optional().nullable(),
  documentFooter: z.string().trim().max(500).optional().nullable(),
});

function blankToNull(values) {
  const data = {};
  for (const [key, value] of Object.entries(values)) {
    data[key] = typeof value === "string" && value.trim() === "" ? null : value;
  }
  return data;
}

// Readable by any signed-in member of staff, because the PDF and the page
// headers need it. Only an admin may change it.
companyRouter.get("/", async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });

  res.json({
    company: {
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyGstin: settings.companyGstin,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      companyWebsite: settings.companyWebsite,
      documentFooter: settings.documentFooter,
      logoPath: settings.logoPath,
    },
  });
});

companyRouter.patch("/", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  await req.db.settings.update({ where: { id: 1 }, data: blankToNull(parsed.data) });
  await logEvent(req.db, {
    userId: req.user.id,
    action: "CONFIG_CHANGED",
    detail: "Changed the company details",
  });

  res.json({ ok: true });
});

// --- logo -------------------------------------------------------------------

// Kept in memory so the file is validated before anything is written to disk;
// a logo is small enough that streaming it to a temp file buys nothing.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const IMAGE_TYPES = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

companyRouter.post(
  "/logo",
  requireRole(ROLES.ADMIN),
  upload.single("logo"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Choose an image to upload" });

    // The extension is taken from the reported type rather than the filename,
    // so an uploaded name cannot decide where the file lands or what it is.
    const extension = IMAGE_TYPES[req.file.mimetype];
    if (!extension) {
      return res.status(400).json({ error: "Upload a PNG, JPG or WebP image" });
    }

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    const filename = `logo-${req.dbMode}-${Date.now()}${extension}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), req.file.buffer);

    const previous = await req.db.settings.findUnique({ where: { id: 1 } });

    await req.db.settings.update({
      where: { id: 1 },
      data: { logoPath: `/uploads/${filename}` },
    });

    // The old file is removed only after the new one is recorded, so a failure
    // never leaves the settings pointing at a file that is gone.
    if (previous?.logoPath) {
      const oldFile = path.join(UPLOADS_DIR, path.basename(previous.logoPath));
      fs.rm(oldFile, { force: true }, () => {});
    }

    await logEvent(req.db, {
      userId: req.user.id,
      action: "CONFIG_CHANGED",
      detail: "Uploaded a new company logo",
    });

    res.status(201).json({ logoPath: `/uploads/${filename}` });
  },
);

// Streamed through /api so the browser preview uses the same proxy as every
// other request, rather than asking the Vite origin for a file it does not have.
companyRouter.get("/logo-file", async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });
  if (!settings?.logoPath) return res.status(404).json({ error: "There is no logo" });

  const file = path.join(UPLOADS_DIR, path.basename(settings.logoPath));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "There is no logo" });

  res.sendFile(file);
});

companyRouter.delete("/logo", requireRole(ROLES.ADMIN), async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });
  if (!settings.logoPath) return res.status(404).json({ error: "There is no logo to remove" });

  await req.db.settings.update({ where: { id: 1 }, data: { logoPath: null } });

  const file = path.join(UPLOADS_DIR, path.basename(settings.logoPath));
  fs.rm(file, { force: true }, () => {});

  await logEvent(req.db, {
    userId: req.user.id,
    action: "CONFIG_CHANGED",
    detail: "Removed the company logo",
  });

  res.json({ ok: true });
});

// --- outgoing mail ----------------------------------------------------------

const smtpSchema = z.object({
  smtpHost: z.string().trim().max(200).optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecure: z.boolean(),
  smtpUser: z.string().trim().max(200).optional().nullable(),
  // Absent means "leave it alone", so saving the other fields does not wipe a
  // password the browser was never given.
  smtpPassword: z.string().max(200).optional(),
  smtpFrom: z.string().trim().max(200).optional().nullable(),
});

companyRouter.get("/smtp", requireRole(ROLES.ADMIN), async (req, res) => {
  const settings = await req.db.settings.findUnique({ where: { id: 1 } });

  res.json({
    smtp: {
      smtpHost: settings.smtpHost,
      smtpPort: settings.smtpPort,
      smtpSecure: settings.smtpSecure,
      smtpUser: settings.smtpUser,
      smtpFrom: settings.smtpFrom,
      // The password itself is never sent back out, only whether one is set.
      hasPassword: Boolean(settings.smtpPassword),
    },
  });
});

companyRouter.patch("/smtp", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = smtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { smtpPassword, ...rest } = parsed.data;
  const data = blankToNull(rest);

  if (smtpPassword !== undefined) {
    data.smtpPassword = smtpPassword === "" ? null : smtpPassword;
  }

  // Turning off outgoing mail drops the credentials with it, rather than leaving
  // a password in the database for a server we no longer send through.
  if (data.smtpHost === null) {
    data.smtpUser = null;
    data.smtpPassword = null;
  }

  await req.db.settings.update({ where: { id: 1 }, data });
  await logEvent(req.db, {
    userId: req.user.id,
    action: "CONFIG_CHANGED",
    detail: data.smtpHost ? `Mail set to send through ${data.smtpHost}` : "Turned off outgoing mail",
  });

  const check = await verifySmtp(req.db);
  res.json({ ok: true, connection: check });
});

companyRouter.post("/smtp/test", requireRole(ROLES.ADMIN), async (req, res) => {
  const parsed = z
    .object({ to: z.string().email("Enter an address to send the test to") })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const result = await sendTestEmail(req.db, parsed.data.to);
  if (!result.ok) return res.status(400).json({ error: `Could not send: ${result.error}` });

  res.json({ ok: true });
});
