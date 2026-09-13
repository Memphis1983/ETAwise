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
```

Regenerate the social preview image after changing the headline or brand marks:

```sh
npm run og:image
```

## Deployment

The generated `dist/` directory is deployed to Azure Static Web Apps via GitHub CI/CD. The canonical origin is `https://www.etawise.tech/`; `index.html`, `public/sitemap.xml`, and `public/robots.txt` all reference that host.

## Before public launch

- Domain confirmed: `www.etawise.tech` serves the site from Azure Static Web Apps. Brand clearance still outstanding.
- Fix apex DNS. `etawise.tech` does not resolve to Azure — its A record still points at a Namecheap parking address, so the apex times out. Point it at Azure Static Web Apps and redirect the apex to `www`.
- Contact address `contactus@etawise.tech` is published in the early-access section. Legal operator identity is still outstanding.
- Connect an actual early-access endpoint with validation, consent, spam protection, and documented retention before collecting data. The page still says registration is not open, offers only a `mailto:` contact link, and collects no signup data.
- Replace provisional website notices with reviewed notices reflecting actual business practices. The notices now name Azure Static Web Apps as the host and disclose that emailing the published address means we hold that message.
- Review all planned product claims. The preview contains authored fictional cases, not working AI, integrations, or customer records.
- No analytics or tracking cookies are installed.

The website uses no user-submitted data. Source previews, navigation, FAQ accordions, and legal dialogs run locally in the browser.
