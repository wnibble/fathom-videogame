// "The Descent" — cold open (Part 3). Title card; the diver drops from the
// surface light into blue. Skippable. Authored as data for the sequencer.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { CutsceneStep, CutsceneCtx } from "../systems/cutscene";
import { COLOR } from "../palette";

export function coldOpen(): CutsceneStep[] {
  let title: Text | null = null;
  let subtitle: Text | null = null;
  let curtain: Graphics | null = null;
  let diver: Graphics | null = null;

  const build = (ctx: CutsceneCtx) => {
    const group = new Container();
    curtain = new Graphics();
    curtain.rect(0, 0, ctx.width, ctx.height).fill(COLOR.abyss);
    // a shaft of surface light near the top
    curtain.rect(ctx.width / 2 - 60, 0, 120, ctx.height * 0.5).fill({ color: COLOR.surface, alpha: 0.04 });

    diver = new Graphics();
    diver.circle(0, 0, 6).fill(COLOR.teal);
    diver.circle(3, 0, 2).fill(COLOR.amberBright);
    diver.position.set(ctx.width / 2, ctx.height * 0.2);

    title = new Text({
      text: "FATHOM",
      style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 52, fill: COLOR.aquaBright, fontWeight: "bold", letterSpacing: 10 }),
    });
    subtitle = new Text({
      text: "THE DESCENT",
      style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 16, fill: COLOR.teal, letterSpacing: 6 }),
    });
    title.anchor.set(0.5);
    subtitle.anchor.set(0.5);
    title.position.set(ctx.width / 2, ctx.height * 0.46);
    subtitle.position.set(ctx.width / 2, ctx.height * 0.46 + 44);
    title.alpha = 0;
    subtitle.alpha = 0;

    group.addChild(curtain, diver, title, subtitle);
    ctx.layer.addChild(group);
    (ctx as any)._group = group;
  };

  const teardown = (ctx: CutsceneCtx) => {
    const g = (ctx as any)._group as Container | undefined;
    if (g) {
      ctx.layer.removeChild(g);
      g.destroy({ children: true });
    }
    title = subtitle = null;
    curtain = diver = null;
  };

  return [
    {
      // Diver sinks; title fades in.
      duration: 1.6,
      enter: (ctx) => build(ctx),
      update: (ctx, t) => {
        if (diver) diver.position.y = ctx.height * (0.2 + 0.28 * t);
        if (title) title.alpha = Math.min(1, t * 1.6);
        if (subtitle) subtitle.alpha = Math.max(0, (t - 0.4) * 1.6);
      },
    },
    {
      // Hold.
      duration: 0.9,
    },
    {
      // Fade the curtain away into the dive.
      duration: 0.9,
      update: (_ctx, t) => {
        if (curtain) curtain.alpha = 1 - t;
        if (title) title.alpha = 1 - t;
        if (subtitle) subtitle.alpha = 1 - t;
        if (diver) diver.alpha = 1 - t;
      },
      exit: (ctx) => teardown(ctx),
    },
  ];
}
