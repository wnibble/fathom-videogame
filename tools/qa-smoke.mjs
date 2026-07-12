// Headless QA smoke: loads the running dev build in Chromium (WebGL via
// SwiftShader), walks boot→loading→cutscene→dive, simulates play (move + aim +
// fire), samples live metrics, screenshots each phase, and reports console/page
// errors. Exits non-zero if a blocker is found.
//
// Usage: node tools/qa-smoke.mjs [url] [outDir]

import { chromium } from "playwright";
import fs from "node:fs";

const URL = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "qa-shots";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const warnings = [];

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
  else if (m.type() === "warning") warnings.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const waitState = async (target, timeoutMs) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const i = await info();
    if (i && i.state === target) return true;
    await sleep(150);
  }
  return false;
};

const report = { phases: {}, metrics: {}, errors, warnings, verdict: "PASS", defects: [] };

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Loading
  await sleep(400);
  await page.screenshot({ path: `${OUT}/01-loading.png` });
  report.phases.loadingReached = !!(await info());

  // Dive (through cutscene)
  const reachedDive = await waitState("dive", 15000);
  report.phases.diveReached = reachedDive;
  if (!reachedDive) {
    report.verdict = "FAIL";
    report.defects.push("[blocker] never reached 'dive' state within 15s");
  }
  await sleep(300);
  await page.screenshot({ path: `${OUT}/02-dive-start.png` });

  // Simulate play: aim right of center, hold fire, strafe.
  const cx = 640;
  const cy = 360;
  await page.mouse.move(cx + 220, cy - 40);
  await page.mouse.down();
  await page.keyboard.down("KeyD");

  let maxBullets = 0;
  let maxEnemies = 0;
  let minHp = 1;
  let fpsSum = 0;
  let fpsN = 0;
  const samples = [];
  for (let k = 0; k < 24; k++) {
    // vary movement + aim to exercise dodging + collisions
    if (k === 6) {
      await page.keyboard.up("KeyD");
      await page.keyboard.down("KeyW");
    }
    if (k === 12) {
      await page.keyboard.up("KeyW");
      await page.keyboard.down("KeyA");
      await page.mouse.move(cx - 200, cy + 120);
    }
    if (k === 18) {
      await page.keyboard.up("KeyA");
      await page.keyboard.down("KeyS");
    }
    const i = await info();
    if (i) {
      maxBullets = Math.max(maxBullets, i.bullets);
      maxEnemies = Math.max(maxEnemies, i.enemies);
      minHp = Math.min(minHp, i.hp);
      if (i.fps > 0) {
        fpsSum += i.fps;
        fpsN++;
      }
      if (k % 6 === 0) samples.push(i);
    }
    if (k === 10) await page.screenshot({ path: `${OUT}/03-combat.png` });
    await sleep(250);
  }
  await page.keyboard.up("KeyS");
  await page.mouse.up();
  await page.screenshot({ path: `${OUT}/04-combat-late.png` });

  report.metrics = {
    avgFps: fpsN ? Math.round(fpsSum / fpsN) : 0,
    maxBullets,
    maxEnemies,
    minHp: Number(minHp.toFixed(2)),
    samples,
  };

  // Acceptance checks
  if (report.metrics.maxEnemies < 1) report.defects.push("[major] no enemies spawned during combat window");
  if (report.metrics.maxBullets < 1) report.defects.push("[major] no bullets active — combat may be dead");
  if (report.metrics.avgFps > 0 && report.metrics.avgFps < 45)
    report.defects.push(`[major] low fps: avg ${report.metrics.avgFps}`);
  if (errors.length) {
    report.verdict = "FAIL";
    report.defects.push(`[blocker] ${errors.length} console/page error(s)`);
  }
} catch (e) {
  report.verdict = "FAIL";
  report.defects.push("[blocker] harness threw: " + (e && e.message));
} finally {
  await browser.close();
}

if (report.verdict !== "FAIL" && report.defects.some((d) => d.includes("blocker"))) report.verdict = "FAIL";
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === "FAIL" ? 1 : 0);
