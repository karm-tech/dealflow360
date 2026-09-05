import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";

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

// Remaining routers are added here as they are built:
//   /api/quotations  /api/approvals  /api/fulfilment
//   /api/billing     /api/portal     /api/dashboard
//
// Routes read their database from req.db, never by importing a client.
// See server/src/routes/README.md.

// An unknown API path returns clean JSON instead of an HTML error page.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Anything thrown in a route lands here and becomes a tidy JSON response, so
// the browser never has to deal with a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

app.listen(PORT, () => {
  console.log(`DealFlow360 API listening on http://localhost:${PORT}`);
});
