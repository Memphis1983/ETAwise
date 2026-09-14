import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The form refuses anything submitted within 3 seconds of the modal opening.
// That used to be measured from page load; behind a button it never could be,
// because opening the modal and typing a message always takes longer than that,
// so the guard would have been unreachable. Tests that expect a submit to go out
// have to sit out the window rather than mock around it, because the guard is one
// of the things being tested.
const MIN_ELAPSED_MS = 3000;

// Every request pattern below is Formspree's endpoint, which is the form's
// action attribute. Nothing else is called.
const FORMSPREE = "https://formspree.io/f/*";

// The committed action carries the real form ID. Submit tests still repoint it
// at a throwaway endpoint so that a missed mock can never post to the live form,
// and the guard test below puts a placeholder back to prove that refusal still
// works for anyone who copies this file without an ID.
const CONNECTED_ENDPOINT = "https://formspree.io/f/testtest";

const TRIGGER = "Open the contact form";

// `html { scroll-behavior: smooth }` means navigating to a fragment leaves the
// document scrolling for a while afterwards. Every element's viewport position is
// still moving during that time, so Playwright rightly refuses to click one --
// "element is not stable". Waiting for scrollY to hold still for two consecutive
// frames is the honest fix; forcing the click would only hide it.
// Stability check that does not need JavaScript in the page. boundingBox() is
// driven from the test process over CDP, so it still works when scripting is
// off. Polls until the box holds still twice in a row, which covers the async
// web-font swap: when DM Sans and Instrument Serif arrive, text reflows and
// everything below it shifts. That is load-dependent, which is exactly why it
// only bit under parallel runs, and document.fonts.ready is unavailable with
// scripting disabled.
async function settleBox(locator, timeout = 10000) {
  const deadline = Date.now() + timeout;
  let previous = null;
  while (Date.now() < deadline) {
    const box = await locator.boundingBox();
    const key = box && `${box.x},${box.y},${box.width},${box.height}`;
    if (key && key === previous) return;
    previous = key;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("element never stopped moving");
}

async function settle(page) {
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        let last = window.scrollY;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(window.scrollY === last));
        });
      }),
    undefined,
    { timeout: 10000 },
  );
}

// The form is behind a modal now, so every test that touches a field has to open
// it first. Returns the moment the modal opened, which is what the 3-second floor
// is measured from.
async function openForm(page) {
  await page.goto("/#early-access");
  await settle(page);
  const trigger = page.getByRole("button", { name: TRIGGER });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const openedAt = Date.now();
  await expect(page.locator("#contact-dialog")).toBeVisible();
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

// There is no backdrop element to click, so a backdrop click is a click on the
// dialog element at a point outside its own box. Aims at whichever margin around
// the dialog is roomiest, because the dialog is nearly full-height on a phone and
// nearly full-width is possible at 320px.
async function clickBackdrop(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  const margins = [
    { space: box.x, x: box.x / 2, y: box.y + box.height / 2 },
    {
      space: viewport.width - (box.x + box.width),
      x: (box.x + box.width + viewport.width) / 2,
      y: box.y + box.height / 2,
    },
    { space: box.y, x: box.x + box.width / 2, y: box.y / 2 },
    {
      space: viewport.height - (box.y + box.height),
      x: box.x + box.width / 2,
      y: (box.y + box.height + viewport.height) / 2,
    },
  ].sort((a, b) => b.space - a.space);
  expect(margins[0].space, "no backdrop was reachable").toBeGreaterThan(4);
  await page.mouse.click(margins[0].x, margins[0].y);
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

// ---------------------------------------------------------------------------
// The modal itself.
// ---------------------------------------------------------------------------
test("the section offers a button, not a form, and the form is not in the flow", async ({
  page,
}) => {
  await page.goto("/#early-access");
  await settle(page);

  // The honesty copy the section has to keep carrying, whether or not the modal
  // is ever opened.
  await expect(page.getByText("Registration is not open yet.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Send us a message.", level: 3 }),
  ).toBeVisible();
  await expect(page.locator(".contact-lede")).toContainText(
    "This is a contact form, not a signup",
  );
  // The mail-client route stays on the page rather than being buried in the modal.
  await expect(
    page.locator(".contact-launch").getByRole("link", {
      name: "contactus@etawise.tech",
    }),
  ).toBeVisible();

  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.locator("#contact-form")).toBeHidden();
  // src/main.js has taken the `open` attribute off, so from here on `open` can
  // only mean showModal(). The CSS depends on that.
  await expect(page.locator("#contact-dialog")).not.toHaveAttribute("open", "");
  const trigger = page.getByRole("button", { name: TRIGGER });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
});

test("the button opens the modal and focus lands inside it", async ({ page }) => {
  await openForm(page);

  const dialog = page.locator("#contact-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-labelledby", "contact-dialog-title");
  // Named by a heading that is actually on screen, not by hidden text.
  await expect(page.locator("#contact-dialog-title")).toBeVisible();
  await expect(page.locator("#contact-dialog-title")).toHaveText(
    "Send us a message.",
  );

  const focusedInside = await page.evaluate(() =>
    document.querySelector("#contact-dialog").contains(document.activeElement),
  );
  expect(focusedInside).toBe(true);
  await expect(page.locator("#contact-dialog-title")).toBeFocused();
});

test("Escape closes the modal and hands focus back to the trigger", async ({
  page,
}) => {
  await openForm(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: TRIGGER })).toBeFocused();
});

test("the close button closes the modal and hands focus back to the trigger", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("button", { name: "Close contact form" }).click();
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: TRIGGER })).toBeFocused();
});

test("a click on the backdrop closes the modal, a click inside does not", async ({
  page,
}) => {
  await openForm(page);

  // Inside first: a click on the dialog's own padding must not close it, which is
  // the whole reason the handler measures the box instead of trusting the target.
  await page.locator("#contact-dialog-title").click();
  await expect(page.locator("#contact-dialog")).toBeVisible();

  await clickBackdrop(page, "#contact-dialog");
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.getByRole("button", { name: TRIGGER })).toBeFocused();
});

test("the modal can be reopened after being closed", async ({ page }) => {
  await openForm(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await page.getByRole("button", { name: TRIGGER }).click();
  await expect(page.locator("#contact-dialog")).toBeVisible();
  await expect(page.locator("#contact-form")).toBeVisible();
});

test("the legal notices still work on their own dialog", async ({ page }) => {
  await page.goto("/");

  // Both dialogs are in the document now. The notice one has to still be the one
  // the footer buttons reach.
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.locator("#notice-dialog")).toBeVisible();
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.locator("#notice-dialog")).toContainText(
    "There is no registration or signup form",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("#notice-dialog")).toBeHidden();

  await page.getByRole("button", { name: "Terms", exact: true }).click();
  await expect(page.locator("#notice-dialog")).toContainText(
    "not a live support service",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("#notice-dialog")).toBeHidden();

  // And the contact modal is independent of it: opening one leaves the other shut.
  await page.goto("/#early-access");
  await settle(page);
  await page.getByRole("button", { name: TRIGGER }).click();
  await expect(page.locator("#contact-dialog")).toBeVisible();
  await expect(page.locator("#notice-dialog")).toBeHidden();
  // Never two at once. showModal() makes the rest of the document inert, so the
  // footer buttons cannot even be reached from here.
  const openDialogs = await page.evaluate(
    () => document.querySelectorAll("dialog[open]").length,
  );
  expect(openDialogs).toBe(1);
});

// ---------------------------------------------------------------------------
// Validation, unchanged behaviour reached through the modal.
// ---------------------------------------------------------------------------
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
  // Errors do not knock the visitor out of the modal.
  await expect(page.locator("#contact-dialog")).toBeVisible();
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

test("a valid submit posts a form body to Formspree and confirms in the section", async ({
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

  // The confirmation lands in the section, not in the modal, so pressing Escape
  // on a finished modal cannot take the outcome away with it.
  const confirmation = page.locator(".contact-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText("Message sent.");
  await expect(confirmation).toContainText("not a signup");
  await expect(page.locator("#contact-dialog")).toBeHidden();
  await expect(page.locator("#contact-form")).toHaveCount(0);
  // The trigger has done its job and no longer has one.
  await expect(page.getByRole("button", { name: TRIGGER })).toHaveCount(0);
  await expect(page.locator("#contact-status")).toHaveAttribute(
    "data-state",
    "success",
  );
  // Focus follows the outcome rather than falling back to the document.
  await expect(confirmation).toBeFocused();
  // And it survives a reload of the viewport, i.e. it is really in the page.
  await expect(confirmation).toBeInViewport();

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

  // The committed action has a real ID, so put a placeholder back: the guard has
  // to keep working for anyone who copies this form without one.
  await page
    .locator("#contact-form")
    .evaluate((form) =>
      form.setAttribute("action", "https://formspree.io/f/YOUR_FORMSPREE_ID"),
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
  // Refusals keep the modal up, with the message still in it.
  await expect(page.locator("#contact-dialog")).toBeVisible();
  await expect(page.locator("#contact-form")).toBeVisible();
  await expect(page.locator("#contact-message")).toHaveValue(/tier 2 handoffs/);
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
  await expect(page.locator("#contact-dialog")).toBeVisible();
  await expect(page.locator("#contact-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
});

test("a missing endpoint, a service error, and a dead network read differently", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  await mockEndpoint(page, 404, { errors: [{ message: "Not found" }] });
  await fillValidForm(page);
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-status")).toContainText(
    "not connected correctly",
  );
  await expect(page.locator("#contact-status")).toContainText(
    "contactus@etawise.tech",
  );

  await page.unroute(FORMSPREE);
  await mockEndpoint(page, 500, { errors: [{ message: "Server error" }] });
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
  await expect(page.locator(".contact-confirmation")).toHaveCount(0);
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
  await expect(page.locator("#contact-dialog")).toBeVisible();
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

test("an autofilled honeypot is cleared instead of losing the message", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  let requests = 0;
  let sentGotcha = null;
  await page.route(FORMSPREE, (route) => {
    requests += 1;
    const body = route.request().postData() ?? "";
    // Multipart, so read the part back rather than parsing form encoding.
    const match = body.match(/name="_gotcha"\r?\n\r?\n([^\r\n]*)/);
    sentGotcha = match ? match[1] : "";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"ok":true}',
    });
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
  // The dialog scrolls itself, which makes it a scroll container on both axes.
  // A field parked 9999px to the left must not turn that into a sideways scroll.
  const dialogScroll = await page
    .locator("#contact-dialog")
    .evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
  expect(dialogScroll.scrollWidth).toBeLessThanOrEqual(
    dialogScroll.clientWidth,
  );

  await fillValidForm(page);
  // What a password manager does: fills the off-screen input it cannot tell is a
  // trap. This used to be rejected as spam, which lost a real person's message.
  await honeypot.evaluate((input) => {
    input.value = "https://example.com";
  });
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();

  // The submission goes through, and the honeypot leaves empty so Formspree's
  // own filtering cannot discard it server-side either.
  await expect(page.locator(".contact-confirmation")).toBeVisible();
  expect(requests).toBe(1);
  expect(sentGotcha).toBe("");
  await expect(page.locator("#contact-status")).not.toContainText(
    "could not be accepted",
  );
});

test("a submit inside three seconds of the modal opening is held back", async ({
  page,
}) => {
  const openedAt = await openForm(page);
  await connectForm(page);
  let requests = 0;
  await page.route(FORMSPREE, (route) => {
    requests += 1;
    return route.fulfill({ status: 200, body: "{}" });
  });

  // Filled in a single evaluate rather than four awaited interactions: this test
  // has to submit inside the 3s window it is asserting on, and typing field by
  // field under parallel load was slow enough to leave the window before the
  // click landed. Events are dispatched so the form sees real input.
  await page.evaluate(() => {
    const set = (id, value) => {
      const field = document.getElementById(id);
      if (field.type === "checkbox") field.checked = value;
      else field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set("contact-name", "Casey Quinn");
    set("contact-email", "casey.quinn@example.com");
    set("contact-message", "Asking how you track update commitments after a handoff.");
    set("contact-consent", true);
    document.querySelector("#contact-form button[type=submit]").click();
  });

  await expect(page.locator("#contact-status")).toContainText(
    "submitted very quickly",
  );
  expect(requests).toBe(0);
  // Nothing is lost: the message is still there and one more click sends it, once
  // the window it was refused inside has passed.
  await expect(page.locator("#contact-message")).toHaveValue(
    /update commitments/,
  );
  await waitOutTimingGuard(page, openedAt);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".contact-confirmation")).toBeVisible();
  expect(requests).toBe(1);
});

// ---------------------------------------------------------------------------
// Layout.
// ---------------------------------------------------------------------------
test("nothing overflows sideways at any width, modal shut or open", async ({
  page,
}) => {
  for (const width of [320, 390, 540, 700, 800, 920, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#early-access");
    await settle(page);

    const shut = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(shut.document, `overflow with the modal shut at ${width}px`).toBeLessThanOrEqual(
      shut.viewport,
    );

    await page.getByRole("button", { name: TRIGGER }).click();
    await expect(page.locator("#contact-form")).toBeVisible();

    const open = await page.evaluate(() => {
      const dialog = document.querySelector("#contact-dialog");
      return {
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        dialogScroll: dialog.scrollWidth,
        dialogClient: dialog.clientWidth,
        dialogRight: Math.round(dialog.getBoundingClientRect().right),
      };
    });
    expect(open.document, `overflow with the modal open at ${width}px`).toBeLessThanOrEqual(
      open.viewport,
    );
    expect(open.dialogScroll, `dialog scrolls sideways at ${width}px`).toBeLessThanOrEqual(
      open.dialogClient,
    );
    expect(open.dialogRight, `dialog past the viewport at ${width}px`).toBeLessThanOrEqual(
      open.viewport,
    );

    // A 16px minimum keeps iOS Safari from zooming the viewport on focus.
    for (const selector of [
      "#contact-name",
      "#contact-email",
      "#contact-message",
    ]) {
      const size = await page
        .locator(selector)
        .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
      expect(size, `${selector} at ${width}px`).toBeGreaterThanOrEqual(16);
    }
    await page.keyboard.press("Escape");
  }
});

test("the modal scrolls itself rather than locking the page", async ({ page }) => {
  await openForm(page);
  // Locking the document would mean overflow:hidden on the root, which takes the
  // desktop scrollbar away and shifts the whole page sideways by its width.
  const root = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflow,
    body: getComputedStyle(document.body).overflow,
    dialogY: getComputedStyle(document.querySelector("#contact-dialog")).overflowY,
  }));
  expect(root.html).not.toBe("hidden");
  expect(root.body).not.toBe("hidden");
  expect(root.dialogY).toBe("auto");
  // And it never grows past the viewport, so the submit button is always reachable.
  const fits = await page.evaluate(() => {
    const box = document.querySelector("#contact-dialog").getBoundingClientRect();
    return box.top >= 0 && box.bottom <= window.innerHeight + 1;
  });
  expect(fits).toBe(true);
});

// ---------------------------------------------------------------------------
// axe-core. The two Playwright projects run every test at 1440x1000 and at
// 390x844, so one test per state covers both viewports.
// ---------------------------------------------------------------------------
test("axe finds nothing on the page as it loads", async ({ page }) => {
  await page.goto("/#early-access");
  await settle(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("axe finds nothing with the modal open", async ({ page }) => {
  await openForm(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("axe finds nothing with the modal open and errors showing", async ({
  page,
}) => {
  await openForm(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("#contact-name-error")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

// ---------------------------------------------------------------------------
// The baseline the modal is layered on top of.
// ---------------------------------------------------------------------------
test.describe("without JavaScript", () => {
  // reducedMotion because the site's own `prefers-reduced-motion` block sets
  // `html { scroll-behavior: auto }`. Without it the checkbox sits a long way
  // down, so Playwright has to scroll it into view, smooth scrolling makes that a
  // glide, and every retry restarts the glide -- the element is never stable and
  // the click is refused until the test times out. Geometry is otherwise
  // provably still; this is the scroll, not the hero animation.
  test.use({ javaScriptEnabled: false, reducedMotion: "reduce" });

  test("the form is in the page, in the flow, and posts natively to Formspree", async ({
    page,
  }) => {
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

    // No fragment scrolling to wait out: settle() runs waitForFunction, which
    // needs the JavaScript this test switches off. Playwright scrolls elements in
    // itself, through CDP, instantly. networkidle so the font files are in before
    // anything is clicked; the swap reflows the page and moves the form.
    await page.goto("/#early-access", { waitUntil: "networkidle" });
    await settleBox(page.locator("#contact-consent"));

    // The dialog still carries the `open` it shipped with, because nothing ran to
    // take it off, and `open` is what keeps the form rendered.
    await expect(page.locator("#contact-dialog")).toHaveAttribute("open", "");
    await expect(page.locator("#contact-form")).toBeVisible();
    // In the flow, not floating: the UA stylesheet's `position: absolute` has to
    // be overridden or the form lands on top of whatever follows it.
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector("#contact-dialog");
      const footer = document.querySelector(".footer");
      return {
        position: getComputedStyle(dialog).position,
        dialogBottom: dialog.getBoundingClientRect().bottom + window.scrollY,
        footerTop: footer.getBoundingClientRect().top + window.scrollY,
      };
    });
    expect(layout.position).toBe("static");
    expect(layout.dialogBottom).toBeLessThanOrEqual(layout.footerTop);

    // No dead controls. The trigger only calls showModal(), and the close button
    // has nothing to close, so neither is on screen.
    await expect(page.getByRole("button", { name: TRIGGER })).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Close contact form" }),
    ).toBeHidden();
    // The mail-client alternative is not hidden with them.
    await expect(
      page.locator(".contact-launch").getByRole("link", {
        name: "contactus@etawise.tech",
      }),
    ).toBeVisible();
    // No sideways overflow from a dialog sitting in a grid it was not sized for.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

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
    // is the URL exactly as committed.
    expect(posted.url).toBe("https://formspree.io/f/maeygdzk");
    expect(posted.method).toBe("POST");
    expect(posted.body).toContain("name=Casey+Quinn");
    expect(posted.body).toContain("consent=yes");
    expect(posted.body).toContain("_subject=New+enquiry+from+the+ETAwise+website");
  });
});
