import { defineConfig } from "vitest/config";

// The only test is the pure collision core (lib/game/physics.test.ts) — no DOM
// needed, so the default node environment is enough.
export default defineConfig({
    test: {
        environment: "node",
    },
});
