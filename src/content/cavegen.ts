// Procedural cavern generation v2 — CARVED SPACE.
//
// The model is inverted from v1: the stratum is solid rock, and playable space
// is carved out of it as a union of two primitives — room circles and tunnel
// capsules. Everything outside the union is dark and impassable. One source of
// truth (the carve union) powers collision, bullet culling, placement and the
// darkness overlay, so the boundary can never look or play "incomplete".
//
// Shape vocabulary: circular rooms (40%), oblongs (3 collinear circles, 30%),
// weird blobs (3-5 agglomerated circles, 30%), connected by curved constant-
// radius capsule tunnels routed as an MST + 1-3 loop edges. Deterministic from
// one uint32 seed; generation budget well under 5ms (~50 shapes total).
//
// Design merged from a 3-lens panel (generation / rendering / collision specs).

import type { Obstacle, Prop, Vec2 } from "../core/types";
import { Rng } from "../core/rng";

// ---- carve primitives ----

export type CarveShape =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "capsule"; ax: number; ay: number; bx: number; by: number; r: number };

/** Signed distance to one shape's surface (negative = inside carved water). */
function sdShape(px: number, py: number, s: CarveShape): number {
  if (s.kind === "circle") {
    return Math.hypot(px - s.x, py - s.y) - s.r;
  }
  const abx = s.bx - s.ax;
  const aby = s.by - s.ay;
  const apx = px - s.ax;
  const apy = py - s.ay;
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(px - (s.ax + abx * t), py - (s.ay + aby * t)) - s.r;
}

interface RoomInfo {
  id: number;
  center: Vec2;
  circles: { x: number; y: number; r: number }[];
  coreR: number; // guaranteed clear disc radius at center
  boundR: number; // rough bounding radius
  degree: number; // tunnel count
  hops: number; // BFS hops from start room
}

export interface CavernAnchors {
  start: Vec2;
  portal: Vec2 | null;
  vents: Vec2[];
  relic: Vec2;
  spawnPoints: Vec2[];
  lootSpots: Vec2[]; // pre-validated in-room points for loot pods/crates/etc.
}

export interface Cavern {
  shapes: CarveShape[];
  rooms: RoomInfo[];
  obstacles: Obstacle[]; // interior cover pillars (existing circle-collision path)
  wallRocks: Prop[]; // boundary dressing (visual only, no collision)
  growth: Prop[];
  anchors: CavernAnchors;
  /** Signed distance to carved space; negative = inside water. */
  sd(x: number, y: number): number;
  /** True when a circle of `pad` fits inside carved water at (x,y). */
  inside(x: number, y: number, pad?: number): boolean;
  /** Keep a body inside the carve: project in, cancel outward velocity (slide). */
  confine(pos: Vec2, radius: number, vel: Vec2 | null): void;
  /** Cheap per-bullet test via the coarse grid: true = bullet is in rock. */
  bulletBlocked(x: number, y: number): boolean;
}

export interface CavernOptsV2 {
  bounds: { w: number; h: number };
  rockiness: number; // 0..1
  isFloor: boolean; // boss arena: fewer, bigger rooms
  wallSprites: string[];
  growthSprites: string[];
}

// ---- grid classification for bullet tests ----
const CELL = 128;
const INSIDE = 0;
const OUTSIDE = 1;
const BOUNDARY = 2;

export function generateCavern(seed: number, opts: CavernOptsV2): Cavern {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const { bounds, rockiness } = opts;
  const shapes: CarveShape[] = [];
  const rooms: RoomInfo[] = [];

  // ---- 1. rooms ----
  // Vast + varied: expedition-scale caverns, not cells. Count and sizes swing
  // per run so no two dives read alike.
  const nRooms = opts.isFloor ? rng.int(4, 5) : rng.int(7, 10) + Math.round(rockiness * 2);
  const startR = opts.isFloor ? rng.range(640, 760) : rng.range(440, 580);
  const addRoomShape = (room: RoomInfo, c: { x: number; y: number; r: number }) => {
    room.circles.push(c);
    shapes.push({ kind: "circle", x: c.x, y: c.y, r: c.r });
  };

  // Size tier per room — wide variance is the point: vast caverns you fight
  // across, mid rooms, and pocket alcoves that hide treasure.
  const rollTier = (): number => {
    const t = rng.next();
    if (t < 0.18) return rng.range(560, 820); // vast — multi-screen expanse
    if (t < 0.58) return rng.range(380, 560); // large
    if (t < 0.88) return rng.range(260, 380); // mid
    return rng.range(180, 250); // pocket alcove
  };

  const mkRoom = (id: number, cx: number, cy: number, kindRoll: number, baseR: number): RoomInfo => {
    const room: RoomInfo = { id, center: { x: cx, y: cy }, circles: [], coreR: 0, boundR: 0, degree: 0, hops: -1 };
    if (kindRoll < 0.38 || baseR < 260) {
      addRoomShape(room, { x: cx, y: cy, r: baseR });
      room.coreR = baseR;
      room.boundR = baseR;
    } else if (kindRoll < 0.68) {
      // Oblong great-hall: 3-5 collinear circles — long spaces that take time to cross.
      const nSeg = rng.int(3, 5);
      const rm = baseR * rng.range(0.62, 0.78);
      const th = rng.range(0, Math.PI);
      const s = rm * rng.range(0.9, 1.1);
      const half = (nSeg - 1) / 2;
      for (let i = 0; i < nSeg; i++) {
        const t = i - half;
        addRoomShape(room, { x: cx + Math.cos(th) * s * t, y: cy + Math.sin(th) * s * t, r: rm });
      }
      room.coreR = rm;
      room.boundR = s * half + rm;
    } else {
      // Weird blob: core + up to 7 satellites agglomerated at random angles.
      const r0 = baseR * rng.range(0.75, 0.95);
      addRoomShape(room, { x: cx, y: cy, r: r0 });
      const nSat = rng.int(3, 7);
      let bound = r0;
      for (let i = 0; i < nSat; i++) {
        const parent = room.circles[rng.int(0, room.circles.length - 1)];
        const ri = r0 * rng.range(0.45, 0.8);
        const a = rng.range(0, Math.PI * 2);
        const d = parent.r * rng.range(0.6, 0.95);
        const sx = parent.x + Math.cos(a) * d;
        const sy = parent.y + Math.sin(a) * d;
        addRoomShape(room, { x: sx, y: sy, r: ri });
        bound = Math.max(bound, Math.hypot(sx - cx, sy - cy) + ri);
      }
      room.coreR = r0;
      room.boundR = bound;
    }
    return room;
  };

  // Start room: plain circle at center (+ jitter), owns the player start.
  const startRoom = mkRoom(0, bounds.w / 2 + rng.range(-80, 80), bounds.h / 2 + rng.range(-80, 80), 0, startR);
  rooms.push(startRoom);

  // Remaining rooms: roll the size FIRST, then best-candidate placement with a
  // margin scaled to that size (big caverns need big berths).
  for (let attempt = 1; attempt < nRooms; attempt++) {
    const baseR = rollTier();
    const margin = baseR + 220;
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    for (let c = 0; c < 16; c++) {
      const p = { x: rng.range(margin, bounds.w - margin), y: rng.range(margin, bounds.h - margin) };
      let score = Infinity;
      for (const r of rooms) score = Math.min(score, Math.hypot(p.x - r.center.x, p.y - r.center.y) - r.boundR - baseR);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best || bestScore < 240) continue; // no space for a well-separated room — skip
    // id MUST be the array index (skipped placements would leave holes and
    // blow up adjacency indexing otherwise).
    rooms.push(mkRoom(rooms.length, best.x, best.y, rng.next(), baseR));
  }

  // ---- 2. tunnels: MST + loops ----
  interface Edge { a: number; b: number; d: number }
  const edges: Edge[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      edges.push({ a: i, b: j, d: Math.hypot(rooms[i].center.x - rooms[j].center.x, rooms[i].center.y - rooms[j].center.y) });
    }
  }
  edges.sort((e1, e2) => e1.d - e2.d);
  const parent = rooms.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const adj: number[][] = rooms.map(() => []);

  const carveTunnel = (A: RoomInfo, B: RoomInfo, main: boolean) => {
    // Wide passages — you fight and dodge IN them, they never pinch.
    let rT = rng.range(115, 175) - rockiness * 10;
    if (main) rT = Math.max(rT, rng.range(140, 175));
    rT = Math.max(110, rT);
    // Endpoints extended INSIDE each room's nearest circle so the union is sealed.
    const near = (room: RoomInfo, toward: Vec2) => {
      let bc = room.circles[0];
      let bd = Infinity;
      for (const c of room.circles) {
        const d = Math.hypot(c.x - toward.x, c.y - toward.y) - c.r;
        if (d < bd) {
          bd = d;
          bc = c;
        }
      }
      // point on the segment center->toward, 40px inside the circle edge
      const dx = toward.x - bc.x;
      const dy = toward.y - bc.y;
      const l = Math.hypot(dx, dy) || 1;
      const inset = Math.max(0, bc.r - 40);
      return { x: bc.x + (dx / l) * inset, y: bc.y + (dy / l) * inset };
    };
    const pa = near(A, B.center);
    const pb = near(B, A.center);
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    // Curved: 1-2 midpoints displaced perpendicular (same sign = sweeping arc).
    const nMid = d > 900 ? 2 : 1;
    const sign = rng.chance(0.5) ? 1 : -1;
    const pts: Vec2[] = [pa];
    for (let m = 1; m <= nMid; m++) {
      const t = m / (nMid + 1);
      const px = pa.x + (pb.x - pa.x) * t;
      const py = pa.y + (pb.y - pa.y) * t;
      const nx = -(pb.y - pa.y) / (d || 1);
      const ny = (pb.x - pa.x) / (d || 1);
      const disp = sign * d * rng.range(0.1, nMid === 1 ? 0.22 : 0.16);
      pts.push({
        x: Math.max(rT + 120, Math.min(bounds.w - rT - 120, px + nx * disp)),
        y: Math.max(rT + 120, Math.min(bounds.h - rT - 120, py + ny * disp)),
      });
    }
    pts.push(pb);
    for (let i = 0; i < pts.length - 1; i++) {
      shapes.push({ kind: "capsule", ax: pts[i].x, ay: pts[i].y, bx: pts[i + 1].x, by: pts[i + 1].y, r: rT });
    }
    A.degree++;
    B.degree++;
    adj[A.id].push(B.id);
    adj[B.id].push(A.id);
  };

  let mstCount = 0;
  const loopBudget = 1 + Math.floor(rockiness * 2.5);
  let loops = 0;
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[ra] = rb;
      carveTunnel(rooms[e.a], rooms[e.b], true);
      mstCount++;
    } else if (loops < loopBudget && mstCount >= rooms.length - 1 && e.d < 1400 && rooms[e.a].degree < 4 && rooms[e.b].degree < 4 && !adj[e.a].includes(e.b)) {
      carveTunnel(rooms[e.a], rooms[e.b], false);
      loops++;
    }
  }

  // ---- queries ----
  const sd = (x: number, y: number): number => {
    let m = Infinity;
    for (const s of shapes) {
      const d = sdShape(x, y, s);
      if (d < m) m = d;
    }
    return m;
  };
  const inside = (x: number, y: number, pad = 0): boolean => sd(x, y) <= -pad;

  // SOFT confinement — brushing a wall, not hitting glass. Inside the contact
  // band the body eases toward the interior (partial blend); only a center that
  // has fully LEFT the carve gets snapped. Outward velocity is bled, tangential
  // velocity survives (slide).
  const confine = (pos: Vec2, radius: number, vel: Vec2 | null): void => {
    for (let iter = 0; iter < 2; iter++) {
      let best: CarveShape | null = null;
      let bestD = Infinity;
      for (const s of shapes) {
        const d = sdShape(pos.x, pos.y, s);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!best || bestD <= -radius) return; // clear water — free
      // Target: depth `radius` inside the nearest shape.
      let qx: number;
      let qy: number;
      if (best.kind === "circle") {
        const dx = pos.x - best.x;
        const dy = pos.y - best.y;
        const l = Math.hypot(dx, dy) || 1;
        const target = Math.max(0, best.r - radius);
        qx = best.x + (dx / l) * target;
        qy = best.y + (dy / l) * target;
      } else {
        const abx = best.bx - best.ax;
        const aby = best.by - best.ay;
        const t = Math.max(0, Math.min(1, ((pos.x - best.ax) * abx + (pos.y - best.ay) * aby) / (abx * abx + aby * aby || 1)));
        const mx = best.ax + abx * t;
        const my = best.ay + aby * t;
        const dx = pos.x - mx;
        const dy = pos.y - my;
        const l = Math.hypot(dx, dy) || 1;
        const target = Math.max(0, best.r - radius);
        qx = mx + (dx / l) * target;
        qy = my + (dy / l) * target;
      }
      const nx = qx - pos.x;
      const ny = qy - pos.y;
      const nl = Math.hypot(nx, ny) || 1;
      // Blend: gentle while overlapping the wall band, full snap only when the
      // CENTER is outside carved space entirely.
      const k = bestD > 0 ? 1 : 0.35;
      pos.x += nx * k;
      pos.y += ny * k;
      if (vel) {
        const vn = (vel.x * nx + vel.y * ny) / nl;
        if (vn < 0) {
          vel.x -= (nx / nl) * vn * 0.9;
          vel.y -= (ny / nl) * vn * 0.9;
        }
      }
      if (k < 1) return; // soft pass done — don't double-apply
    }
  };

  // ---- coarse grid for bullets ----
  const gw = Math.ceil(bounds.w / CELL);
  const gh = Math.ceil(bounds.h / CELL);
  const grid = new Uint8Array(gw * gh);
  const halfDiag = (CELL / 2) * Math.SQRT2;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const d = sd(gx * CELL + CELL / 2, gy * CELL + CELL / 2);
      grid[gy * gw + gx] = d <= -(halfDiag + 20) ? INSIDE : d >= halfDiag + 20 ? OUTSIDE : BOUNDARY;
    }
  }
  const bulletBlocked = (x: number, y: number): boolean => {
    const gx = (x / CELL) | 0;
    const gy = (y / CELL) | 0;
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
    const c = grid[gy * gw + gx];
    if (c === INSIDE) return false;
    if (c === OUTSIDE) return true;
    return sd(x, y) > -2;
  };

  // ---- 3. boundary rock dressing (visual only — the SDF is the seal) ----
  const wallRocks: Prop[] = [];
  const growth: Prop[] = [];
  const marchShape = (s: CarveShape) => {
    const emit = (px: number, py: number, nx: number, ny: number) => {
      // Cull points swallowed by the union (handles all joints emergently).
      let dOthers = Infinity;
      for (const o of shapes) {
        if (o === s) continue;
        const d = sdShape(px, py, o);
        if (d < dOthers) dOthers = d;
      }
      if (dOthers < -24) return; // MAP-RULES B1: cull only well inside the union
      const rockR = rng.range(34, 54);
      const cx = px + nx * rockR * rng.range(0.15, 0.45);
      const cy = py + ny * rockR * rng.range(0.15, 0.45);
      wallRocks.push({ sprite: rng.pick(opts.wallSprites), pos: { x: cx, y: cy }, scale: (rockR * 2.15) / 60, glow: false });
      // Second layer deeper into the dark = wall mass, not a rim.
      if (rng.chance(0.35 + rockiness * 0.3)) {
        const r2 = rockR * 0.7;
        wallRocks.push({ sprite: rng.pick(opts.wallSprites), pos: { x: px + nx * rockR * 1.5, y: py + ny * rockR * 1.5 }, scale: (r2 * 2.15) / 60, glow: false });
      }
      // Growth on faces where water is above the rock (normal points up-ish).
      if (opts.growthSprites.length && ny < -0.25 && rng.chance(0.32)) {
        growth.push({ sprite: rng.pick(opts.growthSprites), pos: { x: cx + rng.range(-10, 10), y: cy - rockR * 0.9 }, scale: rng.range(0.8, 1.2), glow: false });
      }
    };
    const step = 44 * (1.3 - rockiness * 0.3); // ~53px: neighbors always overlap (B1)
    if (s.kind === "circle") {
      const n = Math.max(6, Math.ceil((Math.PI * 2 * s.r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(-0.04, 0.04);
        emit(s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, Math.cos(a), Math.sin(a));
      }
    } else {
      const abx = s.bx - s.ax;
      const aby = s.by - s.ay;
      const len = Math.hypot(abx, aby) || 1;
      const nx = -aby / len;
      const ny = abx / len;
      const n = Math.max(2, Math.ceil(len / step));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = s.ax + abx * t;
        const py = s.ay + aby * t;
        emit(px + nx * s.r, py + ny * s.r, nx, ny);
        emit(px - nx * s.r, py - ny * s.r, -nx, -ny);
      }
    }
  };
  for (const s of shapes) marchShape(s);

  // ---- interior cover pillars (real collision via existing Obstacle path) ----
  const obstacles: Obstacle[] = [];
  for (const room of rooms) {
    if (room.coreR < 330 || room.id === 0) continue;
    const nP = Math.round(rng.range(0, 1) + rockiness);
    for (let p = 0; p < nP; p++) {
      const a = rng.range(0, Math.PI * 2);
      const d = room.coreR * rng.range(0.25, 0.5);
      const px = room.center.x + Math.cos(a) * d;
      const py = room.center.y + Math.sin(a) * d;
      const r = rng.range(38, 56);
      if (!inside(px, py, r + 120)) continue;
      obstacles.push({ pos: { x: px, y: py }, radius: r, sprite: rng.pick(opts.wallSprites), scale: (r * 2.15) / 60 });
      if (opts.growthSprites.length && rng.chance(0.5)) {
        growth.push({ sprite: rng.pick(opts.growthSprites), pos: { x: px, y: py - r }, scale: rng.range(0.8, 1.1), glow: false });
      }
    }
  }

  // ---- 4. anchors (BFS room tagging + in-room sampling) ----
  startRoom.hops = 0;
  const queue = [0];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj[cur]) {
      if (rooms[nb].hops === -1) {
        rooms[nb].hops = rooms[cur].hops + 1;
        queue.push(nb);
      }
    }
  }
  const sampleInRoom = (room: RoomInfo, pad: number, avoid: Vec2[], minGap: number): Vec2 => {
    for (let t = 0; t < 20; t++) {
      const c = room.circles[rng.int(0, room.circles.length - 1)];
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(0, Math.max(0, c.r - pad - 40));
      const p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
      if (!inside(p.x, p.y, pad + 40)) continue;
      if (avoid.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < minGap)) continue;
      if (obstacles.some((o) => Math.hypot(p.x - o.pos.x, p.y - o.pos.y) < o.radius + 90)) continue;
      return p;
    }
    return { x: room.center.x, y: room.center.y };
  };

  const others = rooms.filter((r) => r.id !== 0 && r.hops >= 0);
  const byHops = others.slice().sort((a, b) => b.hops - a.hops || 0);
  const portalRoom = byHops[0] ?? startRoom;
  const deadEnds = others.filter((r) => r.degree === 1 && r !== portalRoom);
  const relicRoom = deadEnds[0] ?? byHops[1] ?? startRoom;
  const ventRooms = others.filter((r) => r !== portalRoom).slice(0, 2);

  const placedAnchors: Vec2[] = [];
  const anchor = (room: RoomInfo, pad: number): Vec2 => {
    const p = sampleInRoom(room, pad, placedAnchors, 200);
    placedAnchors.push(p);
    return p;
  };

  const anchors: CavernAnchors = {
    // Floor/boss arena: enter at the SOUTH rim facing the heart of the room —
    // the guardian owns the center (staging beat, MAP-RULES L6).
    start: opts.isFloor
      ? { x: startRoom.center.x, y: startRoom.center.y + startRoom.coreR * 0.55 }
      : { x: startRoom.center.x, y: startRoom.center.y },
    portal: opts.isFloor ? null : anchor(portalRoom, 60),
    vents: ventRooms.length ? ventRooms.map((r) => anchor(r, 40)) : [anchor(startRoom, 40)],
    relic: anchor(relicRoom, 30),
    spawnPoints: [],
    lootSpots: [],
  };
  // Spawn points: per non-start room by size, min 6 total — and never on top of
  // an objective (portal/vents/relic/loot keep a 450px berth).
  for (const room of others) {
    const n = Math.max(1, Math.min(3, Math.round((room.coreR * room.coreR) / 90000)));
    for (let i = 0; i < n; i++) anchors.spawnPoints.push(sampleInRoom(room, 40, placedAnchors, 450));
  }
  while (anchors.spawnPoints.length < 6) anchors.spawnPoints.push(sampleInRoom(byHops[anchors.spawnPoints.length % Math.max(1, byHops.length)] ?? startRoom, 40, [], 0));
  // Loot spots: a handful of pre-validated points across rooms.
  for (const room of others) {
    if (rng.chance(0.75)) anchors.lootSpots.push(anchor(room, 24));
  }
  while (anchors.lootSpots.length < 6) anchors.lootSpots.push(anchor(others[anchors.lootSpots.length % Math.max(1, others.length)] ?? startRoom, 24));

  return { shapes, rooms, obstacles, wallRocks, growth, anchors, sd, inside, confine, bulletBlocked };
}
