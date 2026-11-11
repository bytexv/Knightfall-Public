import test from "node:test";
import assert from "node:assert/strict";
import { build, resolveConfig } from "vite";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

// Source-level TS tests cannot catch downlevel receiver binding regressions.
// Use the same actual targets as the production Vite build, including Safari 14.
test("production-target bundle starts runs with omitted IDs on modern and old WebViews", async () => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const config = await resolveConfig({ root: project }, "build");
  const output = await build({
    root: project,
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: "esbuild",
      target: config.build.target,
      lib: {
        entry: fileURLToPath(
          new URL("../src/lib/puzzle-rush.ts", import.meta.url),
        ),
        formats: ["iife"],
        name: "RushBundle",
      },
    },
  });
  const bundle = Array.isArray(output) ? output[0] : output;
  const code = bundle.output.find((item) => item.type === "chunk").code;
  const modernCrypto = {
    randomUUID() {
      assert.equal(this, modernCrypto);
      return "native-uuid";
    },
  };
  for (const crypto of [undefined, {}, modernCrypto]) {
    const context = { crypto };
    runInNewContext(code, context);
    const run = context.RushBundle.startRush("three", 1000);
    assert.equal(run.phase, "playing");
    assert.equal(run.deadline, 181000);
    assert.equal(typeof run.runId, "string");
    assert.ok(run.runId.length > 0);
    if (crypto?.randomUUID) assert.equal(run.runId, "native-uuid");
    const first = context.RushBundle.rushCourse[0];
    const solved = context.RushBundle.playRushMove(
      run,
      first.solution[0],
      1100,
    );
    assert.equal(solved.score, 1);
    assert.equal(
      context.RushBundle.startRush("survival", 1000, "explicit").runId,
      "explicit",
    );
  }
});
