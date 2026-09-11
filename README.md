# Netdin website

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

Deploy the generated `dist/` directory to a static host. No deployment has been configured or executed.

## Before public launch

- Confirm domain ownership and brand clearance.
- Supply verified business contact details and legal operator identity.
- Connect an actual early-access endpoint with validation, consent, spam protection, and documented retention before collecting data. Current page explicitly says registration is not open and collects no signup data.
- Replace provisional website notices with reviewed notices reflecting the chosen hosting provider and actual business practices.
- Review all planned product claims. The preview contains authored fictional cases, not working AI, integrations, or customer records.
- No analytics or tracking cookies are installed.

The website uses no user-submitted data. Source previews, navigation, FAQ accordions, and legal dialogs run locally in the browser.
