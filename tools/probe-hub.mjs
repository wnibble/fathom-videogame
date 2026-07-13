import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-webgl","--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", e => console.log("ERR", String(e)));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "load" });
const info = async () => page.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const state = async () => (await info())?.state;
const wait = async (t,ms)=>{const e=Date.now()+ms;while(Date.now()<e){if(await state()===t)return true;await sleep(120)}return false};
await wait("menu",8000); await page.keyboard.press("Enter"); await wait("station",4000); await sleep(600);
await page.screenshot({ path: "qa-hub/deck.png" });
// pan around a bit
await page.keyboard.down("KeyW"); await sleep(700); await page.keyboard.up("KeyW");
await page.screenshot({ path: "qa-hub/deck-up.png" });
await page.keyboard.down("KeyD"); await sleep(900); await page.keyboard.up("KeyD");
await page.screenshot({ path: "qa-hub/deck-right.png" });
await b.close(); console.log("done");
