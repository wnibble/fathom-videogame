// Pixi v8 application + the layered render stack that makes the deep look deep:
// a dark world layer with a SEPARATE additive, bloomed light layer composited on
// top (bioluminescence glows *through* darkness — pillar 2). Integer pixel zoom,
// nearest-neighbor, roundPixels — crisp pixel art (pillar art direction).

import { Application, Container, Graphics, Sprite, Texture, TextureSource } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { COLOR } from "../palette";

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");

/** Radial vignette: transparent center → deep abyss edges. Sells the darkness. */
function makeVignetteTexture(w: number, h: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d")!;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
  g.addColorStop(0, "rgba(4,7,15,0)");
  g.addColorStop(0.7, "rgba(4,7,15,0.35)");
  g.addColorStop(1, "rgba(2,4,10,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return Texture.from(canvas);
}

// Integer scale factor. ZOOM 2 (not 3) so the bullet-hell has room: at 1280×720
// the visible world is ~640×360, wide enough that the Spitter's engagement range
// and its telegraph stay ON SCREEN (Pillar 1). Still crisp integer pixel art.
export const ZOOM = 2;

export class Engine {
  app!: Application;
  bgRoot!: Container; // screen-space background fog
  sceneRoot!: Container; // world, integer-zoomed + camera-translated
  worldLayer!: Container; // solid dark bodies (props, actors, bullet cores)
  lightLayer!: Container; // glows/telegraphs — additive + bloom
  fxRoot!: Container; // screen-space vignette
  uiRoot!: Container; // HUD / loader / cutscene

  cam = { x: 0, y: 0, tx: 0, ty: 0 };
  bloom!: AdvancedBloomFilter;
  private vignette?: Sprite;

  async init(mount: HTMLElement): Promise<void> {
    // Must run before any texture is created so pixel art stays crisp.
    TextureSource.defaultOptions.scaleMode = "nearest";

    this.app = new Application();
    await this.app.init({
      resizeTo: window,
      backgroundColor: COLOR.abyss,
      roundPixels: true,
      antialias: false,
      preference: "webgl",
    });
    mount.appendChild(this.app.canvas);

    this.bgRoot = new Container();
    this.sceneRoot = new Container();
    this.worldLayer = new Container();
    this.lightLayer = new Container();
    this.fxRoot = new Container();
    this.uiRoot = new Container();

    // The light layer is composited additively and bloomed as a group.
    // Calm bloom: only the brightest cores glow, and gently — so bullets stay
    // readable (pillar 1) instead of washing into slabs of light.
    this.bloom = new AdvancedBloomFilter({
      threshold: 0.5,
      bloomScale: 0.7,
      brightness: 1.0,
      blur: 4,
      quality: 4,
    });
    this.lightLayer.blendMode = "add";
    this.lightLayer.filters = [this.bloom];

    this.sceneRoot.scale.set(ZOOM);
    this.sceneRoot.addChild(this.worldLayer, this.lightLayer);
    this.app.stage.addChild(this.bgRoot, this.sceneRoot, this.fxRoot, this.uiRoot);
  }

  /** (Re)draw the screen-space background fill + vignette. Call on init + resize. */
  refreshOverlays(): void {
    this.bgRoot.removeChildren();
    const bg = new Graphics();
    bg.rect(0, 0, this.width, this.height).fill(hex(COLOR.deepNavy));
    this.bgRoot.addChild(bg);

    if (this.vignette) {
      this.fxRoot.removeChild(this.vignette);
      this.vignette.destroy(true);
    }
    this.vignette = new Sprite(makeVignetteTexture(this.width, this.height));
    this.fxRoot.addChild(this.vignette);
  }

  centerOn(x: number, y: number, snap = false): void {
    this.cam.tx = x;
    this.cam.ty = y;
    if (snap) {
      this.cam.x = x;
      this.cam.y = y;
    }
  }

  updateCamera(dt: number): void {
    const k = 1 - Math.pow(0.0000001, dt); // frame-rate independent smoothing
    this.cam.x += (this.cam.tx - this.cam.x) * k;
    this.cam.y += (this.cam.ty - this.cam.y) * k;
    const w = this.width;
    const h = this.height;
    this.sceneRoot.position.set(
      Math.round(w / 2 - this.cam.x * ZOOM),
      Math.round(h / 2 - this.cam.y * ZOOM)
    );
  }

  /** Convert a screen-space point to world space (for mouse aim). */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.sceneRoot.position.x) / ZOOM,
      y: (sy - this.sceneRoot.position.y) / ZOOM,
    };
  }

  /** Convert a world-space point to screen space (for off-screen threat markers). */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * ZOOM + this.sceneRoot.position.x,
      y: wy * ZOOM + this.sceneRoot.position.y,
    };
  }

  get width(): number {
    return this.app.screen.width;
  }
  get height(): number {
    return this.app.screen.height;
  }
  setBloom(on: boolean): void {
    this.lightLayer.filters = on ? [this.bloom] : [];
  }
}
