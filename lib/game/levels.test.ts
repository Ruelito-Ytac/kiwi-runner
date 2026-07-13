import { describe, expect, it } from "vitest";

import { LEVELS } from "./levels";

// Reachability guards tied to the engine's jump budget (see engine.ts):
//   peak height ≈ 160px, horizontal reach ≈ 192px.
// The strict block-height / gap checks only apply to static levels. Levels that
// use mechanics (springs launch ~350px, movers bridge any gap) intentionally
// break those limits, so for them we only assert the basics.
const GROUND_Y = 480;
const MAX_BLOCK_UP = 150;
const MAX_GAP = 170;
const MAX_COIN_UP = 210;

describe("level reachability", () => {
  for (const lv of LEVELS) {
    const usesMechanics =
      (lv.movers?.length ?? 0) > 0 ||
      (lv.springs?.length ?? 0) > 0 ||
      (lv.keys?.length ?? 0) > 0;

    describe(`L${lv.id} ${lv.name}`, () => {
      const grounds = lv.platforms
        .filter((p) => p.y === GROUND_Y)
        .sort((a, b) => a.x - b.x);

      it("spawns the player on solid ground", () => {
        expect(grounds[0]!.x).toBeLessThanOrEqual(lv.spawn.x);
      });

      it("has enough coins to satisfy its gate", () => {
        expect(lv.coins.length).toBeGreaterThanOrEqual(lv.minCoins ?? 0);
      });

      it("keeps all content within the world bounds", () => {
        const items = [
          ...lv.platforms,
          ...lv.coins,
          lv.finish,
          ...(lv.keys ?? []),
        ];
        for (const item of items) {
          expect(item.x).toBeGreaterThanOrEqual(0);
          expect(item.x).toBeLessThanOrEqual(lv.worldWidth);
        }
      });

      it("places a key before its gate (so it is collectable)", () => {
        if (!lv.gate || !lv.keys?.length) return;
        for (const k of lv.keys) {
          expect(k.x, `key at x=${k.x}`).toBeLessThan(lv.gate.x);
        }
      });

      if (!usesMechanics) {
        it("has no pit wider than a jump", () => {
          for (let i = 1; i < grounds.length; i++) {
            const gap = grounds[i]!.x - (grounds[i - 1]!.x + grounds[i - 1]!.w);
            expect(gap, `gap before x=${grounds[i]!.x}`).toBeLessThanOrEqual(
              MAX_GAP,
            );
          }
        });

        it("keeps every block within jump height", () => {
          const blocks = lv.platforms.filter((p) => p.y !== GROUND_Y);
          for (const b of blocks) {
            expect(GROUND_Y - b.y, `block at x=${b.x}`).toBeLessThanOrEqual(
              MAX_BLOCK_UP,
            );
          }
        });

        it("keeps every coin within reach", () => {
          for (const c of lv.coins) {
            expect(GROUND_Y - c.y, `coin at x=${c.x}`).toBeLessThanOrEqual(
              MAX_COIN_UP,
            );
          }
        });
      }
    });
  }
});
