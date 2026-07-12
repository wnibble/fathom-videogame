// FATHOM — entry point. Wires the state machine:
//   boot → loading → cutscene(cold open) → dive → gameover → (dive again)
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

function buildGameOver(engine: Engine, depth: number, samples: number, best: number): Container {
  const c = new Container();
  const w = engine.width;
  const h = engine.height;
  const panel = new Graphics();
  panel.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.55 });
  panel.roundRect(w / 2 - 220, h / 2 - 130, 440, 260, 12).fill({ color: COLOR.deepNavy, alpha: 0.95 }).stroke({ width: 2, color: COLOR.navy });
  c.addChild(panel);

  const isRecord = depth >= best;
  const style = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
    new TextStyle({ fontFamily: "Consolas, monospace", fontSize: size, fill: color, fontWeight: weight, align: "center" });

  const add = (text: string, size: number, color: number, y: number, weight: "normal" | "bold" = "normal") => {
    const t = new Text({ text, style: style(size, color, weight) });
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2 + y);
    c.addChild(t);
  };

  add("YOU SURFACED", 28, COLOR.aquaBright, -92, "bold");
  add("you carried this back", 13, COLOR.teal, -62);
  add(`DEPTH REACHED   ${Math.floor(depth)} m`, 18, COLOR.amberBright, -14);
  add(`SAMPLES BANKED   ◈ ${samples}`, 16, COLOR.amber, 16);
  add(isRecord ? `★ NEW DEEPEST DIVE ★` : `BEST   ${Math.floor(best)} m`, 14, isRecord ? COLOR.aquaBright : COLOR.teal, 46);
  add("press any key to dive again", 13, 0x5a7a9a, 92);
  return c;
}

async function main(): Promise<void> {
  const mount = document.getElementById("app")!;
  const engine = new Engine();
  await engine.init(mount);
  engine.refreshOverlays();

  const input = new Input();
  input.attach(engine.app.canvas);

  const assets = new AssetStore();
  let save = persistence.load();

  const loader = new Loader();
  const hud = new Hud();
  engine.uiRoot.addChild(loader.root);

  const fsm = new StateMachine();
  let cutscene: Cutscene | null = null;
  let dive: DiveScene | null = null;
  let gameover: Container | null = null;

  let loadProgress = 0;
  let loadMinTimer = 0;
  let loaded = false;
  let goLock = 0;
  let seed = 20260712;

  const startLoading = () => {
    loader.pickTip(save.runs % 5);
    loaded = false;
    loadProgress = 0;
    loadMinTimer = 1.1;
    void assets.load((p) => (loadProgress = p)).then(() => (loaded = true));
  };

  const startDive = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    dive = new DiveScene(engine, assets, seed);
    dive.onGameOver = (depth, samples) => {
      save = persistence.recordDive(save, depth, samples, []);
      fsm.change("gameover");
    };
    if (!hud.root.parent) engine.uiRoot.addChild(hud.root);
    hud.root.visible = true;
    hud.layout(engine.width, engine.height);
  };

  fsm
    .define("boot", {
      enter: () => {
        startLoading();
        fsm.change("loading");
      },
    })
    .define("loading", {
      update: (dt) => {
        loadMinTimer -= dt;
        loader.update(loadProgress, engine.width, engine.height);
        if (loaded && loadMinTimer <= 0) fsm.change("cutscene");
      },
      exit: () => {
        engine.uiRoot.removeChild(loader.root);
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
      },
    })
    .define("gameover", {
      enter: () => {
        goLock = 0.8;
        gameover = buildGameOver(engine, dive!.currentDepth, dive!.bankedSamples, save.bestDepth);
        engine.uiRoot.addChild(gameover);
      },
      update: (dt) => {
        goLock = Math.max(0, goLock - dt);
        const pressed = input.consumeAnyKey() || input.state.firing;
        if (goLock <= 0 && pressed) {
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

  fsm.change("boot");

  const dbg: any = { engine, fsm };
  (window as any).__fathom = dbg; // exposed for QA/debug
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
