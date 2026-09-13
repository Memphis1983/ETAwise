import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The form refuses anything submitted within 3 seconds of load, in the browser
// and again in the Function. Tests that expect a submit to leave the page have
// to sit out that window rather than mock around it, because the guard is one
// of the things being tested.
const MIN_ELAPSED_MS = 3000;

async function openForm(page) {
  const openedAt = Date.now();
  await page.goto("/#early-access");
  await expect(page.locator("#contact-form")).toBeVisible();
  return openedAt;
}

async function fillValidForm(page) {
  await page.fill("#contact-name", "Casey Quinn");
  await page.fill("#contact-email", "casey.quinn@example.com");
  await page.fill(
    "#contact-message",
    "Our tier 2 handoffs stall for days. How do you plan to track update commitments?",
  );
  await page.check("#contact-consent");
}

async function waitOutTimingGuard(page, openedAt) {
  const remaining = MIN_ELAPSED_MS + 150 - (Date.now() - openedAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

function mockEndpoint(page, status, body) {
  return page.route("**/api/contact", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: status === 429 ? { "Retry-After": "420" } : {},
      body: JSON.stringify(body),
    }),
  );
}

test("an empty submit reports every problem and moves focus to the first one", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-summary")).toHaveText(
    "4 fields need attention. They are marked below.",
  );
  await expect(page.locator("#contact-name-error")).toContainText(
    "Enter your name",
  );
  await expect(page.locator("#contact-email-error")).toContainText(
    "Enter your email address",
  );
  await expect(page.locator("#contact-message-error")).toContainText(
    "Enter the message",
  );
  await expect(page.locator("#contact-consent-error")).toContainText(
    "Tick the box",
  );

  // Programmatic association, not just visible text.
  await expect(page.locator("#contact-name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#contact-name")).toHaveAttribute(
    "aria-describedby",
    "contact-name-error",
  );
  await expect(page.locator("#contact-message")).toHaveAttribute(
    "aria-describedby",
    "contact-message-hint contact-message-error",
  );
  await expect(page.locator("#contact-name")).toBeFocused();
});

test("form errors are announced without colour and stay accessible", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-name-error")).toBeVisible();

  // Colour is not the only signal: each message carries a marker glyph that is
  // hidden from assistive technology, plus the message text itself.
  await expect(
    page.locator("#contact-name-error .field-error-mark"),
  ).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#contact-name-error .field-error-mark")).toHaveText(
    "\u26A0",
  );
  await expect(page.locator("#contact-summary")).toHaveAttribute(
    "aria-live",
    "polite",
  );

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("an invalid email address is rejected and clears once corrected", async ({
  page,
}) => {
  await openForm(page);
  await page.fill("#contact-email", "casey.quinn@example");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-email-error")).toContainText(
    "Enter an email address in the form name@example.com.",
  );
  await expect(page.locator("#contact-email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await page.fill("#contact-email", "casey.quinn@example.com");
  await expect(page.locator("#contact-email-error")).toBeHidden();
  await expect(page.locator("#contact-email")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("an unticked consent box blocks the submit", async ({ page }) => {
  const openedAt = await openForm(page);
  let requests = 0;
  await page.route("**/api/contact", (route) => {
    requests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
  });

  await expect(page.locator("#contact-consent")).not.toBeChecked();
  await page.fill("#contact-name", "Casey Quinn");
  await page.fill("#contact-email", "casey.quinn@example.com");
  await page.fill("#contact-message", "Asking about escalation handoffs.");
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-consent-error")).toContainText(
    "Tick the box",
  );
  await expect(page.locator("#contact-consent")).toBeFocused();
  await expect(page.locator("#contact-form")).toBeVisible();
  expect(requests).toBe(0);
});

test("a valid submit replaces the form with a confirmation", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  const payloads = [];
  await page.route("**/api/contact", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, message: "Message sent." }),
    });
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator(".contact-confirmation")).toBeVisible();
  await expect(page.locator(".contact-confirmation")).toContainText(
    "Message sent.",
  );
  await expect(page.locator(".contact-confirmation")).toContainText(
    "not a signup",
  );
  await expect(page.locator("#contact-form")).toHaveCount(0);
  await expect(page.locator("#contact-status")).toHaveAttribute(
    "data-state",
    "success",
  );
  await expect(page.locator(".contact-confirmation")).toBeFocused();

  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({
    name: "Casey Quinn",
    email: "casey.quinn@example.com",
    consent: true,
    website: "",
  });
  expect(Number(payloads[0].ts)).toBeGreaterThan(0);
});

test("a rate-limited submit explains the wait and offers the email address", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await mockEndpoint(page, 429, { ok: false, error: "too many", retryAfter: 420 });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  const status = page.locator("#contact-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("Too many messages");
  await expect(status).toContainText("about 7 minutes");
  await expect(status).toContainText("contactus@etawise.tech");
  // The form is still there to retry with, and re-enabled.
  await expect(page.locator("#contact-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("an unconfigured endpoint says so instead of claiming success", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await mockEndpoint(page, 503, {
    ok: false,
    error: "not configured",
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  const status = page.locator("#contact-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("not configured yet");
  await expect(status).toContainText("nothing was sent");
  await expect(status).toContainText("contactus@etawise.tech");
  await expect(page.locator(".contact-confirmation")).toHaveCount(0);
});

test("a server error and a dead network read differently", async ({ page }) => {
  const openedAt = await openForm(page);
  await mockEndpoint(page, 500, { ok: false });
  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-status")).toContainText(
    "Something went wrong on our side",
  );

  await page.unroute("**/api/contact");
  await page.route("**/api/contact", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-status")).toContainText(
    "could not reach the server",
  );
});

test("field-level errors returned by the endpoint are shown on the fields", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await mockEndpoint(page, 400, {
    ok: false,
    errors: { message: "Server says this message is too short." },
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-message-error")).toContainText(
    "Server says this message is too short.",
  );
  await expect(page.locator("#contact-message")).toBeFocused();
  await expect(page.locator("#contact-status")).toContainText(
    "Check the fields marked above",
  );
});

test("the honeypot is unreachable and its own failure is handled", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  let requests = 0;
  await page.route("**/api/contact", (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: "{}" });
  });

  const honeypot = page.locator("#contact-website");
  // Off-screen rather than display:none, so it is out of reach for a person and
  // for assistive technology while a script still finds and fills it. That is
  // the point: toBeHidden() would fail here and should.
  await expect(honeypot).toHaveAttribute("tabindex", "-1");
  await expect(page.locator(".offscreen-field")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const box = await honeypot.boundingBox();
  expect(box.x + box.width).toBeLessThan(0);
  expect(
    await honeypot.evaluate((node) => getComputedStyle(node).display),
  ).not.toBe("none");

  await fillValidForm(page);
  // Only a script would ever put a value in here.
  await page.locator("#contact-website").evaluate((input) => {
    input.value = "https://example.com";
  });
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-status")).toContainText(
    "could not be accepted",
  );
  expect(requests).toBe(0);
});

test("a submit inside the first three seconds is held back", async ({
  page,
}) => {
  await openForm(page);
  let requests = 0;
  await page.route("**/api/contact", (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: "{}" });
  });

  await fillValidForm(page);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-status")).toContainText(
    "submitted very quickly",
  );
  expect(requests).toBe(0);
});

test("the form fits every width it has to fit", async ({ page }) => {
  for (const width of [320, 390, 540, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#early-access");
    await expect(page.locator("#contact-form")).toBeVisible();
    // A 16px minimum keeps iOS Safari from zooming the viewport on focus.
    for (const selector of ["#contact-name", "#contact-email", "#contact-message"]) {
      const size = await page.locator(selector).evaluate((node) =>
        parseFloat(getComputedStyle(node).fontSize),
      );
      expect(size, `${selector} at ${width}px`).toBeGreaterThanOrEqual(16);
    }
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.document, `document overflow at ${width}px`).toBeLessThanOrEqual(
      overflow.viewport,
    );
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the form still posts natively to the endpoint", async ({ page }) => {
    let posted = null;
    await page.route("**/api/contact", (route) => {
      const request = route.request();
      posted = { method: request.method(), body: request.postData() };
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html lang=en><title>Message sent | ETAwise</title><body><h1>Message sent.</h1>",
      });
    });

    await page.goto("/#early-access");
    // Native constraint validation is the baseline here: the markup ships
    // without novalidate, so the browser enforces the rules on its own.
    await expect(page.locator("#contact-form")).not.toHaveAttribute(
      "novalidate",
      "",
    );
    await fillValidForm(page);
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Message sent.",
    );
    expect(posted).not.toBeNull();
    expect(posted.method).toBe("POST");
    expect(posted.body).toContain("name=Casey+Quinn");
    expect(posted.body).toContain("consent=yes");
  });
});
