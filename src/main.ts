// FATHOM — entry point. State flow:
//   loading → menu → (cutscene first dive) → dive → { levelup | pause } → gameover → menu
//   loading → error → retry
// Overlays are responsive (relayout on resize); game-over waits for a fresh press.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { Engine } from "./engine/app";
import { AssetStore } from "./engine/assets";
import { Input, KEYS } from "./engine/input";
import { StateMachine } from "./core/state";
import { Loader } from "./ui/loading";
import { Hud } from "./ui/hud";
import { Cutscene } from "./systems/cutscene";
import { coldOpen } from "./content/cutscene_coldopen";
import { DiveScene } from "./game/dive";
import * as persistence from "./game/persistence";
import type { DiveResult } from "./game/persistence";
import { deriveMeta } from "./game/meta";
import { weatherAt } from "./content/weather";
import { BOON_BY_ID } from "./content/boons";
import { audio } from "./engine/audio";
import { Hub } from "./game/hub";
import { submitScore, fetchTop } from "./online/leaderboard";
import { promptCallsign } from "./online/callsign";
import { COLOR } from "./palette";
import {
  MenuOverlay,
  PauseOverlay,
  HowToOverlay,
  GameOverOverlay,
  LevelUpOverlay,
  type Overlay,
} from "./ui/overlays";

function buildError(engine: Engine, msg: string): Container {
  const c = new Container();
  const w = engine.width;
  const h = engine.height;
  const st = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
    new TextStyle({ fontFamily: "Consolas, monospace", fontSize: size, fill: color, fontWeight: weight, align: "center" });
  const g = new Graphics();
  g.rect(0, 0, w, h).fill({ color: COLOR.abyss, alpha: 0.85 });
  c.addChild(g);
  const add = (s: string, size: number, color: number, y: number, weight: "normal" | "bold" = "normal") => {
    const t = new Text({ text: s, style: st(size, color, weight) });
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2 + y);
    c.addChild(t);
  };
  add("COULDN'T DESCEND", 26, COLOR.coralBright, -30, "bold");
  add(msg.slice(0, 80), 12, 0x5a7a9a, 6);
  add("press any key to retry", 13, COLOR.amber, 44);
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

  // Audio must be resumed on a user gesture (autoplay policy).
  audio.setEnabled(save.settings.sound);
  const resumeAudio = () => audio.resume();
  window.addEventListener("pointerdown", resumeAudio);
  window.addEventListener("keydown", resumeAudio);

  const loader = new Loader();
  const hud = new Hud();
  engine.uiRoot.addChild(loader.root);
  hud.layout(engine.width, engine.height);

  const fsm = new StateMachine();
  let dive: DiveScene | null = null;
  let activeOverlay: Overlay | null = null;
  let cutscene: Cutscene | null = null;
  let hub: Hub | null = null;
  let errorOverlay: Container | null = null;

  let loadProgress = 0;
  let loadMinTimer = 0;
  let loaded = false;
  let loadError: string | null = null;
  let playedIntro = false;
  // Fresh world every session: the run seed starts random (browser code — the
  // sim stays deterministic per run via its own seeded Rng).
  let seed = (Math.random() * 0x7fffffff) | 0;

  let goLock = 0;
  let goPrevBestDepth = 0;
  let goPrevBestScore = 0;
  let goResult: DiveResult | null = null;
  let lastBank: { pearlsEarned: number; newBadges: string[] } | null = null;

  const setOverlay = (o: Overlay | null) => {
    if (activeOverlay) {
      engine.uiRoot.removeChild(activeOverlay.root);
      activeOverlay.destroy();
    }
    activeOverlay = o;
    if (o) {
      engine.uiRoot.addChild(o.root);
      o.layout(engine.width, engine.height);
    }
  };

  const startLoading = () => {
    if (!loader.root.parent) engine.uiRoot.addChild(loader.root);
    loader.pickTip(save.runs % 5);
    loaded = false;
    loadProgress = 0;
    loadError = null;
    loadMinTimer = 1.0;
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
    const meta = deriveMeta(save.metaTiers);
    const weather = weatherAt(save.weatherIndex);
    const boons = save.pendingBoons.slice();
    dive = new DiveScene(engine, assets, seed, save.settings.reducedMotion, save.settings.screenShake, meta, weather, boons);
    save = persistence.clearBoons(save); // one-run boons are consumed on launch
    dive.onGameOver = (result) => {
      goPrevBestDepth = save.bestDepth;
      goPrevBestScore = save.bestScore;
      const bank = persistence.bankDive(save, result);
      save = bank.save;
      lastBank = { pearlsEarned: bank.pearlsEarned, newBadges: bank.newBadges };
      goResult = result;
      // Log the run to the global leaderboard (fire-and-forget; no-op offline).
      void submitScore(save.guestId, {
        name: save.callsign,
        score: result.score,
        depth: result.depth,
        kills: result.kills,
        stratum: result.stratum,
        won: result.won ?? false,
      });
      fsm.change("gameover");
    };
    if (!hud.root.parent) engine.uiRoot.addChild(hud.root);
    hud.root.visible = true;
    hud.layout(engine.width, engine.height);
  };

  const teardownDive = () => {
    dive?.destroy();
    dive = null;
    hud.root.visible = false;
    audio.stopDrone();
  };

  const buildMenu = () => {
    const menu = new MenuOverlay(save.bestDepth, save.bestScore, save.settings, save.callsign, {
      onStation: () => fsm.change("station"),
      onHowTo: () => fsm.change("howto"),
      onCallsign: () => {
        void promptCallsign(save.callsign).then((name) => {
          if (name === null) return;
          save = persistence.saveCallsign(save, name);
          if (activeOverlay === menu) menu.setCallsign(save.callsign);
        });
      },
      onToggleMotion: () => {
        save = persistence.saveSettings(save, { ...save.settings, reducedMotion: !save.settings.reducedMotion });
      },
      onToggleShake: () => {
        save = persistence.saveSettings(save, { ...save.settings, screenShake: !save.settings.screenShake });
      },
      onToggleSound: () => {
        save = persistence.saveSettings(save, { ...save.settings, sound: !save.settings.sound });
        audio.setEnabled(save.settings.sound);
      },
    });
    // Populate TOP DIVERS asynchronously; null = no backend live -> panel hidden.
    void fetchTop(8).then((rows) => {
      if (activeOverlay !== menu || rows === null) return;
      menu.setLeaderboard(rows);
      menu.layout(engine.width, engine.height); // board arrived — reflow columns
    });
    return menu;
  };

  const openLevelUp = () => {
    const choices = dive!.rollUpgradeChoices();
    setOverlay(
      new LevelUpOverlay(dive!.level, choices, (id) => {
        dive!.applyUpgrade(id);
        if (dive!.consumeLevelUp()) openLevelUp();
        else {
          setOverlay(null);
          dive!.resume();
          fsm.change("dive");
        }
      })
    );
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
        if (loaded && loadMinTimer <= 0) fsm.change("menu");
      },
      exit: () => engine.uiRoot.removeChild(loader.root),
    })
    .define("error", {
      enter: () => {
        goLock = 0.4;
        errorOverlay = buildError(engine, loadError ?? "unknown");
        engine.uiRoot.addChild(errorOverlay);
      },
      update: (dt) => {
        goLock = Math.max(0, goLock - dt);
        if (goLock <= 0 && input.anyPress()) {
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
    .define("menu", {
      enter: () => {
        input.clearEdges();
        setOverlay(buildMenu());
      },
      update: () => {
        const m = activeOverlay as MenuOverlay;
        if (input.pressed(KEYS.up)) m.move(-1);
        if (input.pressed(KEYS.down)) m.move(1);
        if (input.pressed(KEYS.confirm)) m.activate();
      },
      exit: () => setOverlay(null),
    })
    .define("howto", {
      enter: () => {
        input.clearEdges();
        setOverlay(new HowToOverlay(() => fsm.change("menu")));
      },
      update: () => {
        if (input.pressed(KEYS.confirm) || input.pressed(KEYS.pause)) fsm.change("menu");
      },
      exit: () => setOverlay(null),
    })
    .define("station", {
      enter: () => {
        input.clearEdges();
        hub = new Hub(engine, assets, {
          getSave: () => save,
          getWeather: () => weatherAt(save.weatherIndex),
          getLastBank: () => lastBank,
          onLaunch: () => fsm.change(playedIntro ? "dive" : "cutscene"),
          onExit: () => fsm.change("menu"),
          onBuy: (id) => {
            const r = persistence.purchaseMeta(save, id);
            if (r.ok) {
              save = r.save;
              audio.uiConfirm();
            } else audio.uiMove();
            return save;
          },
          onBuyBoon: (id) => {
            const boon = BOON_BY_ID[id];
            const r = boon ? persistence.purchaseBoon(save, boon) : { save, ok: false };
            if (r.ok) {
              save = r.save;
              audio.uiConfirm();
            } else audio.uiMove();
            return save;
          },
        });
      },
      update: (dt) => {
        hub?.update(dt, input);
      },
      exit: () => {
        hub?.destroy();
        hub = null;
        lastBank = null;
      },
    })
    .define("cutscene", {
      enter: () => {
        cutscene = new Cutscene(coldOpen(), { layer: engine.uiRoot, width: engine.width, height: engine.height });
      },
      update: (dt) => {
        cutscene?.update(dt);
        if (input.state.skip) cutscene?.skip();
        if (cutscene?.done) {
          playedIntro = true;
          fsm.change("dive");
        }
      },
      exit: () => {
        cutscene = null;
      },
    })
    .define("dive", {
      enter: () => {
        if (!dive) startDive();
        else dive.resume();
      },
      update: (dt) => {
        dive!.update(dt, input);
        // A death during update() may have already switched to gameover — don't
        // override it with levelup/pause (that stranded the player in a dead dive).
        if (dive!.ended || fsm.current !== "dive") return;
        hud.update(dive!.runState, dive!.hp, dive!.maxHp, dive!.shield, dive!.shieldMax, dive!.currentDepth, Math.max(save.bestDepth, dive!.currentDepth), dive!.dashCooldownFrac, dt);
        hud.setThreats(dive!.threatMarkers(engine.width, engine.height));
        if (dive!.consumeLevelUp()) fsm.change("levelup");
        else if (input.pressed(KEYS.pause)) fsm.change("pause");
      },
    })
    .define("levelup", {
      enter: () => {
        audio.levelUp();
        openLevelUp();
      },
      update: () => {
        const o = activeOverlay as LevelUpOverlay;
        const idx = input.choiceIndex();
        if (idx >= 0) o.pickIndex(idx);
        else if (input.pressed(KEYS.left)) o.move(-1);
        else if (input.pressed(KEYS.right)) o.move(1);
        else if (input.pressed(KEYS.confirm)) o.activate();
      },
      // exit handled inside openLevelUp's resolve
    })
    .define("pause", {
      enter: () => {
        input.clearEdges();
        setOverlay(
          new PauseOverlay({
            onResume: () => fsm.change("dive"),
            onRestart: () => {
              teardownDive();
              fsm.change("dive");
            },
            onQuit: () => {
              teardownDive();
              fsm.change("station");
            },
          })
        );
      },
      update: () => {
        const p = activeOverlay as PauseOverlay;
        if (input.pressed(KEYS.up)) p.move(-1);
        if (input.pressed(KEYS.down)) p.move(1);
        if (input.pressed(KEYS.confirm)) p.activate();
        else if (input.pressed(KEYS.pause)) fsm.change("dive");
      },
      exit: () => setOverlay(null),
    })
    .define("gameover", {
      enter: () => {
        goLock = 0.6;
        input.clearEdges();
        const r = goResult!;
        setOverlay(
          new GameOverOverlay({
            depth: r.depth,
            score: r.score,
            samplesLost: r.samples,
            pearlsEarned: lastBank?.pearlsEarned ?? 0,
            newBadges: lastBank?.newBadges ?? [],
            kills: r.kills,
            level: r.level,
            relics: r.relics,
            prevBestDepth: goPrevBestDepth,
            prevBestScore: goPrevBestScore,
            won: r.won ?? false,
          })
        );
      },
      update: (dt) => {
        goLock = Math.max(0, goLock - dt);
        // Requires a deliberate key (C); returns to the Surface Station (banked).
        if (goLock <= 0 && input.pressed(["KeyC"])) {
          teardownDive();
          fsm.change("station");
        }
      },
      exit: () => setOverlay(null),
    });

  startLoading();
  fsm.change("loading");

  const dbg: any = { engine, fsm };
  (window as any).__fathom = dbg;
  window.addEventListener("unhandledrejection", (e) => console.error("[fathom] unhandled:", e.reason));

  engine.addResizeHandler(() => {
    hud.layout(engine.width, engine.height);
    activeOverlay?.layout(engine.width, engine.height);
    hub?.layout();
  });

  engine.app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    input.update();
    engine.updateAmbient(dt);
    fsm.update(dt);
    dbg.info = {
      state: fsm.current,
      fps: Math.round(engine.app.ticker.FPS),
      hp: dive ? dive.hpRatio : 1,
      depth: dive ? Math.floor(dive.currentDepth) : 0,
      score: dive ? dive.scoreValue : 0,
      level: dive ? dive.level : 1,
      enemies: dive ? dive.enemyCount : 0,
      darters: dive ? dive.darterCount : 0,
      drifters: dive ? dive.drifterCount : 0,
      stratum: dive ? dive.stratum : 0,
      charge: dive ? Number(dive.chargeVal.toFixed(2)) : 0,
      dread: dive ? Number(dive.dreadVal.toFixed(2)) : 0,
      hazards: dive ? dive.hazardCount : 0,
      bullets: dive ? dive.bulletCount : 0,
    };
  });
  (window as any).__fathomDive = () => dive; // QA hook
}

void main();
