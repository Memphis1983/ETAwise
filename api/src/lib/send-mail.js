"use strict";

// Provider-agnostic outbound mail for the contact form.
//
// Every credential is read from the environment at call time and never from a
// file in this repository. Nothing in here logs a value: the caller gets an
// outcome and a short reason code, and that is all it is allowed to know.
//
// In Azure Static Web Apps these are set under Configuration > Application
// settings for the Static Web App, which surfaces them to the managed Function
// as ordinary environment variables.

const REQUIRED_ENV = [
  "CONTACT_EMAIL_API_KEY",
  "CONTACT_EMAIL_FROM",
  "CONTACT_EMAIL_TO",
];

const PROVIDER_TIMEOUT_MS = 10000;

function readMailConfig(env = process.env) {
  const missing = REQUIRED_ENV.filter(
    (key) => String(env[key] ?? "").trim() === "",
  );
  if (missing.length) return { configured: false, missing };

  return {
    configured: true,
    missing: [],
    // Optional. Defaults to Resend because it is the quickest to wire up; see
    // sendAzureCommunicationServices below for staying inside Azure instead.
    provider: String(env.CONTACT_EMAIL_PROVIDER ?? "resend")
      .trim()
      .toLowerCase(),
    apiKey: String(env.CONTACT_EMAIL_API_KEY).trim(),
    from: String(env.CONTACT_EMAIL_FROM).trim(),
    to: String(env.CONTACT_EMAIL_TO).trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Submitted text is untrusted. It is escaped before it reaches the HTML part so
// a message cannot inject markup into our own inbox, and collapsed to a single
// line where it lands in a header-like position such as the subject.
function singleLine(value, maxLength) {
  const flattened = String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return flattened.length > maxLength
    ? `${flattened.slice(0, maxLength - 1)}\u2026`
    : flattened;
}

function buildMessage(submission) {
  const subject = `ETAwise contact form: ${singleLine(submission.name, 80)}`;
  const text = [
    "New message from the ETAwise website contact form.",
    "",
    `Name: ${singleLine(submission.name, 200)}`,
    `Email: ${singleLine(submission.email, 254)}`,
    "",
    "Message:",
    String(submission.message),
    "",
    "-- ",
    "Sent by the contact form on www.etawise.tech. Reply to this email to answer the sender.",
  ].join("\n");
  const html = [
    "<p>New message from the ETAwise website contact form.</p>",
    `<p><strong>Name:</strong> ${escapeHtml(singleLine(submission.name, 200))}<br>`,
    `<strong>Email:</strong> ${escapeHtml(singleLine(submission.email, 254))}</p>`,
    `<p style="white-space:pre-wrap">${escapeHtml(submission.message)}</p>`,
    "<hr>",
    "<p>Sent by the contact form on www.etawise.tech. Reply to this email to answer the sender.</p>",
  ].join("\n");
  return { subject, text, html, replyTo: singleLine(submission.email, 254) };
}

async function sendViaResend(config, mail, fetchImpl) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      // Read from the environment on every call. Never stored, never logged.
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      reply_to: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Provider error bodies can quote the submitted address back at us, so the
    // body is discarded rather than returned or logged. The status is enough to
    // tell a misconfiguration from an outage.
    return { sent: false, reason: `resend_http_${response.status}` };
  }
  return { sent: true, reason: "resend_accepted" };
}

// Azure Communication Services Email would slot in here for anyone who wants
// the whole path to stay inside Azure. It is deliberately left unimplemented
// rather than half-written:
//
//   1. Provision an Email Communication Service and a verified sender domain.
//   2. Add @azure-rest/communication-email to api/package.json.
//   3. Set CONTACT_EMAIL_PROVIDER=azure and put the connection string in
//      CONTACT_EMAIL_API_KEY, or switch to a managed identity and drop the key
//      from the app settings entirely.
//   4. Return the same { sent, reason } shape as sendViaResend.
//
// async function sendViaAzureCommunicationServices(config, mail) { ... }

async function sendContactMessage(submission, options = {}) {
  const config = options.config ?? readMailConfig(options.env);
  if (!config.configured) {
    return { sent: false, reason: "not_configured", missing: config.missing };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { sent: false, reason: "no_fetch_available" };
  }

  const mail = buildMessage(submission);
  try {
    if (config.provider === "resend")
      return await sendViaResend(config, mail, fetchImpl);
    return { sent: false, reason: "unknown_provider" };
  } catch (error) {
    // Only the error name is kept. Messages from fetch can include the request
    // body or URL, and neither belongs in a log line.
    return { sent: false, reason: `transport_${error?.name ?? "Error"}` };
  }
}

module.exports = {
  REQUIRED_ENV,
  readMailConfig,
  escapeHtml,
  singleLine,
  buildMessage,
  sendContactMessage,
};
