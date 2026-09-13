import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The form refuses anything submitted within 3 seconds of load. Tests that
// expect a submit to go out have to sit out that window rather than mock around
// it, because the guard is one of the things being tested.
const MIN_ELAPSED_MS = 3000;

// Every request pattern below is Formspree's endpoint, which is the form's
// action attribute. Nothing else is called.
const FORMSPREE = "https://formspree.io/f/*";

// index.html ships with the YOUR_FORMSPREE_ID placeholder still in the action,
// and main.js refuses to submit while it is there. That refusal has its own test
// below; every other submit test replaces the action with an ID-shaped endpoint
// first, which is what the site will look like once a real ID is pasted in.
const CONNECTED_ENDPOINT = "https://formspree.io/f/testtest";

async function openForm(page) {
  const openedAt = Date.now();
  await page.goto("/#early-access");
  await expect(page.locator("#contact-form")).toBeVisible();
  return openedAt;
}

async function connectForm(page) {
  await page
    .locator("#contact-form")
    .evaluate(
      (form, endpoint) => form.setAttribute("action", endpoint),
      CONNECTED_ENDPOINT,
    );
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
  return page.route(FORMSPREE, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
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
  await connectForm(page);
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
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

test("a valid submit posts a form body to Formspree and confirms on the page", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  const posted = [];
  await page.route(FORMSPREE, (route) => {
    const request = route.request();
    posted.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      body: request.postData(),
    });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, next: "/thanks" }),
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

  expect(posted).toHaveLength(1);
  expect(posted[0].url).toBe(CONNECTED_ENDPOINT);
  expect(posted[0].method).toBe("POST");
  // Asking for JSON is what keeps the visitor here instead of being redirected
  // to Formspree's own thank-you page.
  expect(posted[0].headers.accept).toBe("application/json");
  expect(posted[0].headers["content-type"]).toContain("multipart/form-data");
  // A FormData body, so the fields arrive as multipart parts rather than JSON.
  expect(posted[0].body).toContain('name="name"');
  expect(posted[0].body).toContain("Casey Quinn");
  expect(posted[0].body).toContain('name="email"');
  expect(posted[0].body).toContain("casey.quinn@example.com");
  expect(posted[0].body).toContain('name="consent"');
  expect(posted[0].body).toContain('name="_subject"');
  expect(posted[0].body).toContain("New enquiry from the ETAwise website");
  expect(posted[0].body).toContain('name="_gotcha"');
});

test("an unreplaced form ID refuses to send instead of claiming success", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: '{"ok":true}' });
  });

  // Deliberately not connected: the action is whatever index.html ships with.
  await expect(page.locator("#contact-form")).toHaveAttribute(
    "action",
    "https://formspree.io/f/YOUR_FORMSPREE_ID",
  );

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  const status = page.locator("#contact-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("not connected yet");
  await expect(status).toContainText("nothing was sent");
  await expect(status).toContainText("contactus@etawise.tech");
  await expect(page.locator(".contact-confirmation")).toHaveCount(0);
  await expect(page.locator("#contact-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  expect(requests).toBe(0);
});

test("a rate-limited submit explains the wait and offers the email address", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  await mockEndpoint(page, 429, {
    errors: [{ message: "Too many requests" }],
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  const status = page.locator("#contact-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("Too many messages");
  // No wait time is quoted: Formspree owns the limit and does not tell us one.
  await expect(status).toContainText("Try again in a few minutes");
  await expect(status).toContainText("contactus@etawise.tech");
  // The form is still there to retry with, and re-enabled.
  await expect(page.locator("#contact-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("a service error and a dead network read differently", async ({ page }) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  await mockEndpoint(page, 500, { errors: [{ message: "Server error" }] });
  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-status")).toContainText(
    "The form service returned an error",
  );
  await expect(page.locator("#contact-status")).toContainText(
    "contactus@etawise.tech",
  );

  await page.unroute(FORMSPREE);
  await page.route(FORMSPREE, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-status")).toContainText(
    "could not reach the form service",
  );
  await expect(page.locator("#contact-status")).toContainText(
    "contactus@etawise.tech",
  );
});

test("field-level errors returned by Formspree are shown on the fields", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  // Formspree reports a rejection as an `errors` array, each entry naming the
  // field it belongs to when there is one.
  await mockEndpoint(page, 422, {
    errors: [
      { field: "message", message: "Message is too short.", code: "REQUIRED" },
    ],
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.locator("#contact-message-error")).toContainText(
    "Message is too short.",
  );
  await expect(page.locator("#contact-message")).toBeFocused();
  await expect(page.locator("#contact-status")).toContainText(
    "Check the fields marked above",
  );
});

test("a spam rejection with no field to point at is reported, not dressed up", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  await mockEndpoint(page, 403, {
    errors: [{ message: "Form submission rejected as spam" }],
  });

  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  const status = page.locator("#contact-status");
  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("was not accepted");
  await expect(status).toContainText("nothing was sent");
  await expect(status).toContainText("contactus@etawise.tech");
  await expect(page.locator(".contact-confirmation")).toHaveCount(0);
});

test("the honeypot is unreachable and its own failure is handled", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: "{}" });
  });

  const honeypot = page.locator("#contact-gotcha");
  // Named _gotcha so Formspree discards a filled one too. Off-screen rather
  // than display:none, so it is out of reach for a person and for assistive
  // technology while a script still finds and fills it. That is the point:
  // toBeHidden() would fail here and should.
  await expect(honeypot).toHaveAttribute("name", "_gotcha");
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
  await honeypot.evaluate((input) => {
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
  await connectForm(page);
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
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

  test("the form still posts natively to Formspree", async ({ page }) => {
    let posted = null;
    await page.route(FORMSPREE, (route) => {
      const request = route.request();
      posted = {
        url: request.url(),
        method: request.method(),
        body: request.postData(),
      };
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
    // The action attribute is the endpoint with no JavaScript involved, so this
    // is the URL as committed, placeholder ID and all.
    expect(posted.url).toBe("https://formspree.io/f/YOUR_FORMSPREE_ID");
    expect(posted.method).toBe("POST");
    expect(posted.body).toContain("name=Casey+Quinn");
    expect(posted.body).toContain("consent=yes");
    expect(posted.body).toContain("_subject=New+enquiry+from+the+ETAwise+website");
  });
});
