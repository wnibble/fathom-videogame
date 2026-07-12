// Full-screen overlays: main menu, pause, game-over, level-up. All responsive via
// layout(w,h) — redrawn on resize so nothing is mis-sized (the reported bug).
// Buttons work by mouse (Pixi events) AND keyboard (selection model driven by main).

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";
import type { UpgradeChoice } from "../game/progression";
import type { Settings } from "../game/persistence";

export interface Overlay {
  root: Container;
  layout(w: number, h: number): void;
  destroy(): void;
}

const font = (size: number, color: number, weight: "normal" | "bold" = "normal", extra: Partial<TextStyle> = {}) =>
  new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight, ...extra });
function txt(s: string, size: number, color: number, weight: "normal" | "bold" = "normal"): Text {
  const t = new Text({ text: s, style: font(size, color, weight) });
  t.anchor.set(0.5);
  return t;
}
function scrim(g: Graphics, w: number, h: number, alpha = 0.72): void {
  g.clear();
  g.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha });
}

class Button {
  readonly root = new Container();
  private bg = new Graphics();
  private label: Text;
  w = 280;
  h = 46;
  selected = false;
  constructor(text: string, public onClick: () => void) {
    this.label = txt(text, 18, COLOR.teal, "bold");
    this.root.addChild(this.bg, this.label);
    this.root.eventMode = "static";
    this.root.cursor = "pointer";
    this.root.on("pointerover", () => this.setSelected(true));
    this.root.on("pointerout", () => this.setSelected(false));
    this.root.on("pointerdown", () => this.onClick());
    this.redraw();
  }
  setText(s: string): void {
    this.label.text = s;
  }
  setSelected(v: boolean): void {
    this.selected = v;
    this.redraw();
  }
  private redraw(): void {
    this.bg.clear();
    this.bg
      .roundRect(-this.w / 2, -this.h / 2, this.w, this.h, 8)
      .fill({ color: this.selected ? COLOR.navy : COLOR.deepNavy, alpha: 0.95 })
      .stroke({ width: this.selected ? 2 : 1, color: this.selected ? COLOR.aqua : COLOR.navy });
    this.label.style.fill = this.selected ? COLOR.aquaBright : COLOR.teal;
  }
  at(x: number, y: number): void {
    this.root.position.set(x, y);
  }
}

// ---- a menu with keyboard selection over a button list ----
abstract class ButtonMenu implements Overlay {
  readonly root = new Container();
  protected bgG = new Graphics();
  protected buttons: Button[] = [];
  protected sel = 0;
  constructor() {
    this.root.addChild(this.bgG);
  }
  protected addButton(text: string, onClick: () => void): Button {
    const b = new Button(text, onClick);
    b.root.on("pointerover", () => (this.sel = this.buttons.indexOf(b)));
    this.buttons.push(b);
    this.root.addChild(b.root);
    return b;
  }
  move(delta: number): void {
    this.buttons[this.sel]?.setSelected(false);
    this.sel = (this.sel + delta + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => b.setSelected(i === this.sel));
  }
  activate(): void {
    this.buttons[this.sel]?.onClick();
  }
  abstract layout(w: number, h: number): void;
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

export class MenuOverlay extends ButtonMenu {
  private title = txt("FATHOM", 60, COLOR.aquaBright, "bold");
  private tagline = txt("a small light in a vast dark", 15, COLOR.teal);
  private stats: Text;
  private settingsLine: Text;
  constructor(
    best: number,
    bestScore: number,
    private settings: Settings,
    cbs: { onDive: () => void; onHowTo: () => void; onToggleMotion: () => void; onToggleShake: () => void }
  ) {
    super();
    this.title.style.letterSpacing = 10;
    this.stats = txt("", 14, COLOR.amber);
    this.settingsLine = txt("", 13, COLOR.teal);
    this.root.addChild(this.title, this.tagline, this.stats, this.settingsLine);
    this.addButton("DIVE", cbs.onDive);
    this.addButton("HOW TO PLAY", cbs.onHowTo);
    this.addButton("", () => {
      cbs.onToggleMotion();
      this.refreshSettings();
    });
    this.addButton("", () => {
      cbs.onToggleShake();
      this.refreshSettings();
    });
    this.buttons[0].setSelected(true);
    this.refreshSettings();
    this.stats.text = `BEST  ${Math.floor(best)} m   ·   HIGH SCORE  ${Math.floor(bestScore)}`;
  }
  private refreshSettings(): void {
    this.buttons[2].setText(`REDUCED MOTION: ${this.settings.reducedMotion ? "ON" : "OFF"}`);
    this.buttons[3].setText(`SCREEN SHAKE: ${this.settings.screenShake ? "ON" : "OFF"}`);
  }
  layout(w: number, h: number): void {
    scrim(this.bgG, w, h, 0.6);
    const cx = w / 2;
    this.title.position.set(cx, h * 0.2);
    this.tagline.position.set(cx, h * 0.2 + 46);
    this.stats.position.set(cx, h * 0.2 + 78);
    let y = h * 0.44;
    for (const b of this.buttons) {
      b.at(cx, y);
      y += 58;
    }
    this.settingsLine.position.set(cx, y + 6);
  }
}

export class PauseOverlay extends ButtonMenu {
  private title = txt("PAUSED", 34, COLOR.aquaBright, "bold");
  constructor(cbs: { onResume: () => void; onRestart: () => void; onQuit: () => void }) {
    super();
    this.root.addChild(this.title);
    this.addButton("RESUME", cbs.onResume);
    this.addButton("RESTART DIVE", cbs.onRestart);
    this.addButton("QUIT TO MENU", cbs.onQuit);
    this.buttons[0].setSelected(true);
  }
  layout(w: number, h: number): void {
    scrim(this.bgG, w, h, 0.7);
    const cx = w / 2;
    this.title.position.set(cx, h * 0.32);
    let y = h * 0.44;
    for (const b of this.buttons) {
      b.at(cx, y);
      y += 58;
    }
  }
}

export class HowToOverlay extends ButtonMenu {
  private lines: Text[];
  constructor(onBack: () => void) {
    super();
    const L = [
      ["HOW TO DIVE", 26, COLOR.aquaBright],
      ["WASD / arrows — swim (weighty drift)", 16, COLOR.teal],
      ["Mouse — aim   ·   Click / Space — fire", 16, COLOR.teal],
      ["Shift — dash (brief invulnerability)", 16, COLOR.teal],
      ["Cool light is yours. Warm light is danger — it always telegraphs.", 15, COLOR.amber],
      ["Shoot pods & crystals, scan probes, find hidden relics for level-ups.", 15, COLOR.sample],
      ["Level up to pick upgrades. Go deep. Don't get hit — combo is score.", 15, COLOR.teal],
    ] as const;
    this.lines = L.map(([s, sz, c]) => txt(s as string, sz as number, c as number, sz === 26 ? "bold" : "normal"));
    this.lines.forEach((t) => this.root.addChild(t));
    this.addButton("BACK", onBack);
    this.buttons[0].setSelected(true);
  }
  layout(w: number, h: number): void {
    scrim(this.bgG, w, h, 0.8);
    const cx = w / 2;
    let y = h * 0.22;
    for (const t of this.lines) {
      t.position.set(cx, y);
      y += t.style.fontSize === 26 ? 46 : 30;
    }
    this.buttons[0].at(cx, y + 20);
  }
}

export interface GameOverData {
  depth: number;
  score: number;
  samplesLost: number;
  kills: number;
  level: number;
  relics: number;
  prevBestDepth: number;
  prevBestScore: number;
}
export class GameOverOverlay implements Overlay {
  readonly root = new Container();
  private bgG = new Graphics();
  private panelG = new Graphics();
  private texts: Text[] = [];
  constructor(d: GameOverData) {
    this.root.addChild(this.bgG, this.panelG);
    const recDepth = d.depth > d.prevBestDepth;
    const recScore = d.score > d.prevBestScore;
    const add = (s: string, size: number, c: number, w: "normal" | "bold" = "normal") => {
      const t = txt(s, size, c, w);
      this.texts.push(t);
      this.root.addChild(t);
      return t;
    };
    add("YOU SURFACED", 30, COLOR.aquaBright, "bold");
    add(recScore ? "★ NEW HIGH SCORE ★" : recDepth ? "★ NEW DEEPEST DIVE ★" : "you carried this back", 15, recScore || recDepth ? COLOR.amberBright : COLOR.teal);
    add(`SCORE   ${Math.floor(d.score)}`, 22, COLOR.amberBright, "bold");
    add(`DEPTH ${Math.floor(d.depth)} m    ·    LV ${d.level}    ·    ${d.kills} kills    ·    ${d.relics} relics`, 15, COLOR.teal);
    add(`◈ ${d.samplesLost} samples lost to the deep`, 14, COLOR.coralBright);
    add("press any key to return to the surface", 13, 0x5a7a9a);
  }
  layout(w: number, h: number): void {
    scrim(this.bgG, w, h, 0.55);
    const pw = Math.min(520, w * 0.9);
    const ph = 300;
    this.panelG.clear();
    this.panelG.roundRect(w / 2 - pw / 2, h / 2 - ph / 2, pw, ph, 12).fill({ color: COLOR.deepNavy, alpha: 0.96 }).stroke({ width: 2, color: COLOR.navy });
    const ys = [-108, -74, -30, 8, 40, 96];
    this.texts.forEach((t, i) => t.position.set(w / 2, h / 2 + ys[i]));
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

const CAT_COLOR: Record<string, number> = { offense: COLOR.amberBright, defense: COLOR.hpFull, utility: COLOR.aqua };

export class LevelUpOverlay implements Overlay {
  readonly root = new Container();
  private bgG = new Graphics();
  private title: Text;
  private cards: { root: Container; bg: Graphics }[] = [];
  sel = 0;
  constructor(level: number, private choices: UpgradeChoice[], private onPick: (id: string) => void) {
    this.title = txt(`LEVEL ${level} — choose an upgrade`, 24, COLOR.aquaBright, "bold");
    this.root.addChild(this.bgG, this.title);
    choices.forEach((ch, i) => {
      const c = new Container();
      const bg = new Graphics();
      const name = txt(ch.name, 18, CAT_COLOR[ch.category] ?? COLOR.aquaBright, "bold");
      const desc = txt(ch.desc, 14, COLOR.teal);
      const cat = txt(ch.category.toUpperCase() + (ch.stacks > 0 ? `  ·  x${ch.stacks}` : ""), 11, COLOR.navy);
      const key = txt(`[${i + 1}]`, 13, COLOR.amber);
      name.anchor.set(0.5);
      desc.anchor.set(0.5);
      cat.anchor.set(0.5);
      key.anchor.set(0.5);
      c.addChild(bg, key, name, desc, cat);
      (c as any)._t = { name, desc, cat, key };
      c.eventMode = "static";
      c.cursor = "pointer";
      c.on("pointerover", () => this.select(i));
      c.on("pointerdown", () => this.onPick(ch.id));
      this.root.addChild(c);
      this.cards.push({ root: c, bg });
    });
  }
  select(i: number): void {
    this.sel = (i + this.cards.length) % this.cards.length;
  }
  move(d: number): void {
    this.select(this.sel + d);
  }
  activate(): void {
    this.onPick(this.choices[this.sel].id);
  }
  pickIndex(i: number): void {
    if (i >= 0 && i < this.choices.length) this.onPick(this.choices[i].id);
  }
  layout(w: number, h: number): void {
    scrim(this.bgG, w, h, 0.78);
    this.title.position.set(w / 2, h * 0.26);
    const n = this.cards.length;
    const cw = Math.max(180, Math.min(w * 0.26, 240));
    const ch = 150;
    const gap = Math.min(28, w * 0.02);
    const totalW = n * cw + (n - 1) * gap;
    let x = w / 2 - totalW / 2 + cw / 2;
    const y = h * 0.5;
    const t = (c: { root: Container }) => (c.root as any)._t as { name: Text; desc: Text; cat: Text; key: Text };
    for (let i = 0; i < n; i++) {
      const card = this.cards[i];
      card.root.position.set(x, y);
      const on = i === this.sel;
      card.bg.clear();
      card.bg.roundRect(-cw / 2, -ch / 2, cw, ch, 10).fill({ color: on ? COLOR.navy : COLOR.deepNavy, alpha: 0.96 }).stroke({ width: on ? 3 : 1, color: on ? COLOR.aqua : COLOR.navy });
      const tt = t(card);
      tt.key.position.set(0, -ch / 2 + 20);
      tt.name.position.set(0, -18);
      tt.desc.position.set(0, 14);
      tt.cat.position.set(0, ch / 2 - 20);
      x += cw + gap;
    }
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}
