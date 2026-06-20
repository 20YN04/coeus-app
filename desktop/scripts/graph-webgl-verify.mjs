/**
 * graph-webgl-verify.mjs
 * Adversarial browser-verify for the 2D/3D toggle on /graph (coeus-kennisbank).
 * Tests: 2D canvas render, 3D WebGL init, toggle cleanup, context-leak probe.
 * Exit 0 = PASS, exit 1 = FAIL.
 *
 * Note on click strategy: Playwright's pointer-path hit-test fails because the
 * force-graph <canvas> fills .graph-canvas (position:absolute;inset:0) and
 * covers the .graph-toggle buttons. That is a real pointer-events CSS bug
 * (reported in summary). For functional testing of the 3D init we use
 * element.click() via page.evaluate (DOM-level, not pointer-level) so React
 * receives the synthetic event regardless.
 */

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const EMAIL = 'demo@coeus.app';
const PASSWORD = 'coeus2024';

// ── Collected evidence ───────────────────────────────────────────────────────
const consoleErrors = [];
const allConsole = [];
const pageErrors = [];
let webglLeakWarning = null;

// Patterns that indicate real problems
const FATAL_PATTERNS = [
  /too many.*(webgl|context)/i,
  /context.?lost/i,
  /THREE\./,
  /cannot read prop/i,
  /undefined is not/i,
  /import.*failed/i,
  /chunk.*failed/i,
  /3d-force-graph.*error/i,
  /ForceGraph3D.*error/i,
];

// Benign noise we explicitly allow
const BENIGN_PATTERNS = [
  /favicon/i,
  /react devtools/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /__webpack_hmr/i,
  /net::ERR_ABORTED.*_rsc=/i,
  /Download the AXE/i,
  /GPU stall due to ReadPixels/i,   // SwiftShader software-GL noise
  /WebGL-0x.*GL Driver Message/i,   // SwiftShader driver messages
];

function isBenign(text) {
  return BENIGN_PATTERNS.some((p) => p.test(text));
}

function isFatal(text) {
  return FATAL_PATTERNS.some((p) => p.test(text));
}

// ── Launch ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: [
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-gpu-watchdog',
    '--enable-accelerated-2d-canvas',
  ],
  headless: true,
});

const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

page.on('console', (msg) => {
  const text = `[${msg.type()}] ${msg.text()}`;
  allConsole.push(text);
  if (msg.type() === 'error' && !isBenign(text)) {
    consoleErrors.push(text);
    if (/too many.*(webgl|context)/i.test(text) || /context.?lost/i.test(text)) {
      webglLeakWarning = text;
    }
  }
  // Also flag warnings that are WebGL context exhaustion
  if (msg.type() === 'warning' && !isBenign(text)) {
    if (/too many.*(webgl|context)/i.test(text) || /context.?lost/i.test(text)) {
      webglLeakWarning = text;
      consoleErrors.push(`[warn/leak] ${msg.text()}`);
    }
  }
});

page.on('pageerror', (err) => {
  pageErrors.push(`PAGEERROR: ${err.message}`);
});

page.on('requestfailed', (req) => {
  const url = req.url();
  const errText = req.failure()?.errorText ?? '';
  if (errText === 'net::ERR_ABORTED' && /[?&]_rsc=/.test(url)) return;
  allConsole.push(`REQFAIL: ${errText} ${url}`);
});

// ── Step 1: Login ─────────────────────────────────────────────────────────────
console.log('[sara] Logging in…');
try {
  await page.goto(BASE + '/login', { waitUntil: 'load', timeout: 30_000 });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log('[sara] Logged in OK');
} catch (e) {
  console.error(`[sara] Login FAILED: ${e.message}`);
  await browser.close();
  process.exit(1);
}

// ── Step 2: Navigate to /graph ────────────────────────────────────────────────
console.log('[sara] Navigating to /graph…');
await page.goto(BASE + '/graph', { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForTimeout(2500);

// ── Step 3: Assert 2D canvas rendered ────────────────────────────────────────
console.log('[sara] Checking 2D canvas…');
const canvas2D = await page.evaluate(() => {
  const container = document.querySelector('.graph-canvas');
  if (!container) return { found: false, reason: 'no .graph-canvas element' };
  const canvas = container.querySelector('canvas');
  if (!canvas) return { found: false, reason: 'no <canvas> inside .graph-canvas' };
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return { found: false, reason: `canvas is ${w}×${h} (zero dimension)` };
  // Verify it is a 2D canvas (force-graph uses Canvas 2D API)
  const ctx2d = canvas.getContext('2d');
  return { found: true, width: w, height: h, is2D: ctx2d !== null };
});
const renders2D = canvas2D.found;
console.log(renders2D
  ? `[sara] 2D canvas OK — ${canvas2D.width}×${canvas2D.height} (2D API: ${canvas2D.is2D})`
  : `[sara] 2D canvas FAIL — ${canvas2D.reason}`);

// ── Step 4: Screenshot 2D ────────────────────────────────────────────────────
await page.screenshot({ path: '/tmp/graph-2d.png', fullPage: false });
console.log('[sara] Screenshot → /tmp/graph-2d.png');

// ── Step 4b: Probe pointer-intercept bug ─────────────────────────────────────
// The toggle buttons are position:absolute;z-index:2 but the canvas fills
// .graph-canvas (position:absolute;inset:0) — diagnose the actual hit-test result.
const pointerInterceptDiag = await page.evaluate(() => {
  // Check the 3D button (last .graph-toggle__btn)
  const btns = document.querySelectorAll('.graph-toggle__btn');
  const btn3D = btns[btns.length - 1];
  const canvas = document.querySelector('.graph-canvas canvas');
  const toggle = document.querySelector('.graph-toggle');
  if (!btn3D || !canvas || !toggle) return { canDiagnose: false };

  const btnRect = btn3D.getBoundingClientRect();
  const btnCx = btnRect.left + btnRect.width / 2;
  const btnCy = btnRect.top + btnRect.height / 2;
  const topEl = document.elementFromPoint(btnCx, btnCy);
  const topTag = topEl
    ? topEl.tagName + (topEl.id ? '#' + topEl.id : '') + (topEl.className && typeof topEl.className === 'string' ? '.' + topEl.className.trim().replace(/\s+/g, '.') : '')
    : 'null';

  return {
    canDiagnose: true,
    topElAtBtnCenter: topTag,
    isButtonHit: topEl === btn3D,
    toggleZIndex: getComputedStyle(toggle).zIndex,
    canvasWrapZIndex: getComputedStyle(document.querySelector('.graph-canvas')).zIndex,
    canvasWrapPosition: getComputedStyle(document.querySelector('.graph-canvas')).position,
    canvasElZIndex: getComputedStyle(canvas).zIndex,
    canvasPointerEvents: getComputedStyle(canvas).pointerEvents,
    canvasWrapPointerEvents: getComputedStyle(document.querySelector('.graph-canvas')).pointerEvents,
  };
});

let pointerInterceptBug = false;
if (pointerInterceptDiag.canDiagnose) {
  pointerInterceptBug = !pointerInterceptDiag.isButtonHit;
  if (pointerInterceptBug) {
    console.log(
      `[sara] POINTER-INTERCEPT BUG: elementFromPoint at 3D button centre → "${pointerInterceptDiag.topElAtBtnCenter}" (expected the button).\n` +
      `       .graph-toggle z-index:${pointerInterceptDiag.toggleZIndex} | ` +
      `.graph-canvas z-index:${pointerInterceptDiag.canvasWrapZIndex} (${pointerInterceptDiag.canvasWrapPosition}) pointer-events:${pointerInterceptDiag.canvasWrapPointerEvents} | ` +
      `<canvas> z-index:${pointerInterceptDiag.canvasElZIndex} pointer-events:${pointerInterceptDiag.canvasPointerEvents}\n` +
      `       Fix: add pointer-events:none to .graph-canvas (or the <canvas> inside it).`
    );
  } else {
    console.log(`[sara] Pointer hit-test OK — button is reachable`);
  }
}

// ── Step 5: Click 3D button (DOM-level, bypasses pointer-events) ──────────────
// We use element.click() via page.evaluate instead of Playwright's pointer path
// because the canvas intercept bug above blocks the pointer path. This tests
// whether React correctly handles the toggle — the pointer bug is already recorded.
console.log('[sara] Clicking 3D button (DOM click)…');

// Inject getContext hook BEFORE click to catch WebGL context creation
await page.evaluate(() => {
  window.__webglContextsCreated = [];
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const result = orig.call(this, type, ...args);
    if (type.includes('webgl') || type.includes('WebGL')) {
      window.__webglContextsCreated.push({
        type,
        result: result ? result.constructor.name : 'null',
        timestamp: Date.now(),
      });
    }
    return result;
  };
});

await page.evaluate(() => {
  const btns = document.querySelectorAll('.graph-toggle__btn');
  const btn3D = btns[btns.length - 1];
  btn3D?.click();
});

// Wait for: dynamic import + three.js WebGL init + zoomToFit(600ms)
await page.waitForTimeout(3500);

// ── Step 6: Assert 3D rendered ───────────────────────────────────────────────
console.log('[sara] Checking 3D WebGL canvas…');
const canvas3D = await page.evaluate(() => {
  const container = document.querySelector('.graph-canvas');
  if (!container) return { found: false, hasWebGL: false, reason: 'no .graph-canvas element' };
  const canvas = container.querySelector('canvas');
  if (!canvas) return { found: false, hasWebGL: false, reason: 'no <canvas> inside .graph-canvas after 3D switch' };

  // Check React state: aria-pressed on 3D button
  const btns = document.querySelectorAll('.graph-toggle__btn');
  const btn3D = btns[btns.length - 1];
  const reactStateIs3D = btn3D?.getAttribute('aria-pressed') === 'true';

  // Probe WebGL: calling getContext with the same type returns the existing context.
  // If three.js created webgl2, getContext('webgl2') returns the existing WebGL2 context.
  // If it returns null, the canvas has a different type.
  let hasWebGL = false;
  let contextType = 'none';
  const gl2 = canvas.getContext('webgl2');
  if (gl2) { hasWebGL = true; contextType = 'webgl2'; }
  else {
    const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl1) { hasWebGL = true; contextType = 'webgl'; }
    else {
      // Maybe canvas is still a 2D canvas from a failed switch
      const ctx2d = canvas.getContext('2d');
      contextType = ctx2d ? '2d (3D init may have failed)' : 'unknown';
    }
  }

  // Also read the intercepted context creation log
  const webglLog = window.__webglContextsCreated ?? [];

  return {
    found: true,
    hasWebGL,
    contextType,
    reactStateIs3D,
    width: canvas.width,
    height: canvas.height,
    webglContextLog: webglLog,
  };
});

const errors3DPhase = consoleErrors.filter(isFatal);
// 3D renders = WebGL context created (confirmed by hook log) AND no fatal errors
const webglCreatedByHook = canvas3D.webglContextLog && canvas3D.webglContextLog.some((e) => e.result !== 'null');
const renders3D = canvas3D.found && (canvas3D.hasWebGL || webglCreatedByHook) && errors3DPhase.length === 0;

console.log(canvas3D.found
  ? `[sara] 3D canvas present — ${canvas3D.width}×${canvas3D.height}, WebGL context type: ${canvas3D.contextType}, React state is3D: ${canvas3D.reactStateIs3D}`
  : `[sara] 3D canvas FAIL — ${canvas3D.reason}`);

if (canvas3D.webglContextLog?.length) {
  console.log(`[sara] WebGL context creation log: ${JSON.stringify(canvas3D.webglContextLog)}`);
} else {
  console.log('[sara] WebGL context creation log: empty (no webgl getContext calls seen — unexpected)');
}

if (errors3DPhase.length) {
  console.log(`[sara] Fatal errors during 3D init:\n  ${errors3DPhase.join('\n  ')}`);
} else {
  console.log('[sara] No fatal errors during 3D init');
}

// ── Step 7: Screenshot 3D ────────────────────────────────────────────────────
await page.screenshot({ path: '/tmp/graph-3d.png', fullPage: false });
console.log('[sara] Screenshot → /tmp/graph-3d.png');

// ── Step 8: Toggle back to 2D ────────────────────────────────────────────────
console.log('[sara] Clicking 2D button (toggle back)…');
const errCountBefore2DReturn = consoleErrors.length;

await page.evaluate(() => {
  const btns = document.querySelectorAll('.graph-toggle__btn');
  const btn2D = btns[0];
  btn2D?.click();
});
await page.waitForTimeout(1800);

const canvas2DReturn = await page.evaluate(() => {
  const container = document.querySelector('.graph-canvas');
  if (!container) return { found: false };
  const canvas = container.querySelector('canvas');
  if (!canvas) return { found: false };
  // Should be a 2D canvas again
  const ctx2d = canvas.getContext('2d');
  return { found: true, width: canvas.width, height: canvas.height, is2D: ctx2d !== null };
});
const toggleBackWorks = canvas2DReturn.found;
const newErrors2DReturn = consoleErrors.slice(errCountBefore2DReturn);

console.log(toggleBackWorks
  ? `[sara] Toggle back to 2D OK — canvas ${canvas2DReturn.width}×${canvas2DReturn.height} (2D API: ${canvas2DReturn.is2D})`
  : '[sara] Toggle back to 2D FAIL — no canvas found');

if (newErrors2DReturn.length) {
  console.log(`[sara] Errors on 2D return:\n  ${newErrors2DReturn.join('\n  ')}`);
}

await page.screenshot({ path: '/tmp/graph-2d-return.png', fullPage: false });
console.log('[sara] Screenshot → /tmp/graph-2d-return.png');

// ── Step 9: Leak probe — rapid 3D→2D→3D→2D cycles ───────────────────────────
console.log('[sara] Leak probe: rapid 3D↔2D cycles…');
const errCountBeforeLeak = consoleErrors.length;

// Reset the context creation counter
await page.evaluate(() => { window.__webglContextsCreated = []; });

for (let i = 0; i < 3; i++) {
  console.log(`[sara]   cycle ${i + 1}/3: → 3D`);
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.graph-toggle__btn');
    btns[btns.length - 1]?.click();
  });
  await page.waitForTimeout(1500);

  console.log(`[sara]   cycle ${i + 1}/3: → 2D`);
  await page.evaluate(() => {
    const btns = document.querySelectorAll('.graph-toggle__btn');
    btns[0]?.click();
  });
  await page.waitForTimeout(1000);
}

// Check context creation count (one webgl2 context per 3D cycle; if contexts accumulate
// instead of being destroyed, the browser will warn about too many active contexts)
const leakContextLog = await page.evaluate(() => window.__webglContextsCreated ?? []);
const leakErrors = consoleErrors.slice(errCountBeforeLeak);
const leakWarnings = leakErrors.filter((e) =>
  /too many.*(webgl|context)/i.test(e) ||
  /context.?lost/i.test(e) ||
  /webgl context/i.test(e)
);

if (leakWarnings.length) {
  webglLeakWarning = leakWarnings.join('\n');
  console.log(`[sara] LEAK DETECTED:\n  ${leakWarnings.join('\n  ')}`);
} else {
  console.log('[sara] No WebGL context leak warnings across 3 rapid cycles');
}

console.log(`[sara] WebGL context creations during leak probe: ${leakContextLog.length} (${leakContextLog.map(e => e.type).join(', ') || 'none'})`);

if (leakErrors.length && !leakWarnings.length) {
  console.log(`[sara] Other errors during leak probe:\n  ${leakErrors.join('\n  ')}`);
}

// ── Step 10: Close ────────────────────────────────────────────────────────────
await browser.close();

// ── Final summary ────────────────────────────────────────────────────────────
const fatalConsoleErrors = consoleErrors.filter(isFatal);
const hasFatal =
  fatalConsoleErrors.length > 0 ||
  pageErrors.length > 0 ||
  webglLeakWarning !== null ||
  !renders2D ||
  !renders3D ||
  !toggleBackWorks ||
  pointerInterceptBug;

console.log('\n' + '═'.repeat(60));
console.log('BROWSER-VERIFY RESULT — /graph 2D/3D toggle');
console.log('═'.repeat(60));
console.log(`Overall:             ${hasFatal ? 'FAIL' : 'PASS'}`);
console.log(`2D renders:          ${renders2D ? 'yes' : 'NO'}`);
console.log(`3D renders:          ${renders3D ? 'yes' : 'NO'}`);
console.log(`Toggle back (2D):    ${toggleBackWorks ? 'yes' : 'NO'}`);
console.log(`WebGL context leak:  ${webglLeakWarning ? 'YES — ' + webglLeakWarning : 'no'}`);
console.log(`Pointer intercept:   ${pointerInterceptBug ? 'BUG — canvas covers toggle buttons (real user cannot click 3D)' : 'OK'}`);
console.log('');

if (fatalConsoleErrors.length) {
  console.log('Fatal console errors:');
  fatalConsoleErrors.forEach((e) => console.log('  ' + e));
} else {
  console.log('Fatal console errors: none');
}

console.log('');
if (pageErrors.length) {
  console.log('Page errors (uncaught):');
  pageErrors.forEach((e) => console.log('  ' + e));
} else {
  console.log('Page errors:         none');
}

const benignNoise = allConsole.filter(
  (m) => (m.startsWith('[warning]') || m.startsWith('[error]')) && isBenign(m)
);
if (benignNoise.length) {
  console.log('');
  console.log('Benign noise (not counted):');
  benignNoise.forEach((e) => console.log('  ' + e));
}

console.log('');
console.log('Screenshots:');
console.log('  /tmp/graph-2d.png');
console.log('  /tmp/graph-3d.png');
console.log('  /tmp/graph-2d-return.png');
console.log('═'.repeat(60));

process.exit(hasFatal ? 1 : 0);
