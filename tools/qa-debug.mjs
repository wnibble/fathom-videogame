import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("console", (m) => console.log(`[console.${m.type()}]`, m.text()));
p.on("pageerror", (e) => console.log("[PAGEERROR]", e.message, "\n", (e.stack || "").split("\n").slice(0, 6).join("\n")));
const info = async () => p.evaluate(() => (window.__fathom && window.__fathom.info) || null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = async (s, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = await info(); if (i && i.state === s) return true; await sleep(100); } return false; };
await p.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
console.log("menu:", await wait("menu", 15000));
await p.keyboard.press("Enter");
console.log("station:", await wait("station", 5000));
for (let i = 0; i < 10; i++) { await p.keyboard.press("ArrowDown"); await sleep(50); }
await p.keyboard.press("Enter");
for (let k = 0; k < 16; k++) { await sleep(400); const i = await info(); console.log(`t${k}: state=${i?.state} stratum=${i?.stratum} depth=${i?.depth} enemies=${i?.enemies}`); }
await b.close();
