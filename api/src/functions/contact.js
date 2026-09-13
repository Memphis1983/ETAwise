"use strict";

const { createHash } = require("node:crypto");
const { app } = require("@azure/functions");

const { LIMITS, validateSubmission } = require("../lib/validate");
const { readMailConfig, sendContactMessage } = require("../lib/send-mail");

const CONTACT_EMAIL = "contactus@etawise.tech";

// This endpoint is anonymous by design: a contact form that required a login
// would not be a contact form. That makes it a potential spam relay, so it is
// defended in layers -- honeypot, submission timing, per-IP rate limit, body
// size cap -- none of which is authentication.
const RATE_LIMIT = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // successful or not, per client address
  maxTrackedClients: 5000,
};

// In-memory sliding window.
//
// KNOWN WEAKNESS, stated plainly: this Map lives in one worker process. It is
// emptied by a cold start, a scale-out puts each instance behind its own
// counter, and an attacker rotating source addresses is not slowed by it at
// all. It raises the cost of casual abuse and nothing more. A hard limit needs
// durable shared state -- Azure Table Storage, Redis, or a front door rate
// limit rule -- which is a deliberate follow-up, not an oversight.
const submissionLog = new Map();

// Only a truncated hash of the address is held, so the process memory never
// contains the address itself.
function clientKey(request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0].trim();
  // Azure Static Web Apps writes "address:port". IPv6 arrives bracketed.
  const address =
    first.replace(/^\[(.+)\]:\d+$/, "$1").replace(/:\d+$/, "") ||
    request.headers.get("x-azure-clientip") ||
    "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 32);
}

function checkRateLimit(key, now) {
  const cutoff = now - RATE_LIMIT.windowMs;
  const recent = (submissionLog.get(key) ?? []).filter(
    (stamp) => stamp > cutoff,
  );

  if (recent.length >= RATE_LIMIT.max) {
    submissionLog.set(key, recent);
    const retryAfterMs = recent[0] + RATE_LIMIT.windowMs - now;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  recent.push(now);
  submissionLog.set(key, recent);

  // Bounded so a flood of distinct addresses cannot grow the map without limit.
  if (submissionLog.size > RATE_LIMIT.maxTrackedClients) {
    for (const [existing, stamps] of submissionLog) {
      if (stamps[stamps.length - 1] <= cutoff) submissionLog.delete(existing);
      if (submissionLog.size <= RATE_LIMIT.maxTrackedClients) break;
    }
  }
  return { allowed: true, retryAfter: 0 };
}

function parseBody(raw, contentType) {
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return { ok: false };
      return { ok: true, fields: parsed };
    } catch {
      return { ok: false };
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { ok: true, fields: Object.fromEntries(new URLSearchParams(raw)) };
  }
  return { ok: false, unsupported: true };
}

// The native form POST arrives as urlencoded and asks for HTML; the fetch in
// src/main.js announces JSON both ways. Answer in whichever the caller can use.
function prefersHtml(request, contentType) {
  const accept = (request.headers.get("accept") ?? "").toLowerCase();
  if (accept.includes("application/json")) return false;
  if (contentType.includes("application/x-www-form-urlencoded")) return true;
  return accept.includes("text/html");
}

function htmlPage(title, heading, paragraphs) {
  // Deliberately unstyled and self-contained. The site's stylesheet is a
  // content-hashed build artefact this handler cannot name, and the site's
  // Content-Security-Policy forbids an inline <style> block, so the honest
  // answer for the no-JavaScript path is plain semantic HTML.
  const body = paragraphs
    .map((text) => `    <p>${escapeHtmlText(text)}</p>`)
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escapeHtmlText(title)} | ETAwise</title>
  </head>
  <body>
    <h1>${escapeHtmlText(heading)}</h1>
${body}
    <p><a href="/#early-access">Back to the ETAwise website</a></p>
  </body>
</html>
`;
}

function escapeHtmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reply({ status, html, json, headers = {} }) {
  const base = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  };
  if (html) {
    return {
      status,
      headers: { ...base, "Content-Type": "text/html; charset=utf-8" },
      body: html,
    };
  }
  return {
    status,
    headers: { ...base, "Content-Type": "application/json; charset=utf-8" },
    jsonBody: json,
  };
}

async function contact(request, context) {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const wantsHtml = prefersHtml(request, contentType);
  const now = Date.now();

  // Nothing below logs a name, an address, a message, or a credential. Outcome,
  // status, and a short reason code only.
  const done = (status, reason) =>
    context.log(`contact: status=${status} reason=${reason}`);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > LIMITS.maxBodyBytes) {
    done(413, "content_length_over_cap");
    return reply({
      status: 413,
      html: wantsHtml
        ? htmlPage("Message too large", "That message is too large.", [
            `The contact form accepts up to ${LIMITS.maxBodyBytes} bytes. Shorten the message and try again, or email ${CONTACT_EMAIL} directly.`,
          ])
        : null,
      json: { ok: false, error: "Request body is larger than this form accepts." },
    });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > LIMITS.maxBodyBytes) {
    done(413, "body_over_cap");
    return reply({
      status: 413,
      html: wantsHtml
        ? htmlPage("Message too large", "That message is too large.", [
            `The contact form accepts up to ${LIMITS.maxBodyBytes} bytes. Shorten the message and try again, or email ${CONTACT_EMAIL} directly.`,
          ])
        : null,
      json: { ok: false, error: "Request body is larger than this form accepts." },
    });
  }

  const parsed = parseBody(raw, contentType);
  if (!parsed.ok) {
    const status = parsed.unsupported ? 415 : 400;
    done(
      status,
      parsed.unsupported ? "unsupported_media_type" : "unparseable_body",
    );
    return reply({
      status,
      html: wantsHtml
        ? htmlPage("Message not sent", "That message could not be read.", [
            `The form submission could not be read. Please try again from the website, or email ${CONTACT_EMAIL} directly.`,
          ])
        : null,
      json: {
        ok: false,
        error: parsed.unsupported
          ? "This endpoint accepts application/json or application/x-www-form-urlencoded."
          : "Request body could not be read.",
      },
    });
  }

  const limit = checkRateLimit(clientKey(request), now);
  if (!limit.allowed) {
    done(429, "rate_limited");
    return reply({
      status: 429,
      headers: { "Retry-After": String(limit.retryAfter) },
      html: wantsHtml
        ? htmlPage("Too many messages", "Too many messages, too quickly.", [
            `This connection has sent ${RATE_LIMIT.max} messages in the last ${RATE_LIMIT.windowMs / 60000} minutes, which is the limit. Please wait a few minutes and try again.`,
            `If it is urgent, email ${CONTACT_EMAIL} directly.`,
          ])
        : null,
      json: {
        ok: false,
        error: `This connection has reached the limit of ${RATE_LIMIT.max} messages per ${RATE_LIMIT.windowMs / 60000} minutes.`,
        retryAfter: limit.retryAfter,
      },
    });
  }

  const result = validateSubmission(parsed.fields, { now });

  if (result.spam.length) {
    // 400 with no explanation of which check tripped. Telling a script which
    // signal caught it is free tuning advice.
    done(400, `rejected:${result.spam.join("+")}`);
    return reply({
      status: 400,
      html: wantsHtml
        ? htmlPage("Message not sent", "That submission was not accepted.", [
            `The form could not accept that submission. If you are a person and not a script, please email ${CONTACT_EMAIL} directly and we will reply.`,
          ])
        : null,
      json: {
        ok: false,
        error: "That submission could not be accepted.",
      },
    });
  }

  if (Object.keys(result.errors).length) {
    done(400, `invalid:${Object.keys(result.errors).join("+")}`);
    return reply({
      status: 400,
      html: wantsHtml
        ? htmlPage("Message not sent", "Some details need fixing.", [
            ...Object.values(result.errors),
            "Go back to the form, correct those details, and send it again.",
          ])
        : null,
      json: { ok: false, errors: result.errors },
    });
  }

  const config = readMailConfig();
  if (!config.configured) {
    // Fails honestly. Reporting success here would silently drop a real
    // person's message. The names of the missing settings are configuration,
    // not secrets, so they are safe to log; no value ever is.
    context.warn(
      `contact: mail transport not configured, missing ${config.missing.join(", ")}`,
    );
    done(503, "not_configured");
    return reply({
      status: 503,
      headers: { "Retry-After": "3600" },
      html: wantsHtml
        ? htmlPage(
            "Contact endpoint not configured",
            "This contact endpoint is not configured yet.",
            [
              "Your message was not sent and has not been stored. The mail transport for this form has not been set up yet.",
              `Please email ${CONTACT_EMAIL} directly and we will reply.`,
            ],
          )
        : null,
      json: {
        ok: false,
        error: `The contact endpoint is not configured yet, so nothing was sent. Please email ${CONTACT_EMAIL} directly.`,
      },
    });
  }

  const sent = await sendContactMessage(result.value, { config });
  if (!sent.sent) {
    context.error(`contact: send failed reason=${sent.reason}`);
    done(502, sent.reason);
    return reply({
      status: 502,
      html: wantsHtml
        ? htmlPage("Message not sent", "The message could not be delivered.", [
            "Something went wrong on our side and your message was not delivered.",
            `Please email ${CONTACT_EMAIL} directly and we will reply.`,
          ])
        : null,
      json: {
        ok: false,
        error: `Your message could not be delivered. Please email ${CONTACT_EMAIL} directly.`,
      },
    });
  }

  done(200, "sent");
  return reply({
    status: 200,
    html: wantsHtml
      ? htmlPage("Message sent", "Message sent.", [
          "Thank you. Your message is with the ETAwise team and we will reply by email to the address you gave us.",
          "This was a message, not a signup. You have not been added to any early-access list and no account has been created.",
        ])
      : null,
    json: {
      ok: true,
      message:
        "Message sent. We will reply by email to the address you gave us.",
    },
  });
}

app.http("contact", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "contact",
  handler: contact,
});

module.exports = { contact, checkRateLimit, clientKey, RATE_LIMIT };
