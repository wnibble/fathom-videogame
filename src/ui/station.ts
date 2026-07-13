// Surface Station — the OVERWORLD hub. A weather forecast (the sea you'll dive
// into next) + three shops you work toward: OUTFITTER (pearls → permanent gear),
// MARKET (stratum materials → one-run boons), ARCHIVE (the codex you've filled).
// Keyboard + mouse; ←→ switch shop, ↑↓ select, Enter buy/launch.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";
import type { SaveData } from "../game/persistence";
import { META_UPGRADES, META_BY_ID, metaCost } from "../content/meta_upgrades";
import { BOONS } from "../content/boons";
import { SPECIES } from "../content/species";
import { pickBark } from "../content/story";
import type { Weather } from "../content/weather";
import { audio } from "../engine/audio";
import { type Overlay, panel } from "./overlays";

const CAT_COLOR: Record<string, number> = { offense: COLOR.amberBright, defense: COLOR.hpFull, utility: COLOR.aqua };
const TABS = ["OUTFITTER", "MARKET", "ARCHIVE"];

interface Row {
  root: Container;
  redraw: () => void;
  action: () => void;
}

export interface StationCallbacks {
  onLaunch: () => void;
  onBack: () => void;
  onBuy: (id: string) => SaveData; // meta upgrade
  onBuyBoon: (id: string) => SaveData; // market boon
}

function mk(s: string, size: number, color: number, weight: "normal" | "bold" = "normal"): Text {
  return new Text({ text: s, style: new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight }) });
}

export class StationOverlay implements Overlay {
  readonly root = new Container();
  private bgG = new Graphics();
  private panelG = new Graphics();
  private title = mk("SURFACE STATION", 24, COLOR.aquaBright, "bold");
  private currency = mk("", 15, COLOR.sample, "bold");
  private resourceLine = mk("", 12, COLOR.teal);
  private weatherLine = mk("", 15, COLOR.aquaBright, "bold");
  private weatherEffect = mk("", 12, COLOR.teal);
  private tabBar: Text[] = [];
  private bark = mk("", 13, COLOR.teal);
  private hint = mk("←→ shop · ↑↓ select · Enter buy/launch · Esc menu", 12, 0x5a7a9a);
  private rows: Row[] = [];
  private tab = 0;
  private sel = 0;

  constructor(private save: SaveData, lastBank: { pearlsEarned: number; newBadges: string[] } | null, private weather: Weather, private cbs: StationCallbacks) {
    this.root.addChild(this.bgG, this.panelG, this.title, this.currency, this.resourceLine, this.weatherLine, this.weatherEffect, this.bark, this.hint);
    this.currency.anchor.set(1, 0.5);
    this.resourceLine.anchor.set(1, 0);
    this.weatherLine.anchor.set(0.5, 0.5);
    this.weatherEffect.anchor.set(0.5, 0.5);
    this.bark.anchor.set(0.5, 0.5);
    this.hint.anchor.set(0.5, 0.5);
    this.bark.style.fontStyle = "italic";
    this.bark.text = pickBark(save.deepestStratum, save.codexSeen.length);
    for (const t of TABS) {
      const tt = mk(t, 14, COLOR.teal, "bold");
      tt.anchor.set(0.5, 0.5);
      tt.eventMode = "static";
      tt.cursor = "pointer";
      const i = this.tabBar.length;
      tt.on("pointerdown", () => this.setTab(i));
      this.tabBar.push(tt);
      this.root.addChild(tt);
    }
    if (lastBank && (lastBank.pearlsEarned > 0 || lastBank.newBadges.length)) {
      this.title.text = `SURFACE STATION   —   banked ◈ +${lastBank.pearlsEarned}${lastBank.newBadges.length ? "  ★ new badge!" : ""}`;
    }
    this.buildRows();
  }

  // ---- shop content ----
  private buildRows(): void {
    for (const r of this.rows) r.root.destroy({ children: true });
    this.rows = [];
    if (this.tab === 0) this.buildOutfitter();
    else if (this.tab === 1) this.buildMarket();
    else this.buildArchive();
    // persistent action rows
    this.addAction("▶  LAUNCH DIVE", COLOR.aquaBright, () => this.cbs.onLaunch());
    this.addAction("BACK", COLOR.teal, () => this.cbs.onBack());
    this.sel = Math.min(this.sel, this.rows.length - 1);
  }

  private storeRow(build: (bg: Graphics, on: boolean) => void, action: () => void): Row {
    const root = new Container();
    const bg = new Graphics();
    root.addChild(bg);
    root.eventMode = "static";
    root.cursor = "pointer";
    const idx = this.rows.length;
    root.on("pointerover", () => this.select(idx));
    root.on("pointerdown", () => this.activate());
    const redraw = () => build(bg, this.sel === idx);
    const row: Row = { root, redraw, action };
    this.rows.push(row);
    this.root.addChild(root);
    return row;
  }

  private buildOutfitter(): void {
    for (const u of META_UPGRADES) {
      const name = mk("", 15, CAT_COLOR[u.category], "bold");
      const desc = mk("", 12, COLOR.teal);
      const cost = mk("", 13, COLOR.sample, "bold");
      const pips = new Graphics();
      name.anchor.set(0, 0.5); desc.anchor.set(0, 0.5); cost.anchor.set(1, 0.5);
      const row = this.storeRow((bg, on) => {
        const tier = this.save.metaTiers[u.id] ?? 0;
        const gated = u.requires && (this.save.metaTiers[u.requires] ?? 0) < 1;
        const maxed = tier >= u.maxTier;
        const nextCost = metaCost(u, tier);
        const afford = this.save.pearls >= nextCost && !maxed && !gated;
        bg.clear();
        bg.roundRect(0, 0, 520, 40, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 }).stroke({ width: on ? 2 : 1, color: CAT_COLOR[u.category] });
        name.text = `${u.icon}  ${u.name}`;
        desc.text = gated ? `needs ${META_BY_ID[u.requires!].name}` : u.desc;
        desc.style.fill = gated ? COLOR.coralBright : COLOR.teal;
        cost.text = maxed ? "MAX" : `◈ ${nextCost}`;
        cost.style.fill = maxed ? COLOR.teal : afford ? COLOR.sample : 0x5a6a7a;
        pips.clear();
        for (let t = 0; t < u.maxTier; t++) pips.circle(212 + t * 13, 20, 3.5).fill({ color: t < tier ? CAT_COLOR[u.category] : COLOR.deepNavy }).stroke({ width: 1, color: CAT_COLOR[u.category] });
        name.position.set(14, 13); desc.position.set(14, 28); cost.position.set(506, 20);
      }, () => { this.save = this.cbs.onBuy(u.id); this.refresh(); });
      row.root.addChild(pips, name, desc, cost);
    }
  }

  private buildMarket(): void {
    for (const b of BOONS) {
      const name = mk("", 15, COLOR.amberBright, "bold");
      const desc = mk("", 12, COLOR.teal);
      const cost = mk("", 13, COLOR.sample, "bold");
      name.anchor.set(0, 0.5); desc.anchor.set(0, 0.5); cost.anchor.set(1, 0.5);
      const row = this.storeRow((bg, on) => {
        const have = this.save.resources[b.resource] ?? 0;
        const afford = have >= b.cost;
        const queued = this.save.pendingBoons.filter((x) => x === b.id).length;
        bg.clear();
        bg.roundRect(0, 0, 520, 40, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 }).stroke({ width: on ? 2 : 1, color: COLOR.amberBright });
        name.text = `${b.icon}  ${b.name}${queued ? `  ×${queued}` : ""}`;
        desc.text = b.desc;
        cost.text = `${b.cost} ${b.resource}`;
        cost.style.fill = afford ? COLOR.sample : 0x5a6a7a;
        name.position.set(14, 13); desc.position.set(14, 28); cost.position.set(506, 20);
      }, () => { this.save = this.cbs.onBuyBoon(b.id); this.refresh(); });
      row.root.addChild(name, desc, cost);
    }
  }

  private buildArchive(): void {
    const owned = new Set(this.save.codexSeen);
    for (const sp of SPECIES) {
      const known = owned.has(sp.key);
      const name = mk("", 14, known ? COLOR.aquaBright : 0x4a5a6a, "bold");
      const lore = mk("", 11, known ? COLOR.teal : 0x3a4a5a);
      name.anchor.set(0, 0.5); lore.anchor.set(0, 0.5);
      const row = this.storeRow((bg, on) => {
        bg.clear();
        bg.roundRect(0, 0, 520, 40, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: known ? COLOR.aqua : COLOR.navy });
        name.text = known ? `S${sp.stratum + 1}  ${sp.name}` : `S${sp.stratum + 1}  ??? — not yet catalogued`;
        lore.text = known ? sp.lore.slice(0, 92) : "scan its kind with a research probe to learn more.";
        name.position.set(14, 13); lore.position.set(14, 28);
      }, () => {});
      row.root.addChild(name, lore);
    }
  }

  private addAction(text: string, color: number, action: () => void): void {
    const root = new Container();
    const bg = new Graphics();
    const t = mk(text, 16, color, "bold");
    t.anchor.set(0.5, 0.5);
    root.addChild(bg, t);
    root.eventMode = "static";
    root.cursor = "pointer";
    const idx = this.rows.length;
    root.on("pointerover", () => this.select(idx));
    root.on("pointerdown", () => this.activate());
    const redraw = () => {
      const on = this.sel === idx;
      bg.clear();
      bg.roundRect(-125, -20, 250, 40, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 }).stroke({ width: on ? 2 : 1, color });
      t.style.fill = color;
    };
    this.rows.push({ root, redraw, action });
    this.root.addChild(root);
  }

  // ---- interaction ----
  private select(i: number): void {
    this.sel = (i + this.rows.length) % this.rows.length;
    for (const r of this.rows) r.redraw();
  }
  move(d: number): void {
    this.select(this.sel + d);
    audio.uiMove();
  }
  setTab(i: number): void {
    this.tab = (i + TABS.length) % TABS.length;
    this.sel = 0;
    this.buildRows();
    this.layoutRows();
    this.refresh();
    audio.uiMove();
  }
  switchTab(d: number): void {
    this.setTab(this.tab + d);
  }
  activate(): void {
    audio.uiConfirm();
    this.rows[this.sel]?.action();
  }
  private refresh(): void {
    this.currency.text = `◈ ${this.save.pearls}`;
    const res = Object.entries(this.save.resources).filter(([, n]) => n > 0);
    this.resourceLine.text = res.length ? res.map(([k, n]) => `${k} ${n}`).join("   ") : "no materials yet";
    for (const r of this.rows) r.redraw();
    this.tabBar.forEach((t, i) => (t.style.fill = i === this.tab ? COLOR.aquaBright : COLOR.navy));
  }

  private lastW = 1280;
  private lastH = 720;
  private layoutRows(): void {
    const w = this.lastW;
    const py = this.lastH / 2 - this.panelH() / 2;
    const rowX = w / 2 - 260;
    let y = py + 128;
    const content = this.rows.length - 2;
    for (let i = 0; i < content; i++) {
      this.rows[i].root.position.set(rowX, y);
      y += 44;
    }
    this.rows[content].root.position.set(w / 2 - 145, y + 10);
    this.rows[content + 1].root.position.set(w / 2 + 145, y + 10);
    this.bark.position.set(w / 2, y + 44);
    this.hint.position.set(w / 2, py + this.panelH() - 14);
  }
  private panelH(): number {
    const content = Math.max(META_UPGRADES.length, SPECIES.length, BOONS.length);
    return Math.min(this.lastH * 0.94, 230 + content * 44);
  }

  layout(w: number, h: number): void {
    this.lastW = w;
    this.lastH = h;
    this.bgG.clear();
    this.bgG.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.72 });
    const pw = Math.min(600, w * 0.94);
    const ph = this.panelH();
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    this.panelG.clear();
    panel(this.panelG, px, py, pw, ph, COLOR.aqua);
    this.title.position.set(px + 20, py + 24);
    this.currency.position.set(px + pw - 20, py + 22);
    this.resourceLine.position.set(px + pw - 20, py + 34);
    // weather forecast band
    this.weatherLine.position.set(w / 2, py + 58);
    this.weatherEffect.position.set(w / 2, py + 76);
    this.weatherLine.text = `${this.weather.icon}  ${this.weather.name.toUpperCase()}`;
    this.weatherEffect.text = `+ ${this.weather.bonus}     –  ${this.weather.penalty}`;
    // tab bar
    this.tabBar.forEach((t, i) => t.position.set(w / 2 - 160 + i * 160, py + 102));
    this.layoutRows();
    this.refresh();
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}
