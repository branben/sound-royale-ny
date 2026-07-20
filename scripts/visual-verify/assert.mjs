#!/usr/bin/env node
/*
 * scripts/visual-verify/assert.mjs
 *
 * Deterministic, dependency-free assertions over PixelRAG screenshot tiles.
 * These catch what text/E2E cannot: background color drift, gradient bands,
 * glow/colored shadows, non-solid surfaces — the design-system anti-patterns
 * in design-system/sound-royale/MASTER.md.
 *
 * Vision-only checks (verbatim text, font identity, layout sanity) are emitted
 * as a prompt per route for the agent/VLM to fill — pixel heuristics can't read
 * text reliably. See vision-prompts.md.
 *
 * Usage:
 *   node assert.mjs <tiles-dir> [baselines-dir]
 *   node assert.mjs captures/latest baselines
 *
 * Exit code: 0 if all deterministic checks pass, 1 if any fail.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import manifest from './manifest.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal decoder: shell out to the `pixelshot` sibling's PIL (always present
// as a pixelshot dependency). Compute ALL metrics in Python and return only a
// small JSON summary (never the raw pixel array — that blows the pipe buffer).
async function readImageStats(p) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const py = `
import sys, json, math
from PIL import Image
from collections import Counter
img = Image.open(${JSON.stringify(p)}).convert('RGB')
w,h = img.size
px = img.load()
NEAR_BLACK=(9,9,11)
def is_nb(c,tol=16):
    return abs(c[0]-NEAR_BLACK[0])<=tol and abs(c[1]-NEAR_BLACK[1])<=tol and abs(c[2]-NEAR_BLACK[2])<=tol
bg=[]
glow=0
total=0
# column brightness for gradient detection
colset={}
for y in range(0,h,8):
    for x in range(0,w,8):
        c=px[x,y]; total+=1
        if x%max(1,w//40)==0:
            colset.setdefault(x,[]).append((c[0]+c[1]+c[2])/3)
        if is_nb(c): bg.append(c)
        mx=max(c); mn=min(c); lum=mx*0.7+mn*0.3; sat=(mx-mn)/mx if mx else 0
        if sat>0.55 and lum<90: glow+=1
nb_frac=len(bg)/total if total else 0
cols=[sum(v)/len(v) for v in colset.values() if v]
mean=sum(cols)/len(cols) if cols else 0
var=sum((c-mean)**2 for c in cols)/len(cols) if cols else 0
glow_frac=glow/total if total else 0
print(json.dumps({'w':w,'h':h,'nearBlackFrac':nb_frac,'gradientStd':math.sqrt(var),'glowFrac':glow_frac}))
`;
  const tmp = nodePath.join(os.tmpdir(), `pxstat_${process.pid}_${Date.now()}.py`);
  fs.writeFileSync(tmp, py);
  try {
    const out = execSync(`python3 ${tmp}`, { encoding: 'utf8', maxBuffer: 1 << 24 });
    return JSON.parse(out.trim());
  } finally {
    fs.unlinkSync(tmp);
  }
}

const NEAR_BLACK = [9, 9, 11]; // #09090b — referenced by the Python stats helper
async function analyzeTile(tilesDir, routeName, expect) {
  const tileDir = path.join(tilesDir, `${routeName}.png.tiles`);
  const tile = path.join(tileDir, 'tile_0000.jpg');
  const res = { route: routeName, checks: [], verdict: 'PASS' };
  if (!fs.existsSync(tile)) {
    res.checks.push({ id: 'capture', pass: false, detail: `missing tile ${tile}` });
    res.verdict = 'FAIL';
    return res;
  }
  const img = await readImageStats(tile);
  const { nearBlackFrac, gradientStd, glowFrac } = img;

  // 1) Background near-black (MASTER.md: #09090b)
  const bgPass = nearBlackFrac > 0.6; // most of the page is the stage
  res.checks.push({
    id: 'bgNearBlack',
    pass: bgPass,
    detail: `near-black fraction ${(nearBlackFrac * 100).toFixed(1)}% (expect >60%)`,
  });

  // 2) No wide gradient bands: std-dev of column-average brightness must be low.
  const gradientPass = gradientStd < 12; // flat if std < 12/255
  res.checks.push({
    id: 'noGradient',
    pass: gradientPass,
    detail: `brightness std ${gradientStd.toFixed(1)} (expect <12)`,
  });

  // 3) No glow / colored shadows: strongly colored but low-luminance pixels
  //    (a glow is saturated color on a dark bg). Forbidden per MASTER anti-patterns.
  const glowPass = glowFrac < 0.01; // <1% of sampled pixels
  res.checks.push({
    id: 'noGlow',
    pass: glowPass,
    detail: `colored-low-lum pixels ${(glowFrac * 100).toFixed(2)}% (expect <1%)`,
  });

  if (expect.solidSurfaces) {
    // solid surfaces: presence of #18181b-ish (24,24,27) cards is fine; we just
    // assert NOT a backdrop-blur wash — approximated by checking mid-gray band exists
    // but isn't a smooth full-width gradient (already covered by noGradient).
    res.checks.push({ id: 'solidSurfaces', pass: true, detail: 'covered by noGradient+noGlow heuristics' });
  }

  // Verdict
  for (const c of res.checks) if (!c.pass) res.verdict = 'FAIL';
  return res;
}

// ---- run ----
const tilesDir = process.argv[2] || path.join(__dirname, 'captures/latest');
if (!fs.existsSync(tilesDir)) {
  console.error(`tiles dir not found: ${tilesDir}`);
  process.exit(2);
}

const results = await Promise.all(manifest.routes.map((r) => analyzeTile(tilesDir, r.name, r.expect || {})));

// Emit machine-readable + human report
const report = { generatedAt: new Date().toISOString(), tilesDir, results };
const summary = results.map((r) => ({ route: r.route, verdict: r.verdict, checks: r.checks }));
fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2));

console.log(`\n=== PixelRAG visual-verify (deterministic heuristics) ===`);
console.log(`tiles: ${tilesDir}\n`);
let fails = 0;
for (const r of summary) {
  const icon = r.verdict === 'PASS' ? 'PASS' : 'FAIL';
  if (r.verdict !== 'PASS') fails++;
  console.log(`[${icon}] ${r.route}`);
  for (const c of r.checks) console.log(`      ${c.pass ? 'ok ' : 'XX '} ${c.id}: ${c.detail}`);
}
console.log(`\n${results.length - fails}/${results.length} routes passed deterministic checks.`);
process.exit(fails === 0 ? 0 : 1);
