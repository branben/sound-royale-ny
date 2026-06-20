// /Users/brandonbennett/sound-royale-ny/_inspect-prototype.mjs
// THROWAWAY — Headless inspection of the Harness Tab prototype.
// Visits each of A/B/C/D and writes structured observations plus screenshots
// so we can update PROTOTYPE.md with what is mechanically confirmable.

import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'http://localhost:8080/prototypes/harness-tab';
const SHOT_DIR = '/tmp/prototype-shots';
const OUT_JSON = '/tmp/prototype-results.json';

const VARIANT_PROBES = `(() => {
  return {};
})()`;

async function inspect(page, variant) {
  const url = `${BASE}?v=${variant}`;
  const obs = {
    variant,
    url,
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    failedRequests: [],
    overflow: { horizontalPx: 0, overflowingElements: [] },
  };

  page.on('console', (m) => {
    if (m.type() === 'error') obs.consoleErrors.push(m.text());
    else if (m.type() === 'warning') obs.consoleWarnings.push(m.text());
  });
  page.on('pageerror', (e) => obs.pageErrors.push(String(e)));
  page.on('requestfailed', (req) =>
    obs.failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`),
  );

  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  obs.status = resp?.status() ?? null;

  // Rendered text from <main>
  obs.renderedText = (
    await page.locator('main').innerText({ timeout: 5000 }).catch(() => '')
  ).slice(0, 6000);

  // Accessibility snapshot
  obs.accessibilitySize = await page
    .accessibility.snapshot({ interestingOnly: true })
    .then((s) => JSON.stringify(s ?? {}).length)
    .catch(() => -1);

  // Overflow detection
  const dims = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
    bodyW: document.body.scrollWidth,
    docH: document.documentElement.scrollHeight,
    winH: window.innerHeight,
  }));
  obs.viewport = dims;
  obs.overflow.horizontalPx = Math.max(0, dims.docW - dims.winW);
  obs.overflow.verticalPx = Math.max(0, dims.docH - dims.winH);

  obs.overflow.overflowingElements = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute('class') || '').slice(0, 80),
          right: Math.round(r.right),
        });
      }
    });
    return out.slice(0, 25);
  });

  // Variant-specific probes
  if (variant === 'A') {
    obs.threePane = await page.evaluate(() => {
      const streamItems = document.querySelectorAll('button[class*="rounded-md"]').length;
      const confidenceDots = document.querySelectorAll('span.h-2.w-2.rounded-full').length;
      const sparklineBars = document.querySelectorAll('div.bg-primary.rounded-sm').length;
      const main = document.querySelector('main');
      return {
        streamItems,
        confidenceDots,
        sparklineBars,
        mainTextLen: (main?.textContent || '').length,
        paneHeights: Array.from(document.querySelectorAll('main > div > *')).map(
          (el) => Math.round(el.getBoundingClientRect().height),
        ),
      };
    });
  }

  if (variant === 'B') {
    obs.commitGraph = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('svg text'));
      const boxes = texts.map((t) => {
        const bb = t.getBBox();
        return { txt: t.textContent.trim(), x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      });
      const collisions = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
            collisions.push([a.txt, b.txt]);
          }
        }
      }
      return {
        textNodeCount: texts.length,
        sampleTexts: boxes.slice(0, 20).map((b) => b.txt),
        collisionCount: collisions.length,
        collisionPairs: collisions.slice(0, 10),
      };
    });
  }

  if (variant === 'C') {
    obs.verticalFeed = await page.evaluate(() => {
      const cards = document.querySelectorAll('[class*="border-l-4"]').length;
      const actionButtons = Array.from(
        document.querySelectorAll('main button'),
      ).filter((b) => /accept|reject/i.test(b.textContent || '')).length;
      const headerHasDecisions = !!document.body.textContent.match(/\d+ decided/);
      const opacityDims = document.querySelectorAll('[class*="opacity-70"]').length;
      return { cards, actionButtons, headerHasDecisions, opacityDimmedCards: opacityDims };
    });
  }

  if (variant === 'D') {
    obs.diffInspector = await page.evaluate(() => {
      const lines = document.querySelectorAll('pre > div').length;
      const strikethroughs = document.querySelectorAll('div.line-through').length;
      const greens = document.querySelectorAll('[class*="bg-emerald"]').length;
      const roses = document.querySelectorAll('[class*="bg-rose"]').length;
      const amber = document.querySelectorAll('[class*="bg-amber"]').length;
      const hasSelectPicker = !!document.querySelector('select option');
      const selectOptions = document.querySelectorAll('select option').length;
      const footerCardHasConfidence =
        !!document.querySelector('main div[class*="rounded-lg"][class*="border"][class*="bg-card"]');
      return {
        lines,
        strikethroughs,
        emeraldLines: greens,
        roseLines: roses,
        amberLines: amber,
        hasSelectPicker,
        selectOptions,
        transferYieldFooter: footerCardHasConfidence,
      };
    });
  }

  // Screenshot
  await mkdir(SHOT_DIR, { recursive: true }).catch(() => {});
  const shotPath = `${SHOT_DIR}/variant-${variant}.png`;
  await page.screenshot({ path: shotPath, fullPage: false });
  obs.screenshot = shotPath;

  return obs;
}

async function main() {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const results = [];
  for (const v of ['A', 'B', 'C', 'D']) {
    try {
      const obs = await inspect(page, v);
      results.push(obs);
      const bits = [];
      bits.push(`text=${obs.renderedText.length}b`);
      if (obs.consoleErrors.length) bits.push(`errs=${obs.consoleErrors.length}`);
      if (obs.overflow.horizontalPx > 0) bits.push(`hOverflow=${obs.overflow.horizontalPx}`);
      if (obs.overflow.verticalPx > 0) bits.push(`vScroll=${obs.overflow.verticalPx}`);
      console.log(`[${v}] status=${obs.status} ${bits.join(' ')}`);
    } catch (e) {
      results.push({ variant: v, error: String(e), stack: e?.stack });
      console.log(`[${v}] error: ${e}`);
    }
  }
  await writeFile(OUT_JSON, JSON.stringify(results, null, 2));
  console.log(`wrote ${OUT_JSON}`);
  await browser.close();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
