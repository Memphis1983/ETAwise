// Vite configuration. Everything here is additive: the build still has a single
// entry at the root index.html, still writes to dist/ with assets under
// assets/, and scripts/og-image.html is still outside the graph so it never
// ships. The only job of this file is the font preload plugin below.

import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// ---------------------------------------------------------------------------
// Why this plugin exists
//
// The three woff2 faces were discovered only after the stylesheet parsed, so
// the request chain was HTML -> CSS -> font. @fontsource ships
// `font-display: swap`, which means the h1 and the body copy painted in
// Arial/Georgia and then reflowed when the real faces arrived. Measured on the
// built output that single reflow was the whole of CLS: 0.137 at 390x844.
//
// A preload link in the head moves the font request to the same moment as the
// CSS request, so in the common case the face is already in memory by the time
// there is anything to paint and no swap ever happens. It addresses the actual
// dependency chain rather than papering over the size difference between a
// fallback and the real face, and it does not depend on which fallback the
// visitor's OS happens to provide.
//
// It cannot be written by hand in index.html because Vite content-hashes the
// emitted filenames, so the href has to come out of the bundle at build time.
// ---------------------------------------------------------------------------

// Only the faces that draw text inside the first viewport. Preloading a face
// that first paint does not need takes bandwidth away from the two that it
// does, and Lighthouse reports it as an unused preload.
//
// Deliberately excluded:
//   dm-sans-latin-ext-wght-normal.woff2
//     Its unicode-range covers Latin Extended. No character on the page falls
//     in that range, so the browser never requests it.
//   instrument-serif-latin-400-normal.woff2
//     The upright face is used, despite an earlier note to the contrary: it
//     draws the 01 / 02 / 03 numerals in .step-number, which inherit
//     font-style: normal from var(--serif). But #how-it-works is the third
//     section down, far below the fold at every width we support, so that face
//     has nothing to do with first paint and its swap cannot move anything
//     inside the viewport.
//   the .woff siblings
//     Fallbacks for browsers without woff2 support. Every browser that reads a
//     preload of type font/woff2 can also use it.
const PRELOAD_FONTS = [
  {
    // Body copy, the h1, the navigation, and effectively every other run of
    // text in the hero.
    pkg: "@fontsource-variable/dm-sans",
    file: "dm-sans-latin-wght-normal.woff2",
  },
  {
    // The italic accent in the h1 ("follow-ups.") and the `e` in .signal-core,
    // both inside the first viewport.
    pkg: "@fontsource/instrument-serif",
    file: "instrument-serif-latin-400-italic.woff2",
  },
];

// The bundle records where each emitted asset came from. Matching on that
// rather than on the hashed filename means a @fontsource release that renames
// its files fails the build instead of silently dropping a preload.
function findEmittedAsset(bundle, { pkg, file }) {
  const wanted = `${pkg}/files/${file}`;
  const matches = new Set();
  for (const output of Object.values(bundle)) {
    if (output.type !== "asset") continue;
    const origins = [
      ...(output.originalFileNames ?? []),
      ...(output.originalFileName ? [output.originalFileName] : []),
    ].map((value) => value.split(path.sep).join("/"));
    if (origins.some((origin) => origin.endsWith(wanted))) {
      matches.add(output.fileName);
    }
  }
  if (matches.size === 0) {
    // Older Rollup output shapes do not carry the origin. The emitted name is
    // `<stem>-<hash><ext>`, and anchoring at the start of the basename keeps
    // dm-sans-latin-wght-normal from matching dm-sans-latin-ext-wght-normal.
    const stem = file.replace(/\.woff2$/, "");
    const pattern = new RegExp(
      `(?:^|/)${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[^/]+\\.woff2$`,
    );
    for (const output of Object.values(bundle)) {
      if (output.type === "asset" && pattern.test(output.fileName)) {
        matches.add(output.fileName);
      }
    }
  }
  return [...matches];
}

function fontPreload() {
  let base = "/";
  let root = process.cwd();

  return {
    name: "etawise-font-preload",

    configResolved(config) {
      base = config.base;
      root = config.root;

      // Fail at startup, in both dev and build, if a declared face is not on
      // disk. Cheaper than discovering it from a 404 in the browser.
      for (const font of PRELOAD_FONTS) {
        const onDisk = path.join(root, "node_modules", font.pkg, "files", font.file);
        if (!existsSync(onDisk)) {
          throw new Error(
            `etawise-font-preload: ${font.pkg}/files/${font.file} is not installed. ` +
              `Update PRELOAD_FONTS in vite.config.js to the filenames the package ships.`,
          );
        }
      }
    },

    transformIndexHtml: {
      // `post` so the bundle is fully populated by the time this runs and the
      // links land in the final head.
      order: "post",
      handler(html, ctx) {
        // The dev server also serves scripts/og-image.html, which is a
        // build-time card, not the site. Only the root document gets preloads.
        const isSiteEntry =
          ctx.path === "/index.html" || ctx.path === "/" || ctx.path === "index.html";
        if (!isSiteEntry) return null;

        const hrefs = PRELOAD_FONTS.map((font) => {
          // Dev: no hashing, and Vite rewrites the url() in the @fontsource
          // stylesheet to exactly this path, so the preload and the CSS
          // reference resolve to one URL and one request.
          if (ctx.server) {
            return `/node_modules/${font.pkg}/files/${font.file}`;
          }

          // Build: the href has to be the hashed name Vite actually emitted.
          const bundle = ctx.bundle;
          if (!bundle) {
            throw new Error(
              "etawise-font-preload: no bundle was passed to transformIndexHtml, " +
                "so the hashed font filenames cannot be resolved. Refusing to emit " +
                "a preload that would 404.",
            );
          }
          const matches = findEmittedAsset(bundle, font);
          if (matches.length !== 1) {
            throw new Error(
              `etawise-font-preload: expected exactly one emitted asset for ` +
                `${font.pkg}/files/${font.file}, found ${matches.length}` +
                (matches.length ? ` (${matches.join(", ")})` : "") +
                ".",
            );
          }
          return path.posix.join(base, matches[0]);
        });

        return {
          html,
          // head-prepend puts the links above the stylesheet, which is the
          // whole point: the font request has to start alongside the CSS
          // request rather than after it. Two links is around 220 bytes, so
          // the charset declaration stays well inside its 1024-byte window.
          tags: hrefs.map((href) => ({
            tag: "link",
            injectTo: "head-prepend",
            attrs: {
              rel: "preload",
              // `crossorigin` is not optional. Fonts are always fetched in
              // CORS mode, so a preload without it is a different cache key
              // from the CSS request and the file would be downloaded twice.
              // A bare attribute means anonymous, which is what the font
              // request uses.
              crossorigin: true,
              as: "font",
              type: "font/woff2",
              href,
            },
          })),
        };
      },
    },
  };
}

export default defineConfig({
  plugins: [fontPreload()],
});
