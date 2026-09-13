// The browser rules in src/main.js are a courtesy. These are the rules that
// actually decide, so they are tested directly against the Function's own
// module rather than through the page.
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LIMITS, validateSubmission } = require("../api/src/lib/validate.js");
const { readMailConfig, buildMessage, singleLine } = require("../api/src/lib/send-mail.js");

const NOW = 1_700_000_000_000;
const valid = {
  name: "Casey Quinn",
  email: "casey.quinn@example.com",
  message: "Our tier 2 handoffs stall for days.",
  consent: "yes",
  ts: String(NOW - 9000),
};

function check(overrides) {
  return validateSubmission({ ...valid, ...overrides }, { now: NOW });
}

test.describe.configure({ mode: "parallel" });

test("a complete submission passes and comes back trimmed", () => {
  const result = check({ name: "  Casey Quinn  ", message: "  Ten plus chars  " });
  expect(result.ok).toBe(true);
  expect(result.value.name).toBe("Casey Quinn");
  expect(result.value.message).toBe("Ten plus chars");
});

test("required fields are required, whitespace does not count", () => {
  const result = validateSubmission(
    { name: "   ", email: "", message: "\t\t", consent: "" },
    { now: NOW },
  );
  expect(Object.keys(result.errors).sort()).toEqual([
    "consent",
    "email",
    "message",
    "name",
  ]);
  expect(result.ok).toBe(false);
});

test("length bounds are enforced on both edges", () => {
  expect(check({ name: "C" }).errors.name).toMatch(/at least 2/);
  expect(check({ name: "C".repeat(LIMITS.nameMax + 1) }).errors.name).toMatch(
    /80 characters or fewer/,
  );
  expect(check({ message: "too short" }).errors.message).toMatch(/at least 10/);
  expect(
    check({ message: "m".repeat(LIMITS.messageMax + 1) }).errors.message,
  ).toMatch(/2000 characters or fewer/);
  expect(check({ name: "Ca" }).ok).toBe(true);
  expect(check({ message: "m".repeat(LIMITS.messageMin) }).ok).toBe(true);
});

test("email shape is checked, and cannot carry a header injection", () => {
  for (const email of [
    "casey",
    "casey@",
    "@example.com",
    "casey@example",
    "casey quinn@example.com",
    "casey@example..com",
    "casey@example.com>\nBcc: someone@example.net",
  ]) {
    expect(check({ email }).errors.email, email).toBeTruthy();
  }
  for (const email of [
    "casey.quinn@example.com",
    "casey+tag@sub.example.co.uk",
    "c@e.io",
  ]) {
    expect(check({ email }).ok, email).toBe(true);
  }
});

test("consent has to be affirmative, not merely present", () => {
  for (const consent of ["yes", "on", "true", "1", true]) {
    expect(check({ consent }).ok, String(consent)).toBe(true);
  }
  for (const consent of ["", "no", "false", "0", false, undefined, null]) {
    expect(check({ consent }).errors.consent, String(consent)).toBeTruthy();
  }
});

test("a name cannot smuggle a newline into the outgoing headers", () => {
  expect(check({ name: "Casey\r\nBcc: someone@example.net" }).errors.name).toMatch(
    /line breaks/,
  );
});

test("the honeypot and the timing guard reject without naming themselves", () => {
  const honeypot = check({ website: "https://example.com" });
  expect(honeypot.ok).toBe(false);
  expect(honeypot.errors).toEqual({});
  expect(honeypot.spam).toContain("honeypot");

  expect(check({ ts: String(NOW - 500) }).spam).toContain("too-fast");
  expect(check({ ts: String(NOW - 3000) }).ok).toBe(true);
  expect(check({ ts: "not-a-number" }).spam).toContain("timestamp-unparseable");
});

test("a missing timestamp is allowed so the no-JavaScript POST still works", () => {
  expect(check({ ts: "" }).ok).toBe(true);
  expect(validateSubmission({ ...valid, ts: undefined }, { now: NOW }).ok).toBe(
    true,
  );
});

test("a browser clock running ahead fails open rather than locking someone out", () => {
  const result = check({ ts: String(NOW + 60_000) });
  expect(result.ok).toBe(true);
  expect(result.spam).toEqual([]);
});

test("non-string input cannot slip past the type checks", () => {
  const result = validateSubmission(
    { name: { toString: () => "Casey" }, email: ["a@b.co"], message: 12345, consent: {} },
    { now: NOW },
  );
  expect(Object.keys(result.errors).sort()).toEqual([
    "consent",
    "email",
    "message",
    "name",
  ]);
});

test("the mail transport reports missing configuration instead of guessing", () => {
  expect(readMailConfig({}).configured).toBe(false);
  expect(readMailConfig({}).missing).toEqual([
    "CONTACT_EMAIL_API_KEY",
    "CONTACT_EMAIL_FROM",
    "CONTACT_EMAIL_TO",
  ]);
  expect(
    readMailConfig({
      CONTACT_EMAIL_API_KEY: "x",
      CONTACT_EMAIL_FROM: "  ",
      CONTACT_EMAIL_TO: "to@example.com",
    }).missing,
  ).toEqual(["CONTACT_EMAIL_FROM"]);

  const configured = readMailConfig({
    CONTACT_EMAIL_API_KEY: "x",
    CONTACT_EMAIL_FROM: "from@example.com",
    CONTACT_EMAIL_TO: "to@example.com",
  });
  expect(configured.configured).toBe(true);
  expect(configured.provider).toBe("resend");
});

test("submitted text is escaped before it reaches the outgoing email", () => {
  const mail = buildMessage({
    name: "Casey <script>alert(1)</script>",
    email: "casey@example.com",
    message: "<img src=x onerror=alert(1)> & \"quoted\"",
  });
  expect(mail.html).not.toContain("<script>");
  expect(mail.html).not.toContain("<img");
  expect(mail.html).toContain("&lt;script&gt;");
  expect(mail.html).toContain("&amp;");
  expect(mail.replyTo).toBe("casey@example.com");
  // The subject is a header-shaped field, so it is flattened to one line.
  expect(mail.subject).not.toMatch(/[\r\n]/);
  expect(singleLine("a\nb\r\nc", 80)).toBe("a b c");
});
