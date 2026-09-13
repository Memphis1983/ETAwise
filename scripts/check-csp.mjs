// Serves dist/ with the exact headers from staticwebapp.config.json and drives
// the page under them, so the Content-Security-Policy is verified against the
// built output rather than assumed. The Vite dev server the Playwright suite
// runs against does not send those headers, which is why this lives separately.
//
//   npm run build && npm run csp:check
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const distDir = join(root, "dist");
const config = JSON.parse(
  await readFile(join(root, "staticwebapp.config.json"), "utf8"),
);
const globalHeaders = config.globalHeaders ?? {};

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const file = join(distDir, path.endsWith("/") ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      ...globalHeaders,
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { ...globalHeaders, "Content-Type": types[".html"] });
    response.end("<!doctype html><title>404</title>not found");
  }
});

await new Promise((resolve) => server.listen(4180, "127.0.0.1", resolve));

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];

await page.addInitScript(() => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__csp.push(
      `${event.effectiveDirective} blocked ${event.blockedURI || "inline"}${event.sample ? ` (${event.sample})` : ""}`,
    );
  });
});
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

const response = await page.goto("http://127.0.0.1:4180/", {
  waitUntil: "load",
});
const sentPolicy = response.headers()["content-security-policy"];
if (!sentPolicy) problems.push("no Content-Security-Policy header was sent");

// Exercise everything the policy could plausibly break: the module script, the
// self-hosted fonts, the dialog, the prototype switcher, and a form submit.
await page.waitForFunction(() => document.fonts.status === "loaded");
const fontsLoaded = await page.evaluate(() => document.fonts.size > 0);
if (!fontsLoaded) problems.push("no fonts loaded under the policy");

const structuredData = await page.evaluate(() => {
  const block = document.querySelector('script[type="application/ld+json"]');
  if (!block) return "missing";
  try {
    return JSON.parse(block.textContent)["@graph"] ? "ok" : "unexpected shape";
  } catch (error) {
    return `unparseable: ${error.message}`;
  }
});
if (structuredData !== "ok") problems.push(`JSON-LD ${structuredData}`);

await page.getByRole("button", { name: /Scheduled/ }).click();
if ((await page.locator("#case-title").textContent()) !== "On-site visit confirmed")
  problems.push("prototype switcher did not run");

await page.getByRole("button", { name: "Privacy", exact: true }).click();
if (!(await page.getByRole("dialog").isVisible()))
  problems.push("privacy dialog did not open");
await page.getByRole("button", { name: "Close dialog" }).click();

await page.getByRole("button", { name: /Send message/ }).click();
if (!(await page.locator("#contact-name-error").isVisible()))
  problems.push("client-side validation did not run");

await page.route("**/formspree.io/f/*", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }),
);
// The committed action still carries the YOUR_FORMSPREE_ID placeholder, and the
// guard in main.js refuses to submit while it does. Swapping in an ID-shaped
// endpoint is what lets the real submit path run, which is the point here: the
// fetch below is what proves connect-src allows https://formspree.io under this
// policy. The request itself is answered by the mock above.
await page
  .locator("#contact-form")
  .evaluate((form) =>
    form.setAttribute("action", "https://formspree.io/f/cspcheck"),
  );
await page.fill("#contact-name", "Casey Quinn");
await page.fill("#contact-email", "casey@example.com");
await page.fill("#contact-message", "Checking the form under the policy.");
await page.check("#contact-consent");
await page.waitForTimeout(3100);
await page.getByRole("button", { name: /Send message/ }).click();
try {
  // The submit is a fetch, so this one has to be waited for rather than read.
  await page
    .locator(".contact-confirmation")
    .waitFor({ state: "visible", timeout: 5000 });
} catch {
  problems.push("fetch submit did not reach the success state");
}

const violations = await page.evaluate(() => window.__csp);
await browser.close();
server.close();

console.log(`policy: ${sentPolicy}\n`);
for (const violation of violations) console.log(`CSP violation: ${violation}`);
for (const problem of problems) console.log(`problem: ${problem}`);

if (violations.length || problems.length) {
  console.log(
    `\nFAIL: ${violations.length} CSP violation(s), ${problems.length} problem(s).`,
  );
  process.exitCode = 1;
} else {
  console.log("PASS: page works with zero CSP violations.");
}
