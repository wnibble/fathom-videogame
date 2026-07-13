// Targeted Cradle-boss check: reach a dive, warp to the floor, confirm the
// guardian + HP bar, fight briefly, then debug-kill it and confirm the win flow
// (victory card -> gameover with won=true).
import { chromium } from "playwright";
const URL = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "qa-boss";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text()); });
await page.goto(URL, { waitUntil: "load" });
const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const state = async () => (await info())?.state;
const waitState = async (t, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await state()) === t) return true; await sleep(120); } return false; };

await waitState("menu", 8000);
await page.keyboard.press("Enter");
await waitState("station", 4000);
// Swim into the launch vent to dive.
await page.keyboard.down("KeyS"); await sleep(1600); await page.keyboard.up("KeyS");
await sleep(120); await page.keyboard.press("KeyE"); await sleep(200); await page.keyboard.press("KeyE");
const dove = await waitState("dive", 16000);

// Warp to the Cradle + summon the guardian.
await page.evaluate(() => window.__fathomDive && window.__fathomDive().debugToCradle());
await sleep(2500);
const bossAlive = await page.evaluate(() => window.__fathomDive && window.__fathomDive().bossAlive);
await page.screenshot({ path: `${OUT}/boss.png` });

// Let it attack a moment (also move so we're not standing still).
await page.keyboard.down("KeyA"); await sleep(400); await page.keyboard.up("KeyA");
await sleep(1500);
await page.screenshot({ path: `${OUT}/boss-fight.png` });

// Debug-kill the boss and confirm the win sequence + gameover.
await page.evaluate(() => window.__fathomDive && window.__fathomDive().debugKillBoss());
await sleep(1200);
await page.screenshot({ path: `${OUT}/win-card.png` });
const reachedGameover = await waitState("gameover", 8000);
await page.screenshot({ path: `${OUT}/win-gameover.png` });

console.log(JSON.stringify({ dove, bossAlive, reachedGameover, errors }, null, 2));
await browser.close();
