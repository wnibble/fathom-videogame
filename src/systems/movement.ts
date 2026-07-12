// Movement/physics: drift with momentum + drag; currents as force fields (not
// random) so they read as intentional (Part 5 §5 acceptance). Input accelerates;
// drag pulls you back; currents add a steady push while you're inside a band.

import type { Current, Player, Vec2 } from "../core/types";

const ACCEL = 1500; // px/sec^2 from input
const MAX_SPEED = 250; // player self-propelled cap
const DRAG = 5.5; // higher = snappier stop

export function updatePlayerMovement(
  player: Player,
  moveIntent: Vec2,
  currents: Current[],
  dt: number,
  bounds: { w: number; h: number }
): void {
  // Self-propulsion
  player.vel.x += moveIntent.x * ACCEL * dt;
  player.vel.y += moveIntent.y * ACCEL * dt;

  // Currents (steady acceleration inside the band's AABB)
  for (const c of currents) {
    if (
      Math.abs(player.pos.x - c.pos.x) <= c.half.x &&
      Math.abs(player.pos.y - c.pos.y) <= c.half.y
    ) {
      player.vel.x += c.force.x * dt;
      player.vel.y += c.force.y * dt;
    }
  }

  // Drag
  const dragK = 1 / (1 + DRAG * dt);
  player.vel.x *= dragK;
  player.vel.y *= dragK;

  // Clamp self-speed (currents may briefly exceed this — intentional)
  const sp = Math.hypot(player.vel.x, player.vel.y);
  const cap = MAX_SPEED * 1.6;
  if (sp > cap) {
    player.vel.x = (player.vel.x / sp) * cap;
    player.vel.y = (player.vel.y / sp) * cap;
  }

  player.pos.x += player.vel.x * dt;
  player.pos.y += player.vel.y * dt;

  // World bounds
  const m = player.radius;
  if (player.pos.x < m) {
    player.pos.x = m;
    player.vel.x *= -0.3;
  }
  if (player.pos.y < m) {
    player.pos.y = m;
    player.vel.y *= -0.3;
  }
  if (player.pos.x > bounds.w - m) {
    player.pos.x = bounds.w - m;
    player.vel.x *= -0.3;
  }
  if (player.pos.y > bounds.h - m) {
    player.pos.y = bounds.h - m;
    player.vel.y *= -0.3;
  }
}
