# ETAwise website

Responsive, static product-introduction website for ETAwise. Vite builds plain HTML, CSS, and JavaScript; there is no framework and no server runtime. Fonts are bundled and served locally, so the page makes no third-party requests.

## Requirements

Node 18 or newer. Everything else installs with the project.

## Local development

```sh
npm install
npm run dev
```

## Verification

```sh
npx playwright install chromium   # once
npm test
npm run build
npm run csp:check                 # needs a build first
```

`npm test` runs the Playwright suite across a desktop and a mobile project, including `axe-core` accessibility checks.

`npm run csp:check` serves `dist/` with the exact headers from `staticwebapp.config.json` and drives the page under them. The Playwright suite runs against the Vite dev server, which does not send those headers, so the Content-Security-Policy is verified separately rather than assumed.

Regenerate the social preview image after changing the headline or the brand marks:

```sh
npm run og:image
```

It starts its own dev server, screenshots `scripts/og-image.html` at exactly 1200x630, and writes `public/og-image.png`. It fails loudly rather than shipping a broken card: it verifies the fonts were genuinely rasterised, checks nothing overflows the canvas, and asserts the expected text is present.

## Contact form

The early-access section has a contact form that posts to [Formspree](https://formspree.io/), which forwards each submission by email. There is no backend, no server code to deploy, and no secret to configure.

The endpoint is set on the `action` attribute of `#contact-form` in `index.html`. That attribute is the single place it is defined; `src/main.js` reads it back off the form. The form ID is public by design, since it travels in the page every visitor downloads, so it belongs in the repository. To repoint the form, change that one attribute.

It works with or without JavaScript. The markup carries `required`, `minlength`, `maxlength` and a real `action` and `method`, so with scripting off the browser validates and posts natively. With scripting on, `src/main.js` turns native validation off and takes over, so errors can be tied to their fields with `aria-describedby` and announced through a live region, and submits a `FormData` body via `fetch` so the visitor stays on the page.

Client-side there is an off-screen `_gotcha` honeypot, a three-second minimum fill time, and length and shape checks. These are the only checks under our control. Formspree applies its own validation and spam filtering on top; that layer is theirs, is not configurable from here, and passing the browser checks does not mean a submission was accepted. Every failure path says nothing was sent and offers the published contact address.

## Fonts and layout stability

`vite.config.js` contains a small plugin that injects `<link rel="preload">` tags for the two font faces used above the fold. Vite content-hashes emitted filenames, so the hrefs are read out of the bundle at build time rather than hardcoded. Without this the fonts are only discovered after the stylesheet parses, and the resulting swap causes a measurable layout shift on a first visit.

If you change which faces the hero uses, update `PRELOAD_FONTS` in `vite.config.js`. The plugin fails the build if a declared face is missing, rather than silently emitting a preload that would 404.

## Deployment

The generated `dist/` directory is deployed to Azure Static Web Apps. `staticwebapp.config.json` at the repository root carries the navigation fallback, the security headers including the Content-Security-Policy, and the cache rules: content-hashed assets under `/assets/` are immutable for a year, while `index.html` stays on a short max-age so deployments are picked up promptly.

## Notes

Apart from the contact form, the site uses no user-submitted data. The interactive preview, navigation, FAQ accordions, and information dialogs all run locally in the browser. The preview contains authored example cases, not live AI, integrations, or real records. No analytics or tracking cookies are installed.
