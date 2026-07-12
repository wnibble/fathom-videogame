// FATHOM — entry point. Wires the state machine:
//   loading → cutscene(cold open) → dive → gameover → (dive again)
//   loading → error → (retry)   [asset-load failure has an exit — no soft-lock]
// Keeps the vertical slice runnable at all times.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { Engine } from "./engine/app";
import { AssetStore } from "./engine/assets";
import { Input } from "./engine/input";
import { StateMachine } from "./core/state";
import { Loader } from "./ui/loading";
import { Hud } from "./ui/hud";
import { Cutscene } from "./systems/cutscene";
import { coldOpen } from "./content/cutscene_coldopen";
import { DiveScene } from "./game/dive";
import * as persistence from "./game/persistence";
import { COLOR } from "./palette";

const style = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
  new TextStyle({ fontFamily: "Consolas, monospace", fontSize: size, fill: color, fontWeight: weight, align: "center" });

function centeredText(c: Container, w: number, h: number, text: string, size: number, color: number, y: number, weight: "normal" | "bold" = "normal") {
  const t = new Text({ text, style: style(size, color, weight) });
  t.anchor.set(0.5);
  t.position.set(w / 2, h / 2 + y);
  c.addChild(t);
}

function buildGameOver(engine: Engine, depth: number, samplesLost: number, prevBest: number): Container {
  const c = new Container();
  const w = engine.width;
  const h = engine.height;
  const panel = new Graphics();
  panel.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.55 });
  panel.roundRect(w / 2 - 230, h / 2 - 140, 460, 280, 12).fill({ color: COLOR.deepNavy, alpha: 0.95 }).stroke({ width: 2, color: COLOR.navy });
  c.addChild(panel);

  const isRecord = depth > prevBest;
  centeredText(c, w, h, "YOU SURFACED", 28, COLOR.aquaBright, -98, "bold");
  centeredText(c, w, h, isRecord ? "you carried this back" : "the deep kept the rest", 13, COLOR.teal, -68);
  centeredText(c, w, h, `DEPTH REACHED   ${Math.floor(depth)} m`, 18, COLOR.amberBright, -18);
  centeredText(c, w, h, `◈ ${samplesLost} samples lost to the deep`, 15, COLOR.coralBright, 14);
  centeredText(c, w, h, isRecord ? "★ NEW DEEPEST DIVE ★" : `BEST   ${Math.floor(prevBest)} m`, 14, isRecord ? COLOR.aquaBright : COLOR.teal, 46);
  centeredText(c, w, h, "press any key to dive again", 13, 0x5a7a9a, 96);
  return c;
}

function buildError(engine: Engine, msg: string): Container {
  const c = new Container();
  const w = engine.width;
  const h = engine.height;
  const panel = new Graphics();
  panel.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.8 });
  c.addChild(panel);
  centeredText(c, w, h, "COULDN'T DESCEND", 26, COLOR.coralBright, -40, "bold");
  centeredText(c, w, h, "the assets failed to load", 14, COLOR.teal, -8);
  centeredText(c, w, h, msg.slice(0, 80), 12, 0x5a7a9a, 18);
  centeredText(c, w, h, "press any key to retry", 13, COLOR.amber, 56);
  return c;
}

async function main(): Promise<void> {
  const mount = document.getElementById("app")!;
  const engine = new Engine();
  await engine.init(mount);
  engine.refreshOverlays();

  const input = new Input();
  input.attach(engine.app.canvas);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const assets = new AssetStore();
  let save = persistence.load();

  const loader = new Loader();
  const hud = new Hud();
  engine.uiRoot.addChild(loader.root);

  const fsm = new StateMachine();
  let cutscene: Cutscene | null = null;
  let dive: DiveScene | null = null;
  let gameover: Container | null = null;
  let errorOverlay: Container | null = null;

  let loadProgress = 0;
  let loadMinTimer = 0;
  let loaded = false;
  let loadError: string | null = null;
  let goLock = 0;
  let goPrevBest = 0;
  let goLostSamples = 0;
  let seed = 20260712;

  const startLoading = () => {
    if (!loader.root.parent) engine.uiRoot.addChild(loader.root);
    loader.pickTip(save.runs % 5);
    loaded = false;
    loadProgress = 0;
    loadError = null;
    loadMinTimer = 1.1;
    assets
      .load((p) => (loadProgress = p))
      .then(() => (loaded = true))
      .catch((e) => {
        loadError = e?.message ? String(e.message) : "asset load failed";
        console.error("[fathom] asset load failed:", e);
      });
  };

  const startDive = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    dive = new DiveScene(engine, assets, seed, reducedMotion);
    dive.onGameOver = (depth, samples) => {
      goPrevBest = save.bestDepth;
      goLostSamples = samples; // death loses unbanked samples (Pillar 3 stakes)
      save = persistence.recordDive(save, depth, 0, []);
      fsm.change("gameover");
    };
    if (!hud.root.parent) engine.uiRoot.addChild(hud.root);
    hud.root.visible = true;
    hud.layout(engine.width, engine.height);
  };

  fsm
    .define("loading", {
      update: (dt) => {
        if (loadError) {
          fsm.change("error");
          return;
        }
        loadMinTimer -= dt;
        loader.update(loadProgress, engine.width, engine.height);
        if (loaded && loadMinTimer <= 0) fsm.change("cutscene");
      },
      exit: () => {
        engine.uiRoot.removeChild(loader.root);
      },
    })
    .define("error", {
      enter: () => {
        goLock = 0.4;
        errorOverlay = buildError(engine, loadError ?? "unknown error");
        engine.uiRoot.addChild(errorOverlay);
      },
      update: (dt) => {
        goLock = Math.max(0, goLock - dt);
        if (goLock <= 0 && (input.consumeAnyKey() || input.state.firing)) {
          startLoading();
          fsm.change("loading");
        }
      },
      exit: () => {
        if (errorOverlay) {
          engine.uiRoot.removeChild(errorOverlay);
          errorOverlay.destroy({ children: true });
          errorOverlay = null;
        }
      },
    })
    .define("cutscene", {
      enter: () => {
        cutscene = new Cutscene(coldOpen(), { layer: engine.uiRoot, width: engine.width, height: engine.height });
      },
      update: (dt) => {
        cutscene?.update(dt);
        if (input.state.skip) cutscene?.skip();
        if (cutscene?.done) fsm.change("dive");
      },
      exit: () => {
        cutscene = null;
      },
    })
    .define("dive", {
      enter: () => startDive(),
      update: (dt) => {
        dive!.update(dt, input);
        hud.update(
          dive!.hpRatio,
          dive!.currentDepth,
          Math.max(save.bestDepth, dive!.currentDepth),
          dive!.bankedSamples,
          engine.width
        );
        hud.setThreats(dive!.threatMarkers(engine.width, engine.height));
      },
    })
    .define("gameover", {
      enter: () => {
        goLock = 0.8;
        gameover = buildGameOver(engine, dive!.currentDepth, goLostSamples, goPrevBest);
        engine.uiRoot.addChild(gameover);
      },
      update: (dt) => {
        goLock = Math.max(0, goLock - dt);
        if (goLock <= 0 && (input.consumeAnyKey() || input.state.firing)) {
          if (gameover) {
            engine.uiRoot.removeChild(gameover);
            gameover.destroy({ children: true });
            gameover = null;
          }
          dive?.destroy();
          dive = null;
          hud.root.visible = false;
          fsm.change("dive");
        }
      },
    });

  // Start at loading directly (no re-entrant boot→loading emit).
  startLoading();
  fsm.change("loading");

  const dbg: any = { engine, fsm };
  (window as any).__fathom = dbg; // exposed for QA/debug
  window.addEventListener("unhandledrejection", (e) => console.error("[fathom] unhandled:", e.reason));

  engine.app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    input.update();
    fsm.update(dt);
    dbg.info = {
      state: fsm.current,
      fps: Math.round(engine.app.ticker.FPS),
      hp: dive ? dive.hpRatio : 1,
      depth: dive ? Math.floor(dive.currentDepth) : 0,
      enemies: dive ? dive.enemyCount : 0,
      bullets: dive ? dive.bulletCount : 0,
    };
  });

  window.addEventListener("resize", () => {
    engine.refreshOverlays();
    hud.layout(engine.width, engine.height);
  });
}

void main();
