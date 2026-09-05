import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { quotationsRouter } from "./routes/quotations.js";
import { catalogueRouter } from "./routes/catalogue.js";
import { approvalsRouter } from "./routes/approvals.js";
import { notificationsRouter } from "./routes/notifications.js";
import { fulfilmentRouter } from "./routes/fulfilment.js";
import { billingRouter } from "./routes/billing.js";
import { portalRouter } from "./routes/portal.js";
import { configRouter } from "./routes/config.js";
import { companyRouter } from "./routes/company.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { documentsRouter } from "./routes/documents.js";
import { initRealtime } from "./lib/realtime.js";
import { startRenewalTicker } from "./lib/renewalTicker.js";
import { UPLOADS_DIR } from "./lib/uploads.js";

const app = express();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dealflow360-api" });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/quotations", quotationsRouter);
app.use("/api/catalogue", catalogueRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/fulfilment", fulfilmentRouter);
app.use("/api/billing", billingRouter);
app.use("/api/portal", portalRouter);
app.use("/api/config", configRouter);
app.use("/api/company", companyRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/documents", documentsRouter);

// The company logo is the only uploaded file, and it is on show in the page
// header and on every document, so it is served without a token.
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "1h" }));

// Routes read their database from req.db, never by importing a client.
// See server/src/routes/README.md.

// An unknown API path returns clean JSON instead of an HTML error page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Turns anything thrown in a route into a JSON response.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

// Express and socket.io share one server so both answer on the same port.
const server = http.createServer(app);
initRealtime(server, CLIENT_ORIGIN);

server.listen(PORT, () => {
  console.log(`DealFlow360 API listening on http://localhost:${PORT}`);
  startRenewalTicker();
});
