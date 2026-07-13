/**
 * Pure, DOM-free collision helpers for Kiwi Runner.
 *
 * Kept separate from the engine so the tricky part (axis-resolved AABB
 * collision, the thing that must never let the player clip through a floor)
 * can be unit-tested without a canvas. The engine substeps at a fixed
 * timestep and calls `moveAndCollide` with small per-step displacements,
 * which is what prevents tunnelling at high speed.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** Axis-aligned bounding-box overlap. Touching edges do NOT count as overlap. */
export function aabb(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export type MoveResult = {
  x: number;
  y: number;
  onGround: boolean; // landed on top of a solid this move
  hitHead: boolean; // bonked the underside of a solid this move
};

/**
 * Move `body` by (dx, dy) through a set of solid rects, resolving one axis at
 * a time. Horizontal first, then vertical — the classic order that gives
 * reliable ground detection on ledges and corners.
 *
 * Per-axis resolution means a body moving diagonally into a corner is pushed
 * out of whichever axis it entered, never wedged. Callers must keep each
 * displacement smaller than the thinnest solid (the engine guarantees this by
 * substepping), otherwise a fast body can skip past a thin platform.
 */
export function moveAndCollide(
  body: Rect,
  dx: number,
  dy: number,
  solids: Rect[],
): MoveResult {
  let { x, y } = body;
  const { w, h } = body;
  let onGround = false;
  let hitHead = false;

  // --- Horizontal ---
  x += dx;
  if (dx !== 0) {
    for (const s of solids) {
      if (aabb({ x, y, w, h }, s)) {
        // Push out to the side we came from.
        x = dx > 0 ? s.x - w : s.x + s.w;
      }
    }
  }

  // --- Vertical ---
  y += dy;
  if (dy !== 0) {
    for (const s of solids) {
      if (aabb({ x, y, w, h }, s)) {
        if (dy > 0) {
          // Falling: land on top.
          y = s.y - h;
          onGround = true;
        } else {
          // Rising: bonk head.
          y = s.y + s.h;
          hitHead = true;
        }
      }
    }
  }

  return { x, y, onGround, hitHead };
}
