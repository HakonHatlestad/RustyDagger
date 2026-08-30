import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEVEL_UP_STAT_GAIN, raiseFor, tryToLevel } from "../src/rules/levelling.js";

/** Levelling is pure arithmetic, so all of it is checked exactly against the Java build. */

const rules = readFileSync(
  fileURLToPath(new URL("../../baseline/rules.txt", import.meta.url)),
  "utf8",
);

describe("the experience curve, against the Java build", () => {
  const rows = [...rules.matchAll(/^level=(\d+) raise=(\d+) quests=(-?\d+)$/gm)].map((m) => ({
    level: Number(m[1]),
    raise: Number(m[2]),
    quests: Number(m[3]),
  }));

  it("covers levels 1 to 30", () => {
    expect(rows).toHaveLength(30);
    expect(rows[0]!.level).toBe(1);
    expect(rows[29]!.level).toBe(30);
  });

  it("matches the cost of every level", () => {
    for (const row of rows) {
      expect(raiseFor(row.level), `level ${row.level}`).toBe(row.raise);
    }
  });

  it("steepens by half again each level", () => {
    expect(raiseFor(1)).toBe(50);
    expect(raiseFor(2)).toBe(75);
    expect(raiseFor(3)).toBe(112);
    expect(raiseFor(4)).toBe(168);
  });
});

describe("levelling up, against the Java build", () => {
  const rows = [
    ...rules.matchAll(
      /^afterExp step=(\d+) levelled=(true|false) level=(\d+) exp=(-?\d+) guts=(-?\d+) wits=(-?\d+) charm=(-?\d+) fame=(-?\d+)$/gm,
    ),
  ].map((m) => ({
    step: Number(m[1]),
    levelled: m[2] === "true",
    level: Number(m[3]),
    exp: Number(m[4]),
    guts: Number(m[5]),
    fame: Number(m[6 + 2]),
  }));

  it("has steps to check", () => {
    expect(rows.length).toBeGreaterThan(8);
  });

  it("replays the whole run: levels, leftover experience, stats and fame", () => {
    // The harness starts a level-1 hero with 20 in each stat and grants 200 experience a step.
    let level = 1;
    let exp = 0;
    let guts = 20;
    let fame = 0;
    for (const row of rows) {
      exp += 200;
      const result = tryToLevel(level, exp);
      level = result.level;
      exp = result.exp;
      guts += result.statGain;
      fame += result.fameGain;
      expect(result.levelled, `step ${row.step} levelled`).toBe(row.levelled);
      expect(level, `step ${row.step} level`).toBe(row.level);
      expect(exp, `step ${row.step} exp`).toBe(row.exp);
      expect(guts, `step ${row.step} guts`).toBe(row.guts);
      expect(fame, `step ${row.step} fame`).toBe(row.fame);
    }
  });

  it("carries surplus experience into the next level rather than resetting it", () => {
    const r = tryToLevel(1, 200);
    expect(r.levelled).toBe(true);
    expect(r.exp).toBe(150);
  });

  it("does nothing when the cost is not met", () => {
    expect(tryToLevel(5, 10)).toEqual({
      levelled: false,
      level: 5,
      exp: 10,
      statGain: 0,
      fameGain: 0,
    });
  });

  it("grants fame equal to the new level, not a flat amount", () => {
    expect(tryToLevel(1, 9999).fameGain).toBe(2);
    expect(tryToLevel(9, 9999).fameGain).toBe(10);
  });

  it("grants two points of each stat", () => {
    expect(LEVEL_UP_STAT_GAIN).toBe(2);
    expect(tryToLevel(1, 9999).statGain).toBe(2);
  });
});
