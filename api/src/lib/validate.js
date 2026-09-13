"use strict";

// Server-side validation for the contact form. This is the authoritative copy:
// src/main.js runs equivalent rules in the browser purely so a person gets a
// useful message before the round trip. Nothing the browser sends is trusted.

const LIMITS = {
  nameMin: 2,
  nameMax: 80,
  emailMax: 254, // RFC 5321 maximum path length
  messageMin: 10,
  messageMax: 2000,
  minElapsedMs: 3000,
  maxBodyBytes: 16 * 1024,
};

// Shape only. A regular expression cannot tell whether an address exists, so
// this rejects the obviously malformed and leaves the rest to the bounce. The
// excluded punctuation also keeps the address safe to place in a Reply-To.
const EMAIL_SHAPE =
  /^[^\s@,;:<>"'\\]+@[^\s@.,;:<>"'\\]+(?:\.[^\s@.,;:<>"'\\]+)+$/;

// C0 and C7 control characters. Newlines are legitimate inside a message body
// but never inside a name or an address, where they are a header-injection
// attempt.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const CONSENT_TRUTHY = new Set(["true", "on", "yes", "1", "checked"]);

function asText(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function hasConsent(value) {
  if (value === true) return true;
  return CONSENT_TRUTHY.has(asText(value).trim().toLowerCase());
}

// Strips control characters other than newline and tab, so a message can be
// dropped into an email body without carrying terminal escapes with it.
function stripControlChars(value) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

// Returns milliseconds since the form was rendered, or null when that cannot be
// established. Null is not a failure: with JavaScript switched off the hidden
// field is never populated, and the native POST path has to keep working.
function elapsedSince(rawTimestamp, now) {
  const raw = asText(rawTimestamp).trim();
  if (raw === "") return null;
  const started = Number(raw);
  if (!Number.isFinite(started) || started <= 0) return NaN;
  return now - started;
}

function validateSubmission(input, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const name = asText(input && input.name).trim();
  const email = asText(input && input.email).trim();
  const message = stripControlChars(asText(input && input.message)).trim();

  const errors = {};

  if (!name) errors.name = "Enter your name so we know who we are replying to.";
  else if (name.length < LIMITS.nameMin)
    errors.name = `Your name needs at least ${LIMITS.nameMin} characters.`;
  else if (name.length > LIMITS.nameMax)
    errors.name = `Your name has to be ${LIMITS.nameMax} characters or fewer.`;
  else if (CONTROL_CHARS.test(name))
    errors.name = "Remove any line breaks or control characters from your name.";

  if (!email) errors.email = "Enter your email address so we can reply.";
  else if (email.length > LIMITS.emailMax)
    errors.email = `That email address is longer than the ${LIMITS.emailMax} characters an address can be.`;
  else if (CONTROL_CHARS.test(email) || !EMAIL_SHAPE.test(email))
    errors.email = "Enter an email address in the form name@example.com.";

  if (!message) errors.message = "Enter the message you would like to send us.";
  else if (message.length < LIMITS.messageMin)
    errors.message = `Your message needs at least ${LIMITS.messageMin} characters.`;
  else if (message.length > LIMITS.messageMax)
    errors.message = `Your message has to be ${LIMITS.messageMax} characters or fewer.`;

  if (!hasConsent(input && input.consent))
    errors.consent =
      "Tick the box to confirm we can store your message in order to reply.";

  // Spam signals are kept apart from field errors so the response can report
  // the field errors and stay silent about which abuse check tripped.
  const spam = [];
  if (asText(input && input.website).trim() !== "") spam.push("honeypot");

  const elapsed = elapsedSince(input && input.ts, now);
  if (Number.isNaN(elapsed)) spam.push("timestamp-unparseable");
  else if (elapsed !== null && elapsed >= 0 && elapsed < LIMITS.minElapsedMs)
    spam.push("too-fast");
  // A negative elapsed time means the browser clock runs ahead of the server.
  // That is a fail-open: a legitimate person with a badly set clock would
  // otherwise be locked out permanently by a heuristic, and the honeypot and
  // the rate limit still apply to them.

  return {
    ok: Object.keys(errors).length === 0 && spam.length === 0,
    errors,
    spam,
    value: { name, email, message },
  };
}

module.exports = {
  LIMITS,
  EMAIL_SHAPE,
  asText,
  hasConsent,
  stripControlChars,
  elapsedSince,
  validateSubmission,
};
