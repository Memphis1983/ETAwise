# ETAwise website

Responsive, static product-introduction website. Vite builds plain HTML, CSS, and JavaScript; no framework or server runtime required. Fonts are bundled and served locally, with no third-party font requests.

## Local development

```sh
npm install
npm run dev
```

## Verification

```sh
npx playwright install chromium
npm test
npm run build
npm run csp:check   # needs a build first
```

`npm run csp:check` serves `dist/` with the exact headers from `staticwebapp.config.json` and drives the page under them. The Playwright suite runs against the Vite dev server, which does not send those headers, so the Content-Security-Policy is verified separately rather than assumed.

Regenerate the social preview image after changing the headline or brand marks:

```sh
npm run og:image
```

## Contact form

The early-access section has a contact form that posts to [Formspree](https://formspree.io/), which forwards each submission by email. There is no backend of ours, no server code to deploy, and no secret to set.

**The only configuration is the form ID.** Replace `YOUR_FORMSPREE_ID` in the `action` attribute of `#contact-form` in `index.html` with the ID from the Formspree dashboard (Forms > your form > the endpoint URL, which looks like `https://formspree.io/f/abcdwxyz`). That attribute is the single place the endpoint is defined; `src/main.js` reads it back off the form. The ID is public by design — it is downloaded with the page — so it belongs in the repository. Until it is replaced, the form refuses to submit and tells the sender to email `contactus@etawise.tech` instead, rather than posting into a void or reporting a success that never happened.

It works with or without JavaScript. The markup carries `required`, `minlength`, `maxlength` and a real `action`/`method`, so with scripting off the browser validates and posts natively to Formspree. With scripting on, `src/main.js` switches native validation off, takes over the messages so they can be announced properly, and submits a `FormData` body via `fetch` with `Accept: application/json`, which keeps the visitor on the page.

Client-side there is an off-screen `_gotcha` honeypot field and a three-second minimum fill time, plus the length and shape checks. Those are the only checks we control now. Formspree applies its own validation and spam filtering on top; that layer is theirs, is not configurable from this repository, and passing the browser checks does not mean a submission was accepted. Every failure path, including Formspree's spam rejection, says nothing was sent and offers `contactus@etawise.tech`.

## Deployment

The generated `dist/` directory is deployed to Azure Static Web Apps via GitHub CI/CD. The canonical origin is `https://www.etawise.tech/`; `index.html`, `public/sitemap.xml`, and `public/robots.txt` all reference that host. `staticwebapp.config.json` at the repository root carries the navigation fallback and the security headers, including the Content-Security-Policy that allows `https://formspree.io` for `connect-src` and `form-action` and nothing else off-origin.

The deploy workflow lives in a fork of this repository. It publishes the static output only; there is no function app to deploy alongside it.

## Before public launch

- Domain confirmed: `www.etawise.tech` serves the site from Azure Static Web Apps. Brand clearance still outstanding.
- Fix apex DNS. `etawise.tech` does not resolve to Azure — its A record still points at a Namecheap parking address, so the apex times out. Point it at Azure Static Web Apps and redirect the apex to `www`.
- Contact address `contactus@etawise.tech` is published in the early-access section. Legal operator identity is still outstanding.
- Create the Formspree form and replace `YOUR_FORMSPREE_ID` in `index.html`. Until that is done the contact form delivers nothing and says so.
- Document a retention period for contact form messages. The form collects a name, an email address, and a message; nothing decides yet how long we keep them.
- Registration is still not open. The contact form is a contact form: it creates no account and reserves no place, and the copy has to keep saying so.
- Replace provisional website notices with reviewed notices reflecting actual business practices. The notices now name Azure Static Web Apps as the host, name Formspree as the third-party service the contact form submits to, describe what the form submits, and disclose that emailing the published address means we hold that message.
- Review all planned product claims. The preview contains authored fictional cases, not working AI, integrations, or customer records.
- No analytics or tracking cookies are installed.

Apart from the contact form, the website uses no user-submitted data. Source previews, navigation, FAQ accordions, and legal dialogs run locally in the browser.
