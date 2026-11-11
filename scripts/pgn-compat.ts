import type { Plugin } from "vite";

/**
 * Chromium 83 on the Android x86 emulator converts undefined|0 to INT_MAX.
 * chess.js's optional PEG offsets then scan billions of nonexistent characters.
 * Make the two default offsets explicit before any integer coercion. This also
 * keeps NaN/Infinity at zero, as the parser expects on conforming engines.
 */
export function guardPgnDefaults(source: string): string {
  for (const field of ["peg$currPos", "peg$silentFails"]) {
    const original = `options.${field} | 0`;
    if (source.split(original).length !== 2)
      throw new Error(
        `chess.js parser changed: inspect compatibility guard for ${field}.`,
      );
    source = source.replace(
      original,
      `(typeof options.${field} === "number" && Number.isFinite(options.${field}) ? options.${field} | 0 : 0)`,
    );
  }
  return source;
}

export function pgnCompatibility(): Plugin {
  return {
    name: "knightfall-pgn-numeric-defaults",
    enforce: "pre",
    transform(source, id) {
      if (
        !/\/chess\.js\/dist\/esm\/chess\.js(?:\?|$)/.test(
          id.replaceAll("\\", "/"),
        )
      )
        return null;
      return { code: guardPgnDefaults(source), map: null };
    },
  };
}
