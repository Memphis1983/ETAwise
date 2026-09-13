import "@fontsource-variable/dm-sans";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "@fontsource/instrument-serif/latin-400.css";

const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
menuButton.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(expanded));
  navigation.classList.toggle("open", expanded);
});
navigation.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuButton.setAttribute("aria-expanded", "false");
  navigation.classList.remove("open");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigation.classList.contains("open")) {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("open");
    menuButton.focus();
  }
});

// Marks the navigation link for the section currently in view.
const navLinks = [...navigation.querySelectorAll('a[href^="#"]')];
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);
if (navSections.length && "IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;
      for (const link of navLinks) {
        if (link.getAttribute("href") === `#${visible.target.id}`)
          link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  navSections.forEach((section) => sectionObserver.observe(section));
}

// All preview records and AI outputs are authored examples, never live inference.
const examples = {
  attention: {
    id: "EW-1042",
    status: "Awaiting specialist",
    title: "A busy thread. A stalled case.",
    description:
      "Three follow-ups are recorded. The receiving team has not confirmed a next action or update deadline.",
    owner: "Unconfirmed",
    deadline: "Not committed",
    insight:
      "Follow-up activity is not the same as specialist progress. Confirm an owner and request a dated update commitment.",
    source:
      'Frontline agent, Friday 09:15: "Following up again on the replacement review. Please confirm who will take ownership and when we can expect the next update." No receiving-team reply is included in this fictional record.',
  },
  review: {
    id: "EW-1043",
    status: "Review accepted",
    title: "An owner. A clear next step.",
    description:
      "The specialist has accepted the investigation and committed to an update. Resolution timing remains unknown.",
    owner: "Access team",
    deadline: "Tuesday, 14:00 UTC",
    insight:
      "An update commitment is recorded, not a fix deadline. Confirm the extracted details before adding a tracking reminder.",
    source:
      'Access team, Monday 11:30: "We have accepted the case and will review the access logs. We will send an update by Tuesday at 14:00 UTC. We cannot confirm a resolution time yet."',
  },
  scheduled: {
    id: "EW-1044",
    status: "Visit scheduled",
    title: "On-site visit confirmed",
    description:
      "The service team has confirmed an appointment window. The visit is scheduled; the underlying issue is not yet resolved.",
    owner: "Field service",
    deadline: "Wednesday, 09:00 UTC",
    insight:
      "A confirmed appointment is a scheduling milestone, not proof of resolution. Keep the case open until the visit outcome is recorded.",
    source:
      'Field service, Tuesday 15:00: "The on-site visit is confirmed for Wednesday, 09:00-11:00 UTC. We will provide a service outcome after the appointment."',
  },
};
let selectedCase = "attention";
document.querySelectorAll("[data-case]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedCase = button.dataset.case;
    const example = examples[selectedCase];
    document.querySelectorAll("[data-case]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    for (const key of [
      "id",
      "status",
      "title",
      "description",
      "owner",
      "deadline",
      "insight",
    ]) {
      document.getElementById(`case-${key}`).textContent = example[key];
    }
  });
});

const dialog = document.querySelector("dialog");
function showNotice(title, paragraphs) {
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-content").replaceChildren(
    ...paragraphs.map((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      return paragraph;
    }),
  );
  dialog.showModal();
}
document.querySelector(".source-button").addEventListener("click", () => {
  showNotice("Fictional source message", [
    examples[selectedCase].source,
    "This is an illustrative product concept. No real customer data is shown and no AI request is made.",
  ]);
});
const notices = {
  privacy: [
    "Website privacy",
    [
      "This preview website has no analytics scripts, advertising trackers, or non-essential cookies. There is no registration or signup form and no account can be created. Interactive examples run in your browser and use fictional data.",
      "The early-access section has a contact form. Submitting it sends the name, email address, and message you type to a Function hosted with this website on Azure Static Web Apps, which relays them by email to ETAwise so we can reply. We keep that message, and whatever you choose to put in it, in order to reply. To limit automated abuse, the Function also holds a short-lived count of recent submissions per network connection in memory, keyed by a one-way hash of the connection address.",
      "The page also publishes the contact address contactus@etawise.tech. That link opens your own email program; nothing is sent or stored by this website when you use it. If you do email us, we receive and keep that message in order to reply.",
      "Your browser requests the website files from Azure Static Web Apps, a Microsoft hosting service. Microsoft may process connection information such as your IP address and request time according to its configuration and policies.",
      "Do not send support records, customer details, or other personal information to us through this preview. A full privacy notice, operator identity, and retention terms must be published before registration or product data collection begins.",
    ],
  ],
  terms: [
    "Website terms",
    [
      "ETAwise is an in-development software project. This website is an informational product preview, not a live support service. It does not offer troubleshooting, engineer dispatch, subscriptions, or guaranteed resolution times.",
      "Screens, case details, and AI outputs are illustrative. Planned capabilities may change. No native helpdesk integrations or live AI processing are provided by this website.",
      "Use of the future product will be subject to separate service terms. A contact address is published above; full legal operator identity will be published before commercial services or registration are offered.",
    ],
  ],
};
document.querySelectorAll("[data-notice]").forEach((button) => {
  button.addEventListener("click", () =>
    showNotice(...notices[button.dataset.notice]),
  );
});
document
  .querySelector(".dialog-close")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    dialog.close();
});
document.getElementById("year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Contact form.
//
// Progressive enhancement, in this order:
//   1. The markup carries `required`, `minlength`, `maxlength` and `type` and
//      no `novalidate`, so a browser with JavaScript switched off still gets
//      constraint validation and a native POST to /api/contact.
//   2. This module turns native validation off and takes over, because the
//      native bubbles cannot be tied to the field with aria-describedby, are
//      not announced on our terms, and vanish on the next keystroke.
//
// Nothing here is a security control. Every rule below is enforced again in
// api/src/functions/contact.js, which is the only side that counts.
// ---------------------------------------------------------------------------
const contactForm = document.querySelector("#contact-form");
if (contactForm) initContactForm(contactForm);

function initContactForm(form) {
  const CONTACT_EMAIL = "contactus@etawise.tech";
  // Mirrors api/src/lib/validate.js. Duplicated on purpose: the browser copy is
  // a courtesy, the Function copy is the rule. Change both together.
  const NAME_MIN = 2;
  const NAME_MAX = 80;
  const MESSAGE_MIN = 10;
  const MESSAGE_MAX = 2000;
  const MIN_ELAPSED_MS = 3000;
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

  const loadedAt = Date.now();
  const summary = document.getElementById("contact-summary");
  const status = document.getElementById("contact-status");
  const statusMark = status.querySelector(".contact-status-mark");
  const statusText = status.querySelector(".contact-status-text");
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton.querySelector(".button-label");
  const idleLabel = submitLabel.textContent;
  const honeypot = form.querySelector('[name="website"]');
  const timestamp = form.querySelector('[name="ts"]');
  let submitting = false;

  form.noValidate = true;
  timestamp.value = String(loadedAt);

  const fields = [
    {
      name: "name",
      hint: null,
      check(value) {
        if (!value) return "Enter your name so we know who we are replying to.";
        if (value.length < NAME_MIN)
          return `Your name needs at least ${NAME_MIN} characters.`;
        if (value.length > NAME_MAX)
          return `Your name has to be ${NAME_MAX} characters or fewer.`;
        return "";
      },
    },
    {
      name: "email",
      hint: "contact-email-hint",
      check(value) {
        if (!value) return "Enter your email address so we can reply.";
        if (!EMAIL_SHAPE.test(value))
          return "Enter an email address in the form name@example.com.";
        return "";
      },
    },
    {
      name: "message",
      hint: "contact-message-hint",
      check(value) {
        if (!value) return "Enter the message you would like to send us.";
        if (value.length < MESSAGE_MIN)
          return `Your message needs at least ${MESSAGE_MIN} characters.`;
        if (value.length > MESSAGE_MAX)
          return `Your message has to be ${MESSAGE_MAX} characters or fewer. It is currently ${value.length}.`;
        return "";
      },
    },
    {
      name: "consent",
      hint: null,
      check(checked) {
        if (!checked)
          return "Tick the box to confirm we can store your message in order to reply.";
        return "";
      },
    },
  ];

  for (const field of fields) {
    field.input = form.querySelector(`[name="${field.name}"]`);
    field.wrapper = field.input.closest(".field");
    field.error = document.getElementById(`contact-${field.name}-error`);
    field.errorText = field.error.querySelector(".field-error-text");
    field.touched = false;

    const isCheckbox = field.input.type === "checkbox";
    // Validate on blur, but only once the field has been left or a submit has
    // been attempted. Nobody wants an error while they are still typing.
    field.input.addEventListener(isCheckbox ? "change" : "blur", () => {
      field.touched = true;
      validateField(field);
    });
    // While an error is showing, clear it the moment the value becomes valid.
    // Never replace one message with another mid-keystroke.
    field.input.addEventListener("input", () => {
      if (!field.error.hidden && !field.check(readField(field)))
        clearFieldError(field);
    });
  }

  function readField(field) {
    return field.input.type === "checkbox"
      ? field.input.checked
      : field.input.value.trim();
  }

  function setDescribedBy(field, withError) {
    const ids = [];
    if (field.hint) ids.push(field.hint);
    if (withError) ids.push(field.error.id);
    if (ids.length) field.input.setAttribute("aria-describedby", ids.join(" "));
    else field.input.removeAttribute("aria-describedby");
  }

  function showFieldError(field, message) {
    field.errorText.textContent = message;
    field.error.hidden = false;
    field.wrapper.classList.add("field-invalid");
    field.input.setAttribute("aria-invalid", "true");
    setDescribedBy(field, true);
  }

  function clearFieldError(field) {
    field.error.hidden = true;
    field.errorText.textContent = "";
    field.wrapper.classList.remove("field-invalid");
    field.input.removeAttribute("aria-invalid");
    setDescribedBy(field, false);
  }

  function validateField(field) {
    const message = field.check(readField(field));
    if (message) showFieldError(field, message);
    else clearFieldError(field);
    return !message;
  }

  function setStatus(state, message) {
    if (!state) {
      status.removeAttribute("data-state");
      statusMark.textContent = "";
      statusText.textContent = "";
      return;
    }
    status.setAttribute("data-state", state);
    // The glyph is decoration for sighted users; the message carries the
    // meaning, so the mark stays out of the announcement.
    statusMark.textContent =
      state === "error" ? "\u26A0" : state === "success" ? "\u2713" : "";
    statusText.textContent = message;
  }

  function setSubmitting(state) {
    submitting = state;
    submitButton.disabled = state;
    submitLabel.textContent = state ? "Sending\u2026" : idleLabel;
    if (state) form.setAttribute("aria-busy", "true");
    else form.removeAttribute("aria-busy");
  }

  function reportInvalid(invalid) {
    summary.textContent =
      invalid.length === 1
        ? "1 field needs attention. It is marked below."
        : `${invalid.length} fields need attention. They are marked below.`;
    setStatus(null, "");
    invalid[0].input.focus();
  }

  function showConfirmation() {
    const panel = document.createElement("div");
    panel.className = "contact-confirmation";
    panel.tabIndex = -1;
    const heading = document.createElement("h4");
    heading.textContent = "Message sent.";
    const lead = document.createElement("p");
    lead.textContent =
      "Thank you. Your message is with the ETAwise team and we will reply by email to the address you gave us.";
    const note = document.createElement("p");
    note.textContent =
      "This was a message, not a signup. You have not been added to any early-access list and no account has been created.";
    panel.append(heading, lead, note);
    form.replaceWith(panel);
    // Focus was on the submit button, which has just been removed, so move it
    // somewhere deliberate instead of letting it fall back to the document.
    panel.focus();
  }

  async function readErrors(response) {
    try {
      const body = await response.json();
      if (body && typeof body.errors === "object" && body.errors)
        return body.errors;
    } catch {
      // A 400 without a JSON body is still a 400. Fall through to the generic
      // message rather than throwing away the status we already have.
    }
    return null;
  }

  async function handleRejection(response) {
    if (response.status === 400) {
      const errors = await readErrors(response);
      const invalid = [];
      if (errors) {
        for (const field of fields) {
          const message = errors[field.name];
          if (typeof message === "string" && message) {
            showFieldError(field, message);
            invalid.push(field);
          }
        }
      }
      if (invalid.length) {
        reportInvalid(invalid);
        setStatus(
          "error",
          "Your message was not sent. Check the fields marked above and send again.",
        );
        return;
      }
      setStatus(
        "error",
        `Your message could not be accepted. Check the form and try again, or email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status === 413) {
      setStatus(
        "error",
        `That message is too large to send. Shorten it, or email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      const wait =
        Number.isFinite(seconds) && seconds > 0
          ? `Try again in about ${Math.max(1, Math.ceil(seconds / 60))} ${Math.ceil(seconds / 60) > 1 ? "minutes" : "minute"}.`
          : "Try again in a few minutes.";
      setStatus(
        "error",
        `Too many messages have been sent from this connection. ${wait} You can also email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status === 503) {
      setStatus(
        "error",
        `The contact endpoint is not configured yet, so nothing was sent. Please email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status >= 500) {
      setStatus(
        "error",
        `Something went wrong on our side and your message was not sent. Please email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    setStatus(
      "error",
      `Your message was not sent (error ${response.status}). Please email ${CONTACT_EMAIL} directly.`,
    );
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    for (const field of fields) field.touched = true;
    const invalid = fields.filter((field) => !validateField(field));
    if (invalid.length) {
      reportInvalid(invalid);
      return;
    }
    summary.textContent = "";

    // Both checks are repeated in the Function. Doing them here just saves a
    // round trip and gives a human a message they can act on.
    if (honeypot.value.trim() !== "") {
      setStatus(
        "error",
        `This submission could not be accepted. If you are a person and not a script, please email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (Date.now() - loadedAt < MIN_ELAPSED_MS) {
      setStatus(
        "error",
        "That was submitted very quickly. Take a moment to check your message, then send it again.",
      );
      return;
    }

    setSubmitting(true);
    setStatus("pending", "Sending your message\u2026");
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: readField(fields[0]),
          email: readField(fields[1]),
          message: readField(fields[2]),
          consent: readField(fields[3]),
          website: honeypot.value,
          ts: timestamp.value,
        }),
      });
      if (response.ok) {
        setStatus("success", "Message sent. Thank you for getting in touch.");
        showConfirmation();
        return;
      }
      await handleRejection(response);
    } catch {
      setStatus(
        "error",
        `We could not reach the server, so nothing was sent. Check your connection and try again, or email ${CONTACT_EMAIL} directly.`,
      );
    } finally {
      setSubmitting(false);
    }
  });
}
