// Surface Station — the between-dive hub. Bank pearls, buy permanent upgrades that
// seed every future run, view earned badges, launch the next dive. Keyboard + mouse.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";
import type { SaveData } from "../game/persistence";
import { META_UPGRADES, META_BY_ID, metaCost } from "../content/meta_upgrades";
import { BADGES } from "../content/badges";
import { SPECIES } from "../content/species";
import { pickBark } from "../content/story";
import { audio } from "../engine/audio";
import { type Overlay, panel } from "./overlays";

const CAT_COLOR: Record<string, number> = { offense: COLOR.amberBright, defense: COLOR.hpFull, utility: COLOR.aqua };

interface Row {
  root: Container;
  bg: Graphics;
  redraw: () => void;
  action: () => void;
}

export interface StationCallbacks {
  onLaunch: () => void;
  onBack: () => void;
  onBuy: (id: string) => SaveData; // returns updated save
}

export class StationOverlay implements Overlay {
  readonly root = new Container();
  private bgG = new Graphics();
  private panelG = new Graphics();
  private title = mk("SURFACE STATION", 26, COLOR.aquaBright, "bold");
  private pearlsText = mk("", 18, COLOR.sample, "bold");
  private bark = mk("", 13, COLOR.teal, "normal");
  private hint = mk("↑↓ select · Enter buy/launch · Esc menu", 12, 0x5a7a9a);
  private rows: Row[] = [];
  private badgeText: Text;
  private sel = 0;

  constructor(private save: SaveData, lastBank: { pearlsEarned: number; newBadges: string[] } | null, private cbs: StationCallbacks) {
    this.root.addChild(this.bgG, this.panelG, this.title, this.pearlsText, this.bark, this.hint);
    this.bark.text = pickBark(save.deepestStratum, save.codexSeen.length);
    this.bark.style.fontStyle = "italic";
    this.bark.anchor.set(0.5, 0.5);
    if (lastBank && (lastBank.pearlsEarned > 0 || lastBank.newBadges.length)) {
      this.title.text = `SURFACE STATION   —   banked ◈ +${lastBank.pearlsEarned}${lastBank.newBadges.length ? "  ★ new badge!" : ""}`;
    }
    this.badgeText = mk("", 13, COLOR.teal);
    this.title.anchor.set(0, 0.5);
    this.pearlsText.anchor.set(1, 0.5);
    this.hint.anchor.set(0.5, 0.5);

    // store rows
    for (const u of META_UPGRADES) {
      const root = new Container();
      const bg = new Graphics();
      const name = mk("", 15, COLOR.aquaBright, "bold");
      const desc = mk("", 12, COLOR.teal);
      const cost = mk("", 13, COLOR.sample, "bold");
      name.anchor.set(0, 0.5);
      desc.anchor.set(0, 0.5);
      cost.anchor.set(1, 0.5);
      const pips = new Graphics();
      root.addChild(bg, pips, name, desc, cost);
      root.eventMode = "static";
      root.cursor = "pointer";
      const idx = this.rows.length;
      root.on("pointerover", () => this.select(idx));
      root.on("pointerdown", () => this.activate());
      const redraw = () => {
        const tier = this.save.metaTiers[u.id] ?? 0;
        const on = this.sel === idx;
        const gated = u.requires && (this.save.metaTiers[u.requires] ?? 0) < 1;
        const maxed = tier >= u.maxTier;
        const nextCost = metaCost(u, tier);
        const afford = this.save.pearls >= nextCost && !maxed && !gated;
        bg.clear();
        bg.roundRect(0, 0, 520, 42, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 }).stroke({ width: on ? 2 : 1, color: CAT_COLOR[u.category] });
        name.text = `${u.icon}  ${u.name}`;
        name.style.fill = CAT_COLOR[u.category];
        desc.text = gated ? `needs ${META_BY_ID[u.requires!].name}` : u.desc;
        desc.style.fill = gated ? COLOR.coralBright : COLOR.teal;
        cost.text = maxed ? "MAX" : afford ? `◈ ${nextCost}` : `◈ ${nextCost}`;
        cost.style.fill = maxed ? COLOR.teal : afford ? COLOR.sample : 0x5a6a7a;
        // tier pips
        pips.clear();
        for (let t = 0; t < u.maxTier; t++) {
          const px = 210 + t * 14;
          pips.circle(px, 21, 4).fill({ color: t < tier ? CAT_COLOR[u.category] : COLOR.deepNavy, alpha: 1 }).stroke({ width: 1, color: CAT_COLOR[u.category] });
        }
        name.position.set(14, 14);
        desc.position.set(14, 30);
        cost.position.set(506, 21);
      };
      this.rows.push({
        root,
        bg,
        redraw,
        action: () => {
          this.save = this.cbs.onBuy(u.id);
          this.refresh();
        },
      });
      this.root.addChild(root);
    }
    // action rows: launch, back
    this.addAction("▶  LAUNCH DIVE", COLOR.aquaBright, () => this.cbs.onLaunch());
    this.addAction("BACK", COLOR.teal, () => this.cbs.onBack());
    this.root.addChild(this.badgeText);
    this.select(0);
  }

  private addAction(text: string, color: number, action: () => void): void {
    const root = new Container();
    const bg = new Graphics();
    const t = mk(text, 17, color, "bold");
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
      bg.roundRect(-130, -21, 260, 42, 8).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 }).stroke({ width: on ? 2 : 1, color });
      t.style.fill = color;
    };
    this.rows.push({ root, bg, redraw, action });
    this.root.addChild(root);
  }

  private select(i: number): void {
    this.sel = (i + this.rows.length) % this.rows.length;
    for (const r of this.rows) r.redraw();
    audio.uiMove();
  }
  move(d: number): void {
    this.select(this.sel + d);
  }
  activate(): void {
    audio.uiConfirm();
    this.rows[this.sel]?.action();
  }
  private refresh(): void {
    this.pearlsText.text = `◈ ${this.save.pearls} pearls`;
    for (const r of this.rows) r.redraw();
    this.drawBadges();
  }
  private drawBadges(): void {
    const owned = new Set(this.save.badges);
    this.badgeText.text =
      "BADGES  " + BADGES.map((b) => (owned.has(b.id) ? b.icon : "·")).join(" ") +
      `  (${owned.size}/${BADGES.length})   ·   CODEX ${this.save.codexSeen.length}/${SPECIES.length}`;
  }

  layout(w: number, h: number): void {
    scrimFill(this.bgG, w, h);
    const pw = Math.min(600, w * 0.94);
    const ph = Math.min(h * 0.9, 200 + META_UPGRADES.length * 50);
    const px = w / 2 - pw / 2;
    const py = h / 2 - ph / 2;
    this.panelG.clear();
    panel(this.panelG, px, py, pw, ph, COLOR.aqua);
    this.title.position.set(px + 20, py + 26);
    this.pearlsText.text = `◈ ${this.save.pearls} pearls`;
    this.pearlsText.position.set(px + pw - 20, py + 26);

    const rowX = w / 2 - 260;
    let y = py + 60;
    for (let i = 0; i < META_UPGRADES.length; i++) {
      this.rows[i].root.position.set(rowX, y);
      y += 48;
    }
    // action rows centered
    this.rows[META_UPGRADES.length].root.position.set(w / 2 - 140, y + 8);
    this.rows[META_UPGRADES.length + 1].root.position.set(w / 2 + 150, y + 8);
    this.bark.position.set(w / 2, y + 42);
    this.badgeText.anchor.set(0.5, 0.5);
    this.badgeText.position.set(w / 2, y + 66);
    this.hint.position.set(w / 2, py + ph - 14);
    this.refresh();
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

function mk(s: string, size: number, color: number, weight: "normal" | "bold" = "normal"): Text {
  return new Text({ text: s, style: new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight }) });
}
function scrimFill(g: Graphics, w: number, h: number): void {
  g.clear();
  g.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.72 });
}
