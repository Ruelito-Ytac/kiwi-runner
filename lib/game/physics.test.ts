import { describe, expect, it } from "vitest";
import { aabb, crusherOffset, moveAndCollide, type Rect } from "./physics";

const floor: Rect = { x: 0, y: 100, w: 500, h: 40 };

describe("aabb", () => {
  it("detects overlap and rejects mere edge-touching", () => {
    expect(
      aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }),
    ).toBe(true);
    expect(
      aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }),
    ).toBe(false);
  });
});

describe("moveAndCollide", () => {
  it("lands on top of a floor and reports onGround (no clip-through)", () => {
    const body: Rect = { x: 50, y: 60, w: 20, h: 30 }; // bottom at y=90, floor top at 100
    const r = moveAndCollide(body, 0, 30, [floor]); // would reach 90->120, past the floor
    expect(r.onGround).toBe(true);
    expect(r.y).toBe(70); // snapped so bottom (y+h=100) rests on floor top
  });

  it("stops horizontally against a wall", () => {
    const wall: Rect = { x: 100, y: 0, w: 20, h: 200 };
    const body: Rect = { x: 70, y: 0, w: 20, h: 20 }; // right edge at 90
    const r = moveAndCollide(body, 30, 0, [wall]); // would push right edge to 120
    expect(r.x).toBe(80); // right edge (x+w=100) flush against wall
  });

  it("bonks its head on a ceiling and kills upward motion flag", () => {
    const ceil: Rect = { x: 0, y: 0, w: 200, h: 20 }; // bottom at 20
    const body: Rect = { x: 50, y: 30, w: 20, h: 20 };
    const r = moveAndCollide(body, 0, -20, [ceil]); // rising into ceiling
    expect(r.hitHead).toBe(true);
    expect(r.y).toBe(20); // top snapped to ceiling bottom
  });

  it("does not tunnel a thin platform when the step is smaller than it", () => {
    const plat: Rect = { x: 0, y: 100, w: 500, h: 10 };
    const body: Rect = { x: 50, y: 92, w: 20, h: 20 };
    // Substep-sized displacement (8px) is smaller than the 10px platform.
    const r = moveAndCollide(body, 0, 8, [plat]);
    expect(r.onGround).toBe(true);
    expect(r.y).toBe(80);
  });
});

describe("crusherOffset", () => {
  it("stays fully raised (0) for a contiguous window each cycle", () => {
    // The raised window is what guarantees a crusher is always passable.
    for (let t = 0; t < 0.55; t += 0.01) {
      expect(crusherOffset(t), `t=${t.toFixed(2)}`).toBe(0);
    }
  });

  it("reaches a full slam (1) during the bottom hold", () => {
    expect(crusherOffset(0.7)).toBe(1);
  });

  it("never leaves the [0,1] range across a full cycle", () => {
    for (let t = 0; t < 1; t += 0.005) {
      const v = crusherOffset(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
