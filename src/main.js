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

// Two dialogs in the document now: this one for source messages and legal
// notices, and the contact form's. Both are addressed by id, because
// querySelector("dialog") would reach whichever comes first in the markup.
const noticeDialog = document.querySelector("#notice-dialog");
const contactDialog = document.querySelector("#contact-dialog");

// Clicking the backdrop closes a modal. There is no backdrop element to listen
// on, so the click lands on the dialog itself and has to be told apart from a
// click on its contents by comparing against the dialog's own box. Shared by
// both dialogs rather than written twice.
function closeOnBackdropClick(element) {
  element.addEventListener("click", (event) => {
    if (event.target !== element) return;
    const bounds = element.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      element.close();
  });
}

function showNotice(title, paragraphs) {
  // showModal() makes the rest of the document inert, so the footer buttons that
  // land here cannot be reached while the contact form is open and the two can
  // never stack. Closing it anyway costs two lines and does not rely on that
  // staying true.
  if (contactDialog && contactDialog.open) contactDialog.close();
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-content").replaceChildren(
    ...paragraphs.map((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      return paragraph;
    }),
  );
  noticeDialog.showModal();
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
      "The early-access section has a contact form. Submitting it sends the name, email address, and message you type to Formspree, a third-party form service, which forwards them by email to ETAwise so we can reply. Formspree therefore handles your submission on the way to us, under its own terms and privacy policy. We keep that message, and whatever you choose to put in it, in order to reply.",
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
noticeDialog
  .querySelector(".dialog-close")
  .addEventListener("click", () => noticeDialog.close());
closeOnBackdropClick(noticeDialog);
document.getElementById("year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Contact form.
//
// Progressive enhancement, in this order:
//   1. The markup carries `required`, `minlength`, `maxlength` and `type` and
//      no `novalidate`, so a browser with JavaScript switched off still gets
//      constraint validation and a native POST straight to Formspree.
//   2. This module turns native validation off and takes over, because the
//      native bubbles cannot be tied to the field with aria-describedby, are
//      not announced on our terms, and vanish on the next keystroke.
//
// The submission goes to Formspree, whose endpoint is the form's `action`
// attribute in index.html. Nothing here is a security control, and there is no
// longer a server of ours behind the form: the rules below are the only
// validation we control. Formspree runs its own server-side checks and spam
// filtering on top, but that layer is theirs, we cannot see or configure it
// from here, and passing these checks does not mean a submission is accepted.
//
// Step 2 also moves the form into a modal. The markup ships it inside a
// `<dialog open>`, which renders the form in the page, so the no-JavaScript
// baseline above is untouched by that. Everything modal about it happens here.
// ---------------------------------------------------------------------------
const contactForm = document.querySelector("#contact-form");
if (contactForm) initContactForm(contactForm);

function initContactForm(form) {
  const CONTACT_EMAIL = "contactus@etawise.tech";
  // The endpoint ships with this placeholder in it until someone pastes a real
  // Formspree form ID into index.html. While it is still there, submitting
  // would POST to a URL that does not exist, so the guard below stops instead.
  const ENDPOINT_PLACEHOLDER = "YOUR_FORMSPREE_ID";
  // Courtesy checks for the person filling the form in, so they get a message
  // they can act on without a round trip. They are not a guarantee.
  const NAME_MIN = 2;
  const NAME_MAX = 80;
  const MESSAGE_MIN = 10;
  const MESSAGE_MAX = 2000;
  const MIN_ELAPSED_MS = 3000;
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

  const summary = document.getElementById("contact-summary");
  const status = document.getElementById("contact-status");
  const statusMark = status.querySelector(".contact-status-mark");
  const statusText = status.querySelector(".contact-status-text");
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton.querySelector(".button-label");
  const idleLabel = submitLabel.textContent;
  const honeypot = form.querySelector('[name="_gotcha"]');
  const block = document.getElementById("contact-block");
  const launch = block.querySelector(".contact-launch");
  const trigger = document.getElementById("contact-open");
  const heading = document.getElementById("contact-dialog-title");
  let submitting = false;

  form.noValidate = true;

  // -------------------------------------------------------------------------
  // The modal.
  //
  // One synchronous flip, before anything can be clicked: the dialog leaves the
  // flow and the trigger arrives in the same style recalculation, so there is no
  // paint in which the form is neither inline nor openable. Removing `open` also
  // means that from here on an `open` attribute can only have come from
  // showModal(), which is what the CSS keys off to tell the two states apart.
  // -------------------------------------------------------------------------
  contactDialog.removeAttribute("open");
  block.setAttribute("data-contact-enhanced", "true");
  // Only true once this code has run. Announcing a popup on a button that cannot
  // open one would be a lie, so these are set here and not in the markup.
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", contactDialog.id);
  // Focus target on open. Not a form control, so it needs to be programmatically
  // focusable without joining the tab order.
  heading.tabIndex = -1;

  // The 3-second floor is measured from the moment the form becomes reachable,
  // not from page load.
  //
  // Page-load timing made sense when the form was already on the page. Behind a
  // button it cannot: opening the modal, reading it, and typing a message takes
  // longer than three seconds every time, so the guard could never fire and
  // would be protection in name only. Measuring from the open means it still
  // catches a fill-and-send with no reading in between, which is the thing it
  // was for. The cost is a visitor who pastes a prepared message and sends
  // inside three seconds, and that costs them one more click: the message is
  // still in the form and the status line says to send it again.
  let formReadyAt = Date.now();

  function openContact() {
    if (contactDialog.open) return;
    formReadyAt = Date.now();
    contactDialog.showModal();
    // The heading rather than the first field: it names the dialog on arrival,
    // and it does not throw up the on-screen keyboard on a phone before the
    // visitor has seen what they opened. showModal() would otherwise land on the
    // close button, which is the least useful control in here.
    heading.focus();
  }

  function closeContact() {
    if (contactDialog.open) contactDialog.close();
  }

  trigger.addEventListener("click", openContact);
  contactDialog
    .querySelector(".dialog-close")
    .addEventListener("click", closeContact);
  closeOnBackdropClick(contactDialog);
  // Escape and the focus trap are showModal()'s own, not reimplemented here.
  contactDialog.addEventListener("close", () => {
    // A dialog restores focus to whatever had it before showModal() on its own,
    // which is the trigger in every case but one: after a successful send the
    // trigger has been replaced by the confirmation, so that takes the focus
    // instead and the visitor lands on the outcome.
    const target = document.contains(trigger)
      ? trigger
      : block.querySelector(".contact-confirmation");
    if (target) target.focus();
  });

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

  // The confirmation lands in the section, in place of the button that opened the
  // modal, and the modal closes behind it.
  //
  // Leaving it inside the modal was the other option, and it loses the outcome
  // the moment the visitor presses Escape or clicks the backdrop -- which they
  // will, because a modal reading "Message sent." is finished with. They would be
  // left looking at an unchanged section with an "Open the contact form" button
  // on it and no way to tell whether anything was sent. In the section it stays
  // on the page, it replaces the control that no longer has a job, and it is
  // where the visitor's eye already was before the modal opened.
  function showConfirmation() {
    const panel = document.createElement("div");
    panel.className = "contact-confirmation";
    panel.tabIndex = -1;
    const title = document.createElement("h4");
    title.textContent = "Message sent.";
    const lead = document.createElement("p");
    lead.textContent =
      "Thank you. Your message is with the ETAwise team and we will reply by email to the address you gave us.";
    const note = document.createElement("p");
    note.textContent =
      "This was a message, not a signup. You have not been added to any early-access list and no account has been created.";
    panel.append(title, lead, note);
    // The form goes rather than staying filled in a dialog nothing can reopen.
    form.remove();
    launch.replaceWith(panel);
    // Focus follows in the dialog's `close` handler, which finds this panel
    // because the trigger it would otherwise return to has just been detached.
  }

  // Formspree reports a rejection as a JSON `errors` array, each entry carrying
  // a `message` and, for a field-level problem, the `field` it belongs to. Its
  // spam filtering arrives the same way. Anything else, including no JSON body
  // at all, falls through to the generic message: an unreadable rejection is
  // still a rejection, and the status we already have is the honest thing to
  // report.
  async function readErrors(response) {
    try {
      const body = await response.json();
      if (body && Array.isArray(body.errors)) return body.errors;
    } catch {
      // Not JSON. Nothing to map onto the fields.
    }
    return [];
  }

  async function handleRejection(response) {
    if (response.status === 429) {
      // No wait time is quoted. Formspree owns this limit, does not document a
      // Retry-After, and a cross-origin response only exposes that header if the
      // server opts in, so any number here would be invented.
      setStatus(
        "error",
        `Too many messages have been sent from this connection. Try again in a few minutes, or email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status >= 500) {
      setStatus(
        "error",
        `The form service returned an error and your message was not sent. Please try again shortly, or email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status === 404) {
      setStatus(
        "error",
        `The contact form is not connected correctly, so nothing was sent. Please email ${CONTACT_EMAIL} directly.`,
      );
      return;
    }
    if (response.status >= 400) {
      const errors = await readErrors(response);
      const invalid = [];
      for (const field of fields) {
        // The wording on these comes from Formspree, not from us.
        const entry = errors.find(
          (item) =>
            item &&
            item.field === field.name &&
            typeof item.message === "string" &&
            item.message,
        );
        if (entry) {
          showFieldError(field, entry.message);
          invalid.push(field);
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
      // No field to point at. Covers Formspree's spam rejection, which is a
      // deliberate refusal we cannot argue with and must not dress up as
      // success, as well as anything else it declines.
      setStatus(
        "error",
        `Your message was not accepted, so nothing was sent. Please email ${CONTACT_EMAIL} directly.`,
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

    // The honeypot is cleared here rather than rejected on.
    //
    // Rejecting a filled `_gotcha` in this path caught real people: password
    // managers and browser autofill fill off-screen inputs, ignore
    // `autocomplete="off"`, and cannot see that a field is positioned away from
    // the viewport. It also caught nothing, because a script that wanted to
    // bypass this check would post straight to Formspree without running any of
    // this JavaScript.
    //
    // Leaving a filled value in place would be worse still: Formspree would
    // discard the submission server-side and this page would report a success
    // that never happened. Clearing it means an autofilled honeypot cannot lose
    // a real message either way. The field stays in the markup because the
    // no-JavaScript path still posts it, and Formspree's own honeypot handling
    // is what guards that route.
    honeypot.value = "";
    if (Date.now() - formReadyAt < MIN_ELAPSED_MS) {
      setStatus(
        "error",
        "That was submitted very quickly. Take a moment to check your message, then send it again.",
      );
      return;
    }

    // Read back off the form so the endpoint stays defined in exactly one
    // place: the `action` attribute in index.html.
    const endpoint = form.getAttribute("action") || "";
    if (!endpoint || endpoint.includes(ENDPOINT_PLACEHOLDER)) {
      // Refuse rather than pretend. Posting to an endpoint that does not exist
      // would lose the message, and reporting success would lose it silently.
      setStatus(
        "error",
        `This form is not connected yet, so nothing was sent. Please email ${CONTACT_EMAIL} directly and we will reply.`,
      );
      return;
    }

    setSubmitting(true);
    setStatus("pending", "Sending your message\u2026");
    try {
      // FormData, not JSON: Formspree reads an ordinary form encoding, and
      // Accept: application/json keeps the reply as JSON so the visitor stays
      // on this page instead of being redirected to Formspree's own thank-you.
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      if (response.ok) {
        setStatus("success", "Message sent. Thank you for getting in touch.");
        showConfirmation();
        closeContact();
        return;
      }
      await handleRejection(response);
    } catch {
      setStatus(
        "error",
        `We could not reach the form service, so nothing was sent. Check your connection and try again, or email ${CONTACT_EMAIL} directly.`,
      );
    } finally {
      setSubmitting(false);
    }
  });
}
