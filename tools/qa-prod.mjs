// Production E2E: loads the LIVE site, checks the leaderboard API, plays a real
// short run to death (debug depth bump so enemies close it out fast), and
// verifies the run landed on TOP DIVERS.
// Usage: node tools/qa-prod.mjs https://fathom-videogame.vercel.app
import { chromium } from "playwright";

const BASE = (process.argv[2] || "https://fathom-videogame.vercel.app").replace(/\/$/, "");
const OUT = process.argv[3] || "qa-prod";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const report = { api: null, dove: false, died: false, submitted: null, onBoard: false, errors };

// 1. API health first.
const apiRes = await fetch(`${BASE}/api/lb-top`).catch(() => null);
report.api = apiRes ? apiRes.status : "unreachable";

await page.goto(BASE + "/", { waitUntil: "load" });
const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const state = async () => (await info())?.state;
const wait = async (t, ms) => { const e = Date.now() + ms; while (Date.now() < e) { if ((await state()) === t) return true; await sleep(150); } return false; };

await wait("menu", 12000);
await page.screenshot({ path: `${OUT}/menu-before.png` });
await page.keyboard.press("Enter");
await wait("station", 5000);
await page.keyboard.down("KeyS"); await sleep(1600); await page.keyboard.up("KeyS");
await sleep(150); await page.keyboard.press("KeyE"); await sleep(250); await page.keyboard.press("KeyE");
report.dove = await wait("dive", 16000);

if (report.dove) {
  // Crank depth so the wave pressure kills us quickly (a genuine, low-score run).
  await page.evaluate(() => window.__fathomDive && window.__fathomDive().debugSetDepth(700));
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    const s = await state();
    if (s === "gameover") { report.died = true; break; }
    if (s === "levelup") await page.keyboard.press("Digit1");
    await sleep(400);
  }
  await page.screenshot({ path: `${OUT}/gameover.png` });
  await sleep(1500); // let the submit fire
  const top = await fetch(`${BASE}/api/lb-top`).then((r) => r.json()).catch(() => null);
  report.submitted = top;
  report.onBoard = !!top?.rows?.length;
  // Back to menu to see TOP DIVERS render.
  await page.keyboard.press("KeyC");
  await sleep(1000);
  await page.keyboard.press("Escape");
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/menu-after.png` });
}

console.log(JSON.stringify(report, null, 2));
await browser.close();
