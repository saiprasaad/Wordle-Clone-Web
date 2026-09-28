// Renders the app icons from SVG. Run after changing the design:
//   node scripts/build-icons.js
// Needs the Playwright dev dependency (npm install) for headless Chromium.

import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const GREEN = '#6ca965';
const LETTER =
  '<path d="M15 21l8.5 24L32 26.5 40.5 45 49 21" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>';

// Rounded tile for favicons and "any" purpose icons.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${GREEN}"/>${LETTER}</svg>`;
// Full-bleed square: iOS and Android maskable icons apply their own shape.
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${GREEN}"/>${LETTER}</svg>`;
// Maskable icons must keep the artwork inside the central 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${GREEN}"/><g transform="translate(32 33) scale(0.8) translate(-32 -33)">${LETTER}</g></svg>`;

const outputs = [
  ['icons/favicon-32.png', tile, 32],
  ['icons/icon-192.png', tile, 192],
  ['icons/icon-512.png', tile, 512],
  ['icons/apple-touch-icon.png', square, 180],
  ['icons/icon-maskable-512.png', maskable, 512],
];

const root = new URL('..', import.meta.url);
await writeFile(new URL('icons/favicon.svg', root), `${tile}\n`);

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, svg, size] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: new URL(path, root).pathname, omitBackground: true });
}
await browser.close();
console.log(`Wrote icons/favicon.svg and ${outputs.length} PNG icons.`);
