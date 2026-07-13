// Targeted hub check: enter the walkable station, swim UP to the MARKET kiosk,
// press E to open the shop overlay, screenshot, Escape back to walking.
import { chromium } from "playwright";
const URL = process.argv[2] || "http://127.0.0.1:5173/";
const OUT = process.argv[3] || "qa-hub-shop";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: "load" });
const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const waitState = async (t, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if ((await info())?.state === t) return true; await sleep(120); } return false; };
await waitState("menu", 8000);
console.log("menu reached");
await page.keyboard.press("Enter"); // menu -> station
await waitState("station", 4000);
console.log("after Enter:", (await info())?.state);
// Swim up to the MARKET kiosk (dead ahead, above the start).
await page.keyboard.down("KeyW"); await sleep(650); await page.keyboard.up("KeyW");
await sleep(200);
console.log("after swim up:", (await info())?.state);
await page.keyboard.press("KeyE"); await sleep(150);
console.log("after 1st E:", (await info())?.state);
await page.keyboard.press("KeyE");
await sleep(500);
await page.screenshot({ path: `${OUT}/shop-open.png` });
const stateAtShop = (await info())?.state;
await page.keyboard.press("Escape"); // close shop -> walk
await sleep(400);
await page.screenshot({ path: `${OUT}/back-to-walk.png` });
console.log(JSON.stringify({ stateAtShop, errors }, null, 2));
await browser.close();
