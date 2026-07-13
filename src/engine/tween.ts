// Tiny tween/easing toolkit — the force-multiplier for all juice (used by dive
// juice + station UI). Frame-rate-independent `approach`; standard easings.

/** Move `cur` toward `tgt`; k = responsiveness (higher = snappier). fps-independent. */
export function approach(cur: number, tgt: number, k: number, dt: number): number {
  return cur + (tgt - cur) * Math.min(1, k * dt);
}
export const outQuad = (t: number): number => 1 - (1 - t) * (1 - t);
export const inQuad = (t: number): number => t * t;
export const inOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const outBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
