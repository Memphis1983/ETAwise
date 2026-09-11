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

// All preview records and AI outputs are authored examples, never live inference.
const examples = {
  attention: {
    id: "ND-1042",
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
    id: "ND-1043",
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
    id: "ND-1044",
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
      "This preview website has no registration form, analytics scripts, advertising trackers, or non-essential cookies. No signup information is collected. Interactive examples run in your browser and use fictional data.",
      "Your browser requests the website files from its hosting server. The hosting provider may process connection information such as your IP address and request time according to its configuration and policies.",
      "Do not submit support records or personal information through this preview. A full privacy notice, operator identity, contact details, and retention terms must be published before registration or product data collection begins.",
    ],
  ],
  terms: [
    "Website terms",
    [
      "Netdin is an in-development software project. This website is an informational product preview, not a live support service. It does not offer troubleshooting, engineer dispatch, subscriptions, or guaranteed resolution times.",
      "Screens, case details, and AI outputs are illustrative. Planned capabilities may change. No native helpdesk integrations or live AI processing are provided by this website.",
      "Use of the future product will be subject to separate service terms. Operator identity and business contact details will be published before commercial services or registration are offered.",
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
