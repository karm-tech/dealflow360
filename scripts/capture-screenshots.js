import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:5173";
const API = "http://localhost:4000/api";
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

async function login(email, mode) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo1234", mode }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
  return body.token;
}

async function openAuthed(browser, token, mode, url) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, mode }) => {
      localStorage.setItem("dealflow360.token", token);
      localStorage.setItem("dealflow360.mode", mode);
    },
    { token, mode },
  );
  await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main, h1", { timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return page;
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: "png" });
  console.log(`wrote ${name}`);
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

try {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`${BASE}/demo`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await shot(page, "01-demo-signin.png");
  await page.close();

  const adminToken = await login("admin@dealflow360.test", "demo");

  const dashboard = await openAuthed(browser, adminToken, "demo", "/dashboard");
  await dashboard.waitForFunction(
    () => document.body.innerText.includes("Good to see you") || document.body.innerText.includes("Deal"),
    { timeout: 20000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  await shot(dashboard, "02-dashboard.png");
  await dashboard.close();

  const list = await openAuthed(browser, adminToken, "demo", "/quotations");
  await list.waitForFunction(() => document.body.innerText.includes("DF-Q-"), { timeout: 20000 });
  await shot(list, "03-quotations.png");
  await list.close();

  const quotes = await fetch(`${API}/quotations?status=DRAFT`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body = await quotes.json();
  const draftId = body.quotations?.[0]?.id;

  const builder = await openAuthed(
    browser,
    adminToken,
    "demo",
    draftId ? `/quotations/${draftId}` : "/quotations",
  );
  await builder.waitForFunction(() => document.body.innerText.includes("Customer"), { timeout: 20000 });
  const help = await builder.$('button[aria-label*="Tier"]');
  if (help) await help.hover();
  await new Promise((resolve) => setTimeout(resolve, 400));
  await shot(builder, "04-quotation.png");
  await builder.close();

  const reports = await openAuthed(browser, adminToken, "demo", "/reports");
  await reports.waitForFunction(() => document.body.innerText.includes("Reports"), { timeout: 20000 });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await shot(reports, "05-reports.png");
  await reports.close();

  const customerToken = await login("acme@portal.test", "demo");
  const portal = await openAuthed(browser, customerToken, "demo", "/portal");
  await portal.waitForFunction(() => document.body.innerText.includes("Search"), { timeout: 20000 });
  await shot(portal, "06-portal.png");
  await portal.close();
} finally {
  await browser.close();
}
