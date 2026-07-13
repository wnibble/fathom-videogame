// Movement/physics: drift with momentum + drag; currents as force fields (not
// random) so they read as intentional (Part 5 §5 acceptance). Input accelerates;
// drag pulls you back; currents add a steady push while you're inside a band.

import type { Current, Obstacle, Player, Vec2 } from "../core/types";

const ACCEL = 1500; // px/sec^2 from input
const MAX_SPEED = 250; // player self-propelled cap
const DRAG = 5.5; // higher = snappier stop

/** Push a circular body out of any overlapping rock, cancelling inward velocity. */
export function resolveObstacles(pos: Vec2, radius: number, vel: Vec2 | null, obstacles: Obstacle[]): void {
  for (const o of obstacles) {
    const dx = pos.x - o.pos.x;
    const dy = pos.y - o.pos.y;
    const min = radius + o.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 < min * min && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      pos.x = o.pos.x + nx * min;
      pos.y = o.pos.y + ny * min;
      if (vel) {
        const vn = vel.x * nx + vel.y * ny; // inward component
        if (vn < 0) {
          vel.x -= vn * nx;
          vel.y -= vn * ny;
        }
      }
    }
  }
}

export function updatePlayerMovement(
  player: Player,
  moveIntent: Vec2,
  currents: Current[],
  dt: number,
  bounds: { w: number; h: number },
  speedMult = 1,
  obstacles: Obstacle[] = []
): void {
  // Self-propulsion
  player.vel.x += moveIntent.x * ACCEL * speedMult * dt;
  player.vel.y += moveIntent.y * ACCEL * speedMult * dt;

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

  // Clamp self-speed (currents/dashes may briefly exceed this — intentional)
  const sp = Math.hypot(player.vel.x, player.vel.y);
  const cap = MAX_SPEED * 1.6 * speedMult + 400;
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

  // Rocks / cave walls.
  resolveObstacles(player.pos, player.radius, player.vel, obstacles);
}
