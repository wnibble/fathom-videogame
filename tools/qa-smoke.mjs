// Headless QA smoke (pass 3): loads the build, navigates menu→dive, plays,
// exercises a level-up + pause, tests a resize, and reports errors + metrics.
import { chromium } from "playwright";
import fs from "node:fs";

const URL = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "qa-shots";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const waitState = async (t, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const i = await info();
    if (i && i.state === t) return true;
    await sleep(120);
  }
  return false;
};
const report = { phases: {}, metrics: {}, errors, verdict: "PASS", defects: [] };

try {
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  report.phases.menuReached = await waitState("menu", 15000);
  await page.screenshot({ path: `${OUT}/01-menu.png` });
  if (!report.phases.menuReached) {
    report.defects.push("[blocker] never reached main menu");
    report.verdict = "FAIL";
  }

  // Menu → Surface Station
  await page.keyboard.press("Enter");
  report.phases.stationReached = await waitState("station", 5000);
  await page.screenshot({ path: `${OUT}/01b-station.png` });
  // Navigate to LAUNCH DIVE (below the 10 store rows) and confirm.
  for (let i = 0; i < 10; i++) { await page.keyboard.press("ArrowDown"); await sleep(40); }
  await page.keyboard.press("Enter");
  report.phases.diveReached = await waitState("dive", 12000); // through cold-open cutscene
  await page.screenshot({ path: `${OUT}/02-dive.png` });
  if (!report.phases.diveReached) {
    report.defects.push("[blocker] never reached dive from menu");
    report.verdict = "FAIL";
  }
  // Jump depth so the deeper content (Darters, elites, scaling) is exercised.
  await page.evaluate(() => {
    const d = window.__fathomDive && window.__fathomDive();
    if (d) d.debugSetDepth(240);
  });

  // Play: move + aim + fire; handle a level-up if it pops.
  await page.mouse.move(860, 320);
  await page.mouse.down();
  await page.keyboard.down("KeyD");
  let maxScore = 0, maxLevel = 1, maxEnemies = 0, maxBullets = 0, minHp = 1, fpsSum = 0, fpsN = 0, sawLevelUp = false, maxDarters = 0, sawDarter = false;
  for (let k = 0; k < 56; k++) {
    if (k === 12) { await page.keyboard.up("KeyD"); await page.keyboard.down("KeyW"); await page.mouse.move(520, 300); }
    if (k === 24) { await page.keyboard.up("KeyW"); await page.keyboard.down("KeyA"); await page.mouse.move(500, 460); }
    if (k === 36) { await page.keyboard.up("KeyA"); await page.keyboard.down("KeyS"); }
    if (k === 20) await page.keyboard.press("ShiftLeft"); // dash
    const i = await info();
    if (i) {
      if (i.state === "levelup") {
        if (!sawLevelUp) await page.screenshot({ path: `${OUT}/06-levelup.png` });
        sawLevelUp = true;
        await page.keyboard.press("Digit1");
        await sleep(150);
      }
      maxScore = Math.max(maxScore, i.score || 0);
      maxLevel = Math.max(maxLevel, i.level || 1);
      maxEnemies = Math.max(maxEnemies, i.enemies || 0);
      maxBullets = Math.max(maxBullets, i.bullets || 0);
      maxDarters = Math.max(maxDarters, i.darters || 0);
      if ((i.darters || 0) > 0 && !sawDarter) {
        sawDarter = true;
        await page.screenshot({ path: `${OUT}/07-darter.png` });
      }
      if (i.hp < minHp) minHp = i.hp;
      if (i.fps > 0) { fpsSum += i.fps; fpsN++; }
    }
    if (k === 18) await page.screenshot({ path: `${OUT}/03-combat.png` });
    await sleep(220);
  }
  await page.keyboard.up("KeyS");
  await page.mouse.up();
  report.phases.sawLevelUp = sawLevelUp;

  // Pause test
  await page.keyboard.press("Escape");
  const paused = await waitState("pause", 2000);
  report.phases.pauseWorks = paused;
  await page.screenshot({ path: `${OUT}/04-pause.png` });
  await page.keyboard.press("Escape"); // resume
  await sleep(200);

  // Resize test — enlarge and screenshot to check responsive overlays/HUD
  await page.setViewportSize({ width: 1600, height: 900 });
  await sleep(400);
  await page.screenshot({ path: `${OUT}/05-resized.png` });

  report.metrics = {
    avgFps: fpsN ? Math.round(fpsSum / fpsN) : 0,
    maxScore, maxLevel, maxEnemies, maxBullets, maxDarters, minHp: Number(minHp.toFixed(2)), sawLevelUp,
  };
  if (maxScore < 1) report.defects.push("[major] score never increased — combat/scoring may be dead");
  if (maxEnemies < 1) report.defects.push("[major] no enemies spawned");
  if (maxDarters < 1) report.defects.push("[minor] no Darters spawned at depth 240 (check darter mix)");
  if (!paused) report.defects.push("[major] pause (Esc) did not work");
  if (errors.length) { report.verdict = "FAIL"; report.defects.push(`[blocker] ${errors.length} console/page error(s)`); }
} catch (e) {
  report.verdict = "FAIL";
  report.defects.push("[blocker] harness threw: " + (e && e.message));
} finally {
  await browser.close();
}
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === "FAIL" ? 1 : 0);
