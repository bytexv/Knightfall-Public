import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import { guardPgnDefaults } from "../scripts/pgn-compat.ts";

test("parser offsets default to finite zero before coercion and reject upstream drift", async () => {
  const original = await readFile(
    new URL("../node_modules/chess.js/dist/esm/chess.js", import.meta.url),
    "utf8",
  );
  const guarded = guardPgnDefaults(original);
  for (const field of ["peg$currPos", "peg$silentFails"]) {
    assert.ok(
      guarded.includes(
        `typeof options.${field} === "number" && Number.isFinite(options.${field})`,
      ),
    );
    const expression = guarded.match(
      new RegExp(`var ${field.replace("$", "\\$")} = (.*);`),
    )[1];
    const evaluate = new Function("options", `return ${expression}`);
    for (const value of [undefined, NaN, Infinity, -Infinity])
      assert.equal(evaluate({ [field]: value }), 0);
    assert.equal(evaluate({ [field]: 3.9 }), 3);
    assert.equal(evaluate({ [field]: -1.5 }), -1);
  }
  assert.throws(
    () => guardPgnDefaults("changed upstream source"),
    /parser changed/,
  );
});

test("actual production pipeline parses LAN PGNs, comments, FEN and invalid input with guards", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await build({
    root,
    logLevel: "silent",
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL("../src/lib/game.ts", import.meta.url)),
        formats: ["iife"],
        name: "GameBundle",
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  const code = bundle.output.find((item) => item.type === "chunk").code;
  assert.ok(code.includes("peg$currPos") && code.includes("Number.isFinite"));
  const context = {};
  runInNewContext(code, context);
  const { importPgn } = context.GameBundle;
  const headers =
    '[Event "Knightfall Wi-Fi game"]\n[Site "Local network"]\n[Date "2026.11.11"]\n[Round "?"]\n[White "Desktop test"]\n[Black "Android native QA"]\n[Result "*"]\n[TimeControl "-"]\n';
  assert.equal(importPgn(headers + " *").moves.length, 0);
  const game = importPgn(headers + "1. e4 {A center pawn} e5 2. Nf3 *");
  assert.deepEqual(
    Array.from(game.moves, (m) => m.san),
    ["e4", "e5", "Nf3"],
  );
  assert.equal(game.moves[0].comment, "A center pawn");
  assert.equal(
    importPgn('[SetUp "1"]\n[FEN "8/8/8/8/8/5k2/8/3K4 w - - 0 1"]\n *').moves
      .length,
    0,
  );
  assert.throws(() => importPgn("not a chess game"));
});
