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

The early-access section has a contact form that posts to `/api/contact`, an Azure Static Web Apps managed function in `api/` (Azure Functions Node.js v4 programming model, Node 20).

It works with or without JavaScript. The markup carries `required`, `minlength`, `maxlength` and a real `action`/`method`, so with scripting off the browser validates and posts natively and the Function answers with a plain HTML confirmation page. With scripting on, `src/main.js` switches native validation off, takes over the messages so they can be announced properly, and submits JSON via `fetch`.

The endpoint is anonymous, which is correct for a contact form and also means it could be abused as a spam relay. It is defended in layers, none of which is authentication: an off-screen honeypot field, a three-second minimum fill time, a per-IP sliding-window rate limit of 5 submissions per 10 minutes, and a 16 KB body cap. Every rule the browser enforces is enforced again in `api/src/lib/validate.js`, which is the authoritative copy.

The rate limit is in-memory. It resets on a cold start, each scaled-out instance keeps its own counter, and rotating source addresses defeats it. It raises the cost of casual abuse; it is not a guarantee. A hard limit needs durable shared state.

### Required application settings

Three settings are required. They are **names only** — no value belongs in this repository, in a committed config file, or in a log line.

| Name | Purpose |
| --- | --- |
| `CONTACT_EMAIL_API_KEY` | Credential for the outbound mail provider. Resend by default. |
| `CONTACT_EMAIL_FROM` | Verified sender address the relay sends as. |
| `CONTACT_EMAIL_TO` | Mailbox that receives contact form messages. |

One optional setting: `CONTACT_EMAIL_PROVIDER`, which defaults to `resend`. `api/src/lib/send-mail.js` has a commented stub showing where Azure Communication Services Email would go for anyone who wants the whole path to stay inside Azure.

Set them in the Azure portal under the Static Web App > Settings > Configuration > Application settings (or `az staticwebapp appsettings set`). They reach the managed function as ordinary environment variables. `api/local.settings.json` is git-ignored for local `func start` runs.

**Until all three are set the endpoint returns 503** with a message telling the sender to email `contactus@etawise.tech` directly. That is deliberate: it fails honestly rather than reporting success and dropping the message. `Reply-To` on the relayed email is set to the submitter's address, so replying to it answers the sender.

## Deployment

The generated `dist/` directory is deployed to Azure Static Web Apps via GitHub CI/CD. The canonical origin is `https://www.etawise.tech/`; `index.html`, `public/sitemap.xml`, and `public/robots.txt` all reference that host. `staticwebapp.config.json` at the repository root carries the navigation fallback, the security headers, and the POST-only restriction on `/api/contact`.

The deploy workflow lives in a fork of this repository. **It needs `api_location: "api"` set in the `Azure/static-web-apps-deploy` step or the Function is never deployed at all** — the site will build and publish, `/api/contact` will 404, and the form will report that it could not reach the endpoint. `app_location` and `output_location` stay as they are.

## Before public launch

- Domain confirmed: `www.etawise.tech` serves the site from Azure Static Web Apps. Brand clearance still outstanding.
- Fix apex DNS. `etawise.tech` does not resolve to Azure — its A record still points at a Namecheap parking address, so the apex times out. Point it at Azure Static Web Apps and redirect the apex to `www`.
- Contact address `contactus@etawise.tech` is published in the early-access section. Legal operator identity is still outstanding.
- Set `CONTACT_EMAIL_API_KEY`, `CONTACT_EMAIL_FROM`, and `CONTACT_EMAIL_TO` in the Static Web App application settings, and add `api_location: "api"` to the deploy workflow. Until both are done the contact form cannot deliver anything.
- Document a retention period for contact form messages. The form collects a name, an email address, and a message; nothing decides yet how long we keep them.
- Registration is still not open. The contact form is a contact form: it creates no account and reserves no place, and the copy has to keep saying so.
- Replace provisional website notices with reviewed notices reflecting actual business practices. The notices now name Azure Static Web Apps as the host, describe what the contact form submits, and disclose that emailing the published address means we hold that message.
- Review all planned product claims. The preview contains authored fictional cases, not working AI, integrations, or customer records.
- No analytics or tracking cookies are installed.

Apart from the contact form, the website uses no user-submitted data. Source previews, navigation, FAQ accordions, and legal dialogs run locally in the browser.
