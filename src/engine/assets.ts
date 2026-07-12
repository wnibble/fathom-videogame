// Loads the extracted sprite atlas (public/assets/sprites/atlas.json) and turns
// it into ready-to-use Pixi textures + sprite/anim factories with correct anchors.
// Progress is surfaced for the themed loader.

import { Assets, Sprite, AnimatedSprite, Texture } from "pixi.js";

export interface SpriteMeta {
  file: string;
  w: number;
  h: number;
  anchor: [number, number];
  sheet: string;
}
export interface AnimMeta {
  frames: string[];
  w: number;
  h: number;
  anchor: [number, number];
  fps: number;
  sheet: string;
}
interface AtlasJson {
  sprites: Record<string, SpriteMeta>;
  animations: Record<string, AnimMeta>;
}

const ATLAS_URL = "assets/sprites/atlas.json";

export class AssetStore {
  sprites: Record<string, SpriteMeta> = {};
  anims: Record<string, AnimMeta> = {};
  private tex = new Map<string, Texture>();

  async load(onProgress?: (p: number) => void): Promise<void> {
    const atlas = (await fetch(ATLAS_URL).then((r) => r.json())) as AtlasJson;
    this.sprites = atlas.sprites;
    this.anims = atlas.animations;

    const files = new Set<string>();
    for (const s of Object.values(this.sprites)) files.add(s.file);
    for (const a of Object.values(this.anims)) a.frames.forEach((f) => files.add(f));

    const list = [...files];
    const urls = list.map((f) => "assets/" + f);
    const loaded = (await Assets.load(urls, (p) => onProgress?.(p))) as Record<string, Texture>;
    for (const f of list) this.tex.set(f, loaded["assets/" + f]);
    onProgress?.(1);
  }

  has(name: string): boolean {
    return !!this.sprites[name] || !!this.anims[name];
  }

  texture(name: string): Texture {
    const m = this.sprites[name];
    if (!m) throw new Error(`unknown sprite: ${name}`);
    return this.tex.get(m.file)!;
  }

  /** A positioned-ready Sprite with the correct anchor. */
  sprite(name: string): Sprite {
    const m = this.sprites[name];
    if (!m) throw new Error(`unknown sprite: ${name}`);
    const s = new Sprite(this.tex.get(m.file)!);
    s.anchor.set(m.anchor[0], m.anchor[1]);
    return s;
  }

  /** An AnimatedSprite for a `_fN` group (autoplays, loops). */
  anim(name: string): AnimatedSprite {
    const m = this.anims[name];
    if (!m) throw new Error(`unknown animation: ${name}`);
    const textures = m.frames.map((f) => this.tex.get(f)!);
    const a = new AnimatedSprite(textures);
    a.anchor.set(m.anchor[0], m.anchor[1]);
    a.animationSpeed = m.fps / 60;
    a.play();
    return a;
  }

  /** Names of all sprites belonging to a source sheet (for worldgen prop picks). */
  spritesInSheet(sheet: string): string[] {
    return Object.keys(this.sprites).filter((k) => this.sprites[k].sheet === sheet);
  }
  animsInSheet(sheet: string): string[] {
    return Object.keys(this.anims).filter((k) => this.anims[k].sheet === sheet);
  }
}
