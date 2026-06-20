import { chromium } from "playwright";

const routes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/dashboard", "/kennisbank", "/graph", "/nieuw", "/instellingen"];

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const browser = await chromium.launch({
  args: ["--enable-webgl", "--use-gl=swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const log = [];
page.on("console", (m) => log.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => log.push(`PAGEERROR: ${e.message}\n${e.stack ?? ""}`));
page.on("requestfailed", (r) => log.push(`REQFAIL: ${r.failure()?.errorText} ${r.url()}`));
page.on("response", (r) => {
  if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url()}`);
});

let failed = 0;
for (const route of routes) {
  log.length = 0;
  try {
    await page.goto(BASE + route, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    failed++;
    console.log(`\n=== ${route} (navigation failed) ===\n${e.message}`);
    continue;
  }
  await page.waitForTimeout(2000);
  await page.evaluate(async () => {
    for (let i = 1; i <= 6; i++) {
      window.scrollTo(0, (document.body.scrollHeight * i) / 6);
      await new Promise((r) => setTimeout(r, 250));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  const errs = log.filter((l) => /^(\[error\]|PAGEERROR|REQFAIL|HTTP )/.test(l));
  if (errs.length) {
    failed++;
    console.log(`\n=== ${route} ===\n${errs.join("\n")}`);
  } else {
    console.log(`✓ ${route}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
