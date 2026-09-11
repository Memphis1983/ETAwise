// Renders scripts/og-image.html to public/og-image.png at exactly 1200x630.
//
// Self-contained: starts its own Vite dev server (so the local @fontsource
// packages resolve exactly as they do on the site), screenshots the card with
// Chromium, and always shuts the server down again.
//
// Run with: npm run og:image

import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CARD_URL = `${ORIGIN}/scripts/og-image.html`;
const OUTPUT = path.join(ROOT, "public", "og-image.png");

const WIDTH = 1200;
const HEIGHT = 630;
const PAPER = "#f5f3ed";

// Text that must be present in the rendered card. Guards against a silently
// empty or half-built card, and pins the product name.
const REQUIRED_TEXT = [
  "ETAwise.",
  "AI-ASSISTED SUPPORT OPERATIONS",
  "In development",
  "Follow-through.",
  "Not follow-ups.",
  "AI-assisted support operations for helpdesk and technical support teams.",
];

function log(message) {
  process.stdout.write(`${message}\n`);
}

// --- dev server ------------------------------------------------------------

async function startDevServer() {
  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, "node_modules", "vite", "bin", "vite.js"),
      "--port",
      String(PORT),
      // Fail instead of silently moving to another port, which would make the
      // wait loop below poll an address nothing is listening on.
      "--strictPort",
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  let exited = null;
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  child.on("exit", (code, signal) => (exited = { code, signal }));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `Vite dev server exited before it was ready (code ${exited.code}, signal ${exited.signal}).\n${output}`,
      );
    }
    try {
      const response = await fetch(CARD_URL);
      if (response.ok) {
        await response.text();
        log(`Dev server ready on ${ORIGIN}`);
        return child;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Vite dev server did not respond within 60s.\n${output}`);
}

async function stopDevServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5_000);
  await once(child, "exit");
  clearTimeout(timer);

  // Confirm the port is actually free again, so a failed shutdown cannot leave
  // an orphan listening on 5199.
  try {
    await fetch(ORIGIN, { signal: AbortSignal.timeout(1_000) });
    throw new Error(`Something is still listening on ${ORIGIN} after shutdown.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("still listening")) {
      throw error;
    }
  }
  log(`Dev server stopped, port ${PORT} released`);
}

// --- in-page checks --------------------------------------------------------

// Runs in the browser. Returns everything the CLI needs to assert on, rather
// than throwing inside the page, so failures can be reported with detail.
async function inspectCard({ width, height, paper }) {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const measure = (font, text) => {
    context.font = font;
    return context.measureText(text).width;
  };
  const sample = "Follow-through. Not follow-ups. ETAwise";

  const headline = document.querySelector(".headline");
  const serif = document.querySelector(".headline .serif");
  const lede = document.querySelector(".lede");

  // A font-family declaration proves nothing: if the face never loaded the
  // browser quietly draws a fallback. document.fonts.check() is no good either,
  // because it returns true for a family that was never defined at all (the
  // fallback can render the characters). Two checks that do work:
  //
  //   1. the FontFaceSet must actually hold a loaded face for the family;
  //   2. measured text width must differ from a deliberately nonexistent
  //      family, which is exactly what a fallback would measure as.
  const loadedFaces = [...document.fonts].filter(
    (face) => face.status === "loaded",
  );
  const hasLoadedFace = (family, style) =>
    loadedFaces.some((face) => face.family === family && face.style === style);
  const nonsense = measure('500 88px "__no_such_family__"', sample);

  const fonts = {
    sansFaceLoaded: hasLoadedFace("DM Sans Variable", "normal"),
    serifFaceLoaded: hasLoadedFace("Instrument Serif", "italic"),
    sansIsNotFallback:
      measure('500 88px "DM Sans Variable", "__no_such_family__"', sample) !==
      nonsense,
    serifIsNotFallback:
      measure(
        'italic 400 88px "Instrument Serif", "__no_such_family__"',
        sample,
      ) !== measure('italic 400 88px "__no_such_family__"', sample),
    loaded: loadedFaces.map(
      (face) => `${face.family} ${face.style} ${face.weight}`,
    ),
  };

  // Contrast, computed from what is actually rendered.
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const parse = (value) => value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const luminance = ([r, g, b]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const hexToRgb = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ratio = (colour) => {
    const a = luminance(parse(colour));
    const b = luminance(hexToRgb(paper));
    const [light, dark] = a > b ? [a, b] : [b, a];
    return Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
  };

  const contrast = {
    headline: {
      colour: getComputedStyle(headline).color,
      fontSize: getComputedStyle(headline).fontSize,
      ratio: ratio(getComputedStyle(headline).color),
    },
    headlineSerif: {
      colour: getComputedStyle(serif).color,
      fontSize: getComputedStyle(serif).fontSize,
      ratio: ratio(getComputedStyle(serif).color),
    },
    lede: {
      colour: getComputedStyle(lede).color,
      fontSize: getComputedStyle(lede).fontSize,
      ratio: ratio(getComputedStyle(lede).color),
    },
  };

  // Clipping: the document must not scroll, and every leaf element that draws
  // text or a mark must sit inside the canvas.
  const overflow = {
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  };
  const tolerance = 0.5;
  const clipped = [];
  for (const element of document.querySelectorAll(".card *")) {
    if (element.children.length > 0) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (
      box.left < -tolerance ||
      box.top < -tolerance ||
      box.right > width + tolerance ||
      box.bottom > height + tolerance
    ) {
      clipped.push({
        selector: `${element.tagName.toLowerCase()}.${element.className || "(no class)"}`,
        text: (element.textContent || "").trim().slice(0, 40),
        box: {
          left: Math.round(box.left),
          top: Math.round(box.top),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
        },
      });
    }
  }

  // Per-line ink widths. The block boxes fill the content width, so this is
  // the only way to see how much room the longest line actually has left.
  const lineWidths = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = new Map();
    for (const box of range.getClientRects()) {
      if (box.width < 1) continue;
      // Group the rects into visual lines, then take each line's extent.
      // A nested span yields overlapping rects, so union rather than sum.
      const key = Math.round(box.top);
      const line = lines.get(key) ?? { left: box.left, right: box.right };
      lines.set(key, {
        left: Math.min(line.left, box.left),
        right: Math.max(line.right, box.right),
      });
    }
    return [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, line]) => Math.round(line.right - line.left));
  };

  return {
    fonts,
    contrast,
    overflow,
    clipped,
    headlineLines: lineWidths(headline),
    ledeLines: lineWidths(lede),
    // textContent, not innerText: the brand lockup is a flex container, and
    // innerText inserts line breaks between flex items.
    text: document
      .querySelector(".card")
      .textContent.replace(/\s+/g, " ")
      .trim(),
    ledeHeight: Math.round(lede.getBoundingClientRect().height),
    headlineBox: (() => {
      const box = headline.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    })(),
  };
}

// --- rasterised fonts (Chromium DevTools protocol) -------------------------

// CSS.getPlatformFontsForNode reports the font files Chromium actually used to
// draw a node, with a glyph count per family. This is the only check that
// cannot be fooled by a fallback.
async function usedFonts(page, selectors) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 });
    const result = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const { nodeId } = await cdp.send("DOM.querySelector", {
        nodeId: root.nodeId,
        selector,
      });
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
        nodeId,
      });
      result[name] = fonts;
    }
    return result;
  } finally {
    await cdp.detach();
  }
}

// --- png ------------------------------------------------------------------

// Reads width and height straight out of the PNG IHDR chunk, so the reported
// dimensions come from the file on disk rather than from what we asked for.
function readPngSize(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Output file is not a PNG.");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// --- main -----------------------------------------------------------------

async function main() {
  await mkdir(path.dirname(OUTPUT), { recursive: true });

  const server = await startDevServer();
  try {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: WIDTH, height: HEIGHT },
        deviceScaleFactor: 1,
      });

      const failures = [];
      page.on("pageerror", (error) => failures.push(`page error: ${error}`));
      page.on("console", (message) => {
        if (message.type() === "error") {
          failures.push(`console error: ${message.text()}`);
        }
      });

      const response = await page.goto(CARD_URL, { waitUntil: "load" });
      if (!response || !response.ok()) {
        throw new Error(`Could not load ${CARD_URL} (${response?.status()}).`);
      }
      if (failures.length > 0) {
        throw new Error(`Card reported errors:\n  ${failures.join("\n  ")}`);
      }

      const report = await page.evaluate(inspectCard, {
        width: WIDTH,
        height: HEIGHT,
        paper: PAPER,
      });

      const { fonts } = report;
      if (
        !fonts.sansFaceLoaded ||
        !fonts.serifFaceLoaded ||
        !fonts.sansIsNotFallback ||
        !fonts.serifIsNotFallback
      ) {
        throw new Error(
          [
            "Fonts did not load; the card would ship in fallback faces.",
            `  DM Sans Variable face loaded: ${fonts.sansFaceLoaded}`,
            `  Instrument Serif italic face loaded: ${fonts.serifFaceLoaded}`,
            `  DM Sans measures differently to a missing family: ${fonts.sansIsNotFallback}`,
            `  Instrument Serif measures differently to a missing family: ${fonts.serifIsNotFallback}`,
            `  loaded faces: ${fonts.loaded.join(", ") || "none"}`,
          ].join("\n"),
        );
      }

      // Definitive check: ask Chromium which font files it actually rasterised
      // each element with. Catches anything the in-page checks would miss.
      const platformFonts = await usedFonts(page, {
        headline: ".headline",
        serif: ".headline .serif",
        lede: ".lede",
        brand: ".brand",
        kicker: ".kicker-label",
      });
      // Chromium reports the font's own family name, which for the variable
      // DM Sans is "DM Sans 9pt", so match on prefix. `.headline` contains the
      // italic span, so both families are legitimate there.
      const SANS = "DM Sans";
      const SERIF = "Instrument Serif";
      const expected = {
        headline: { required: [SANS, SERIF], allowed: [SANS, SERIF] },
        serif: { required: [SERIF], allowed: [SERIF] },
        lede: { required: [SANS], allowed: [SANS] },
        brand: { required: [SANS], allowed: [SANS] },
        kicker: { required: [SANS], allowed: [SANS] },
      };
      for (const [name, families] of Object.entries(platformFonts)) {
        const names = families.map((entry) => entry.familyName);
        const rule = expected[name];
        const missing = rule.required.filter(
          (family) => !names.some((used) => used.startsWith(family)),
        );
        if (missing.length > 0) {
          throw new Error(
            `${name} was rasterised with [${names.join(", ") || "no font"}] but needs ${missing.join(" and ")}. The font did not load and a fallback was drawn.`,
          );
        }
        const unexpected = names.filter(
          (used) => !rule.allowed.some((family) => used.startsWith(family)),
        );
        if (unexpected.length > 0) {
          throw new Error(
            `${name} fell back to [${unexpected.join(", ")}] for some glyphs.`,
          );
        }
      }

      const missing = REQUIRED_TEXT.filter(
        (needle) => !report.text.includes(needle),
      );
      if (missing.length > 0) {
        throw new Error(
          `Card is missing expected text: ${missing.map((t) => JSON.stringify(t)).join(", ")}\n  rendered: ${report.text}`,
        );
      }
      if (
        report.overflow.scrollWidth > WIDTH ||
        report.overflow.scrollHeight > HEIGHT
      ) {
        throw new Error(
          `Card overflows the ${WIDTH}x${HEIGHT} canvas: document scrolls to ${report.overflow.scrollWidth}x${report.overflow.scrollHeight}. Reduce a font size or the padding.`,
        );
      }
      if (report.clipped.length > 0) {
        throw new Error(
          `${report.clipped.length} element(s) sit outside the canvas:\n${report.clipped
            .map(
              (item) =>
                `  ${item.selector} "${item.text}" at ${JSON.stringify(item.box)}`,
            )
            .join("\n")}`,
        );
      }

      await page.screenshot({ path: OUTPUT, fullPage: false });

      const buffer = await readFile(OUTPUT);
      const size = readPngSize(buffer);
      if (size.width !== WIDTH || size.height !== HEIGHT) {
        throw new Error(
          `Wrote ${size.width}x${size.height}, expected ${WIDTH}x${HEIGHT}.`,
        );
      }

      log("");
      log(`Wrote      ${OUTPUT}`);
      log(`Dimensions ${size.width}x${size.height} px (read from PNG header)`);
      log(
        `File size  ${(buffer.length / 1024).toFixed(1)} KB (${buffer.length} bytes)`,
      );
      log("");
      log("Fonts");
      log(`  loaded faces      ${fonts.loaded.join(", ")}`);
      log("  actually rasterised (from Chromium, per element):");
      for (const [name, families] of Object.entries(platformFonts)) {
        log(
          `    ${name.padEnd(9)} ${families
            .map((entry) => `${entry.familyName} (${entry.glyphCount} glyphs)`)
            .join(", ")}`,
        );
      }
      log("");
      log(`Contrast against ${PAPER}`);
      for (const [name, entry] of Object.entries(report.contrast)) {
        log(
          `  ${name.padEnd(13)} ${entry.colour} at ${entry.fontSize} -> ${entry.ratio}:1`,
        );
      }
      log("");
      log("Layout");
      log(`  text       ${report.text}`);
      log(
        `  document   ${report.overflow.scrollWidth}x${report.overflow.scrollHeight} (no overflow)`,
      );
      log(
        `  headline   box ${report.headlineBox.width}x${report.headlineBox.height} at ${report.headlineBox.left},${report.headlineBox.top}; line widths ${report.headlineLines.join(" / ")} px`,
      );
      log(
        `  lede       ${report.ledeHeight}px tall, line widths ${report.ledeLines.join(" / ")} px`,
      );
      log(`  content    ${WIDTH - 144}px wide (1200 minus 72px padding)`);
    } finally {
      await browser.close();
    }
  } finally {
    await stopDevServer(server);
  }
}

await main();
